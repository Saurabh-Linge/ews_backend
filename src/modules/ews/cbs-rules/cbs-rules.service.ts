import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../core/database/database.service';

@Injectable()
export class CbsRulesService {
  private readonly logger = new Logger(CbsRulesService.name);

  constructor(private readonly db: DatabaseService) {}

  async findAll() {
    const result = await this.db.query(
      `SELECT r.*
       FROM ews_cbs_rules r
       ORDER BY r.id ASC`,
    );
    // Since signal_ids is an array, we'll fetch signals on the frontend or join array manually if needed.
    // For simplicity, we just return the array and let frontend handle mapping with the full signals list.
    return result.rows;
  }

  async create(data: {
    name: string;
    expression: string;
    signal_ids?: number[];
    description?: string;
    risk_level?: string;
    applyRules?: boolean;
    tag?: string;
  }) {
    const result = await this.db.query(
      `INSERT INTO ews_cbs_rules (name, expression, signal_ids, description, risk_level, tag, enabled, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, CURRENT_TIMESTAMP) RETURNING *`,
      [
        data.name,
        data.expression,
        data.signal_ids && data.signal_ids.length ? data.signal_ids : '{}',
        data.description ?? '',
        data.risk_level ?? 'Medium',
        data.tag ?? 'cbs',
      ],
    );
    const rule = result.rows[0];
    // Only run the sweep for this specific new rule (not all rules)
    if (data.applyRules === true && rule?.enabled) {
      this.reflagSingleRule(rule.id).catch(e => this.logger.error('Background sweep error (create): ' + e.message));
    }
    return rule;
  }

  async update(id: number, data: any) {
    const fields = [
      'name',
      'expression',
      'signal_ids',
      'description',
      'risk_level',
      'enabled',
      'tag',
    ];
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const f of fields) {
      if (data[f] !== undefined) {
        updates.push(`${f}=$${idx++}`);
        values.push(data[f]);
      }
    }
    if (!updates.length) return this.findAll();
    updates.push('updated_at=CURRENT_TIMESTAMP');
    values.push(id);
    const result = await this.db.query(
      `UPDATE ews_cbs_rules SET ${updates.join(',')} WHERE id=$${idx} RETURNING *`,
      values,
    );
    const rule = result.rows[0];
    // Only re-sweep this specific rule if explicitly requested
    if (rule && data.applyRules === true) {
      this.reflagSingleRule(id).catch(e => this.logger.error('Background sweep error (update): ' + e.message));
    }
    return rule;
  }

  async remove(id: number) {
    // Step 1: Remove signals from this rule's signal_ids only
    // (We need signal_ids before deleting the rule)
    const ruleRes = await this.db.query('SELECT signal_ids FROM ews_cbs_rules WHERE id=$1', [id]);
    const signalIds: number[] = ruleRes.rows[0]?.signal_ids || [];

    // Step 2: Delete the rule
    await this.db.query('DELETE FROM ews_cbs_rules WHERE id=$1', [id]);

    // Step 3: Remove layer-2 signals that belonged exclusively to this rule's signal IDs
    // Only delete signals where the signal_id was from this rule AND it can no longer be
    // triggered by any other enabled rule
    if (signalIds.length > 0) {
      // Find which of our signal_ids are NOT referenced by any other enabled rule
      const otherRulesRes = await this.db.query(
        `SELECT DISTINCT unnest(signal_ids) AS sid FROM ews_cbs_rules WHERE enabled = true`
      );
      const remainingSignalIds = new Set(otherRulesRes.rows.map((r: any) => r.sid));
      const orphanedSignalIds = signalIds.filter(sid => !remainingSignalIds.has(sid));

      if (orphanedSignalIds.length > 0) {
        await this.db.query(
          `DELETE FROM ews_account_signals WHERE layer = 2 AND signal_id = ANY($1::int[])`,
          [orphanedSignalIds]
        );
      }
    }

    // Step 4: Clean up watch list entries with no remaining signals
    await this.db.query(`
      DELETE FROM ews_watch_list 
      WHERE id NOT IN (SELECT DISTINCT watch_list_id FROM ews_account_signals)
        AND id NOT IN (SELECT DISTINCT watch_list_id FROM ews_investigations)
        AND id NOT IN (SELECT DISTINCT watch_list_id FROM ews_escalations)
        AND id NOT IN (SELECT DISTINCT watch_list_id FROM ews_disputes)
    `);

    this.logger.log(`Rule ${id} deleted. Cleaned up orphaned signals for signal_ids: [${signalIds.join(',')}]`);
    return { success: true };
  }

  /**
   * Reapply a single rule — ADDITIVE ONLY.
   * Runs the sweep and upserts matching accounts into the watch list + signals.
   * Does NOT delete any signals (multiple rules share signal_ids, so deleting
   * by signal_id would wipe other rules' data).
   * Full signal cleanup only happens in reflagAll() (Apply All Rules button).
   */
  async reflagSingleRule(ruleId: number) {
    this.logger.log(`Starting single-rule sweep for rule id=${ruleId}...`);
    try {
      const ruleRes = await this.db.query(
        'SELECT * FROM ews_cbs_rules WHERE id = $1 AND enabled = true',
        [ruleId]
      );
      const rule = ruleRes.rows[0];
      if (!rule || !rule.signal_ids?.length) {
        this.logger.warn(`Rule ${ruleId} not found or not enabled — skipping single sweep.`);
        return;
      }

      const configRes = await this.db.query(
        "SELECT value FROM ews_risk_config WHERE key = 'software_date'"
      );
      const softwareDateStr = configRes.rows[0]?.value || null;

      // Compile expression — abort cleanly if it fails
      let ast: any, sqlCondition: string;
      try {
        ast = this.parseExpressionToAST(rule.expression);
        sqlCondition = this.compileASTToSQL(ast, softwareDateStr);
      } catch (err) {
        this.logger.error(`Rule "${rule.name}" (id=${ruleId}) failed to compile — aborting sweep: ${err.message}`);
        return;
      }

      // Run the sweep — purely additive, ON CONFLICT upserts existing entries
      await this.runCompiledRuleSweep(rule, ast, sqlCondition, softwareDateStr);

      this.logger.log(`Single-rule sweep completed for rule "${rule.name}" (id=${ruleId}).`);
    } catch (err) {
      this.logger.error(`Error during single-rule sweep (id=${ruleId}): ${err.message}`);
    }
  }

  // ─── Expression Engine ────────────────────────────────────────────────────────

  async reflagAll() {
    this.logger.log('Starting full CBS rules re-flagging sweep...');
    try {
      // 1. Fetch all enabled rules FIRST
      const rulesRes = await this.db.query('SELECT * FROM ews_cbs_rules WHERE enabled = true');
      const rules = rulesRes.rows;

      // 2. Fetch software date
      const configRes = await this.db.query(
        "SELECT value FROM ews_risk_config WHERE key = 'software_date'",
      );
      const softwareDateStr = configRes.rows[0]?.value || null;

      // 3. Pre-validate / compile every rule BEFORE wiping anything
      //    If a rule fails to compile, it is skipped with a warning (not a full crash)
      const compiledRules: { rule: any; ast: any; sqlCondition: string }[] = [];
      for (const rule of rules) {
        if (!rule.signal_ids?.length) continue;
        try {
          const ast = this.parseExpressionToAST(rule.expression);
          const sqlCondition = this.compileASTToSQL(ast, softwareDateStr);
          compiledRules.push({ rule, ast, sqlCondition });
        } catch (err) {
          this.logger.warn(`Skipping rule "${rule.name}" — failed to compile: ${err.message}`);
        }
      }

      // 4. Only NOW wipe layer-2 signals (all rules pre-validated — no surprise wipe)
      await this.db.query('DELETE FROM ews_account_signals WHERE layer = 2');

      // 5. Delete watch list entries that have no signals and no active relations
      await this.db.query(`
        DELETE FROM ews_watch_list 
        WHERE id NOT IN (SELECT DISTINCT watch_list_id FROM ews_account_signals)
          AND id NOT IN (SELECT DISTINCT watch_list_id FROM ews_investigations)
          AND id NOT IN (SELECT DISTINCT watch_list_id FROM ews_escalations)
          AND id NOT IN (SELECT DISTINCT watch_list_id FROM ews_disputes)
      `);

      // 6. Run each pre-compiled rule sweep
      for (const compiled of compiledRules) {
        await this.runCompiledRuleSweep(compiled.rule, compiled.ast, compiled.sqlCondition, softwareDateStr);
      }
      this.logger.log('Full CBS rules re-flagging sweep completed successfully.');
    } catch (err) {
      this.logger.error(`Error during full re-flagging: ${err.message}`);
    }
  }

  async runBackgroundRuleSweep(ruleId: number) {
    const ruleRes = await this.db.query(
      `SELECT * FROM ews_cbs_rules WHERE id = $1 AND enabled = true`,
      [ruleId],
    );
    const rule = ruleRes.rows[0];
    if (!rule || !rule.signal_ids?.length) return;

    this.logger.log(`Starting background sweep for rule ${rule.name}`);
    try {
      const configRes = await this.db.query(
        "SELECT value FROM ews_risk_config WHERE key = 'software_date'",
      );
      const softwareDateStr = configRes.rows[0]?.value || null;
      const timestampSql = softwareDateStr ? `'${softwareDateStr} 12:00:00'::TIMESTAMP` : 'CURRENT_TIMESTAMP';

      const ast = this.parseExpressionToAST(rule.expression);
      const sqlCondition = this.compileASTToSQL(ast, softwareDateStr);

      let matchSql;
      let riskSql;

      if (ast.type === 'IF_BLOCK') {
        matchSql = `(${sqlCondition}) IS NOT NULL`;
        riskSql = sqlCondition;
      } else {
        matchSql = `(${sqlCondition}) IS TRUE`;
        riskSql = 'NULL';
      }
      
      const insertQuery = `
        WITH evaluated AS (
          SELECT account_id,
                 long_name,
                 branch_code,
                 scheme_desc,
                 (${matchSql}) as is_match,
                 (${riskSql}) as computed_risk
          FROM ews_loan_dump 
        ),
        matched AS (
          SELECT * FROM evaluated WHERE is_match
        ),
        inserted_watch AS (
          INSERT INTO ews_watch_list (account_id, borrower_name, branch, loan_type, source, risk_level, status, added_at)
          SELECT 
            account_id, 
            COALESCE(NULLIF(long_name, ''), 'Customer ' || account_id),
            branch_code,
            scheme_desc,
            'System',
            computed_risk,
            'Pending review',
            ${timestampSql}
          FROM matched
          ON CONFLICT (account_id) WHERE status != 'Resolved' DO UPDATE SET 
            updated_at = ${timestampSql},
            risk_level = (
             CASE 
                 WHEN EXCLUDED.risk_level = 'High' OR ews_watch_list.risk_level = 'High' THEN 'High'
                 WHEN EXCLUDED.risk_level = 'Medium' OR ews_watch_list.risk_level = 'Medium' THEN 'Medium'
                 WHEN EXCLUDED.risk_level = 'Low' OR ews_watch_list.risk_level = 'Low' THEN 'Low'
                 ELSE COALESCE(EXCLUDED.risk_level, ews_watch_list.risk_level)
               END
            )
          RETURNING id as watch_list_id, account_id
        ),
        existing_watch AS (
          SELECT id as watch_list_id, account_id FROM ews_watch_list 
          WHERE account_id IN (SELECT account_id FROM matched)
        ),
        active_watch AS (
          SELECT * FROM inserted_watch
          UNION
          SELECT * FROM existing_watch WHERE account_id NOT IN (SELECT account_id FROM inserted_watch)
        ),
        inserted_signals AS (
          INSERT INTO ews_account_signals (watch_list_id, signal_id, layer, details, triggered_at)
          SELECT 
            aw.watch_list_id,
            s.signal_id,
            2,
            $1::jsonb,
            ${timestampSql}
          FROM active_watch aw
          CROSS JOIN UNNEST($2::int[]) as s(signal_id)
          ON CONFLICT (watch_list_id, signal_id, layer) DO UPDATE
          SET details = jsonb_set(
            COALESCE(ews_account_signals.details, '{}'::jsonb),
            '{rules}',
            COALESCE(ews_account_signals.details->'rules', '[]'::jsonb) || ($1::jsonb->'rules')
          )
          RETURNING *
        )
        SELECT COUNT(*) as count FROM active_watch
      `;

      const res = await this.db.query(insertQuery, [
        JSON.stringify({ rules: [rule.name] }),
        rule.signal_ids
      ]);

      const matchCount = res.rows[0]?.count || 0;
      this.logger.log(`Background sweep completed for rule "${rule.name}". Flagged ${matchCount} accounts.`);
    } catch (err) {
      this.logger.error(`Error during background sweep for rule ${rule.name}: ${err.message}`);
    }
  }

  /**
   * Run all RO rules (which rely on account answers) against a SINGLE account.
   * This is triggered immediately when an RO saves answers.
   */
  async evaluateAccountForRoRules(accountId: number) {
    this.logger.log(`Evaluating RO rules for account ${accountId}...`);
    try {
      // Get all enabled RO question rules
      const roRulesRes = await this.db.query(
        `SELECT * FROM ews_cbs_rules WHERE enabled = true AND name LIKE 'RO Q%' AND cardinality(signal_ids) > 0`
      );
      const roRules = roRulesRes.rows;
      if (roRules.length === 0) return;

      const configRes = await this.db.query("SELECT value FROM ews_risk_config WHERE key = 'software_date'");
      const softwareDateStr = configRes.rows[0]?.value || null;
      const timestampSql = softwareDateStr ? `'${softwareDateStr} 12:00:00'::TIMESTAMP` : 'CURRENT_TIMESTAMP';

      let firedSignalIds: number[] = [];
      let firedSignalsList: { rule_name: string, signal_ids: number[], risk: string }[] = [];
      let maxRisk = 'Low';

      const selectCases = [];
      const validRules = [];

      for (const rule of roRules) {
        try {
          const ast = this.parseExpressionToAST(rule.expression);
          const sqlCondition = this.compileASTToSQL(ast, softwareDateStr);
          
          let valSql = ast.type === 'IF_BLOCK' ? sqlCondition : `CASE WHEN ${sqlCondition} THEN '${rule.risk_level.replace(/'/g, "''")}' ELSE NULL END`;
          
          selectCases.push(`${valSql} as r_${validRules.length}`);
          validRules.push(rule);
        } catch (err) {
          this.logger.warn(`Failed to parse RO rule ${rule.name}: ${err.message}`);
        }
      }

      if (selectCases.length > 0) {
        const evalQuery = `
          SELECT ${selectCases.join(', ')}
          FROM ews_loan_dump 
          WHERE id = $1
        `;
        const evalRes = await this.db.query(evalQuery, [accountId]);
        const resultRow = evalRes.rows[0];

        if (resultRow) {
          for (let i = 0; i < validRules.length; i++) {
            const dynamicRisk = resultRow[`r_${i}`];
            if (dynamicRisk) {
              const rule = validRules[i];
              firedSignalIds.push(...rule.signal_ids);
              firedSignalsList.push({ rule_name: rule.name, signal_ids: rule.signal_ids, risk: dynamicRisk });
              
              if (dynamicRisk === 'High') maxRisk = 'High';
              if (dynamicRisk === 'Medium' && maxRisk === 'Low') maxRisk = 'Medium';
              if (dynamicRisk === 'Very High') maxRisk = 'Very High';
            }
          }
        }
      }

      // Delete previously triggered RO signals that are no longer valid for this account
      const wlCheck = await this.db.query(
        `SELECT w.id FROM ews_watch_list w JOIN ews_loan_dump d ON w.account_id = d.account_id WHERE d.id = $1 AND w.status != 'Resolved'`,
        [accountId]
      );
      if (wlCheck.rows[0]?.id) {
        await this.db.query(
          `DELETE FROM ews_account_signals 
           WHERE watch_list_id = $1 AND layer = 2 
           AND details->>'source' = 'RO Questionnaire' 
           AND signal_id != ALL($2::int[])`,
          [wlCheck.rows[0].id, firedSignalIds.length > 0 ? [...new Set(firedSignalIds)] : [0]]
        );
      }

      if (firedSignalIds.length === 0) {
        this.logger.log(`No RO rules fired for account ${accountId}.`);
        return { firedSignals: [], maxRisk: 'Low' };
      }

      const dumpRes = await this.db.query('SELECT account_id, long_name, branch_code, scheme_desc FROM ews_loan_dump WHERE id = $1', [accountId]);
      const row = dumpRes.rows[0];

      // Upsert into watch list
      const wlRes = await this.db.query(
        `INSERT INTO ews_watch_list (account_id, borrower_name, branch, loan_type, source, risk_level, status, added_at)
         VALUES ($1, $2, $3, $4, 'System', $5, 'Pending review', ${timestampSql})
         ON CONFLICT (account_id) WHERE status != 'Resolved' DO UPDATE SET 
           updated_at = ${timestampSql},
           risk_level = (
             CASE 
               WHEN EXCLUDED.risk_level = 'Very High' OR ews_watch_list.risk_level = 'Very High' THEN 'Very High'
               WHEN EXCLUDED.risk_level = 'High' OR ews_watch_list.risk_level = 'High' THEN 'High'
               WHEN EXCLUDED.risk_level = 'Medium' OR ews_watch_list.risk_level = 'Medium' THEN 'Medium'
               WHEN EXCLUDED.risk_level = 'Low' OR ews_watch_list.risk_level = 'Low' THEN 'Low'
               ELSE COALESCE(EXCLUDED.risk_level, ews_watch_list.risk_level)
             END
           )
         RETURNING id`,
        [row.account_id, row.long_name || ('Customer ' + row.account_id), row.branch_code, row.scheme_desc, maxRisk]
      );
      const watchListId = wlRes.rows[0]?.id;
      if (!watchListId) return { firedSignals: [], maxRisk: 'Low' };

      // Insert signals in a single batch
      const uniqueSignalIds = [...new Set(firedSignalIds)];

      if (uniqueSignalIds.length > 0) {
        const values = [];
        const queryParams = [];
        let pIdx = 1;

        for (const signalId of uniqueSignalIds) {
          // Find all rules that fired this specific signal
          const triggeredByRules = firedSignalsList
             .filter(f => f.signal_ids.includes(signalId))
             .map(f => ({ name: f.rule_name, risk: f.risk }));

          values.push(`($${pIdx++}, $${pIdx++}, 2, $${pIdx++}::jsonb, ${timestampSql})`);
          queryParams.push(watchListId, signalId, JSON.stringify({ 
             source: 'RO Questionnaire',
             rules: triggeredByRules
          }));
        }

        await this.db.query(
          `INSERT INTO ews_account_signals (watch_list_id, signal_id, layer, details, triggered_at)
           VALUES ${values.join(', ')}
           ON CONFLICT (watch_list_id, signal_id, layer) DO UPDATE SET 
             details = EXCLUDED.details,
             triggered_at = EXCLUDED.triggered_at`,
          queryParams
        );
      }
      this.logger.log(`Evaluated RO rules for account ${accountId}. Fired signals: [${uniqueSignalIds.join(',')}]`);

      // Retrieve signal names for UI
      const sigRes = await this.db.query(`SELECT id, name, number FROM ews_signals WHERE id = ANY($1)`, [uniqueSignalIds]);
      const sigMap = new Map(sigRes.rows.map(r => [r.id, { name: r.name, number: r.number }]));

      const results = firedSignalsList.map(item => ({
         rule_name: item.rule_name,
         signals: item.signal_ids.map(id => {
            const sm = sigMap.get(id);
            return sm ? { id, name: sm.name, number: sm.number } : null;
         }).filter(Boolean)
      }));

      return { firedSignals: results, maxRisk };

    } catch (err) {
      this.logger.error(`Error in evaluateAccountForRoRules for ${accountId}: ${err.message}`);
      return { firedSignals: [], maxRisk: 'Low', error: err.message };
    }
  }

  async runCompiledRuleSweep(rule: any, ast: any, sqlCondition: string, softwareDateStr: string | null) {
    this.logger.log(`Running pre-compiled sweep for rule "${rule.name}"`);
    const timestampSql = softwareDateStr ? `'${softwareDateStr} 12:00:00'::TIMESTAMP` : 'CURRENT_TIMESTAMP';

    let matchSql: string;
    let riskSql: string;

    if (ast.type === 'IF_BLOCK') {
      matchSql = `(${sqlCondition}) IS NOT NULL`;
      riskSql = sqlCondition;
    } else {
      matchSql = `(${sqlCondition}) IS TRUE`;
      riskSql = 'NULL';
    }

    const insertQuery = `
      WITH evaluated AS (
        SELECT account_id,
               long_name,
               branch_code,
               scheme_desc,
               (${matchSql}) as is_match,
               (${riskSql}) as computed_risk
        FROM ews_loan_dump 
      ),
      matched AS (
        SELECT * FROM evaluated WHERE is_match
      ),
      inserted_watch AS (
        INSERT INTO ews_watch_list (account_id, borrower_name, branch, branch_id, loan_type, source, risk_level, status, added_at)
        SELECT 
          m.account_id, 
          COALESCE(NULLIF(m.long_name, ''), 'Customer ' || m.account_id),
          m.branch_code,
          (SELECT id FROM ews_branches WHERE code = m.branch_code LIMIT 1),
          m.scheme_desc,
          'System',
          m.computed_risk,
          'Pending review',
          ${timestampSql}
        FROM matched m
        ON CONFLICT (account_id) WHERE status != 'Resolved' DO UPDATE SET 
          updated_at = ${timestampSql},
          branch_id = (SELECT id FROM ews_branches WHERE code = EXCLUDED.branch LIMIT 1),
          risk_level = (
             CASE 
               WHEN EXCLUDED.risk_level = 'High' OR ews_watch_list.risk_level = 'High' THEN 'High'
               WHEN EXCLUDED.risk_level = 'Medium' OR ews_watch_list.risk_level = 'Medium' THEN 'Medium'
               WHEN EXCLUDED.risk_level = 'Low' OR ews_watch_list.risk_level = 'Low' THEN 'Low'
               ELSE COALESCE(EXCLUDED.risk_level, ews_watch_list.risk_level)
             END
          )
        RETURNING id as watch_list_id, account_id
      ),
      existing_watch AS (
        SELECT id as watch_list_id, account_id FROM ews_watch_list 
        WHERE account_id IN (SELECT account_id FROM matched)
      ),
      active_watch AS (
        SELECT * FROM inserted_watch
        UNION
        SELECT * FROM existing_watch WHERE account_id NOT IN (SELECT account_id FROM inserted_watch)
      ),
      inserted_signals AS (
        INSERT INTO ews_account_signals (watch_list_id, signal_id, layer, details, triggered_at)
        SELECT 
          aw.watch_list_id,
          s.signal_id,
          2,
          $1::jsonb,
          ${timestampSql}
        FROM active_watch aw
        CROSS JOIN UNNEST($2::int[]) as s(signal_id)
        ON CONFLICT (watch_list_id, signal_id, layer) DO UPDATE
        SET details = jsonb_set(
          COALESCE(ews_account_signals.details, '{}'::jsonb),
          '{rules}',
          COALESCE(ews_account_signals.details->'rules', '[]'::jsonb) || ($1::jsonb->'rules')
        )
        RETURNING *
      )
      SELECT COUNT(*) as count FROM active_watch
    `;

    const res = await this.db.query(insertQuery, [
      JSON.stringify({ rules: [rule.name] }),
      rule.signal_ids
    ]);

    const matchCount = res.rows[0]?.count || 0;
    this.logger.log(`Compiled sweep completed for rule "${rule.name}". Flagged ${matchCount} accounts.`);
  }

  async simulateRules(
    rules: { name: string; expression: string }[], 
    minMatchCount: number = 1, 
    page: number = 1, 
    limit: number = 50, 
    branchCode?: string,
    watchListFilter: 'all' | 'flagged' | 'new' = 'all'
  ) {
    if (!rules || rules.length === 0) {
      return { total: 0, totalMatched: 0, flaggedTotal: 0, newTotal: 0, data: [] };
    }

    const configRes = await this.db.query(
      "SELECT value FROM ews_risk_config WHERE key = 'software_date'",
    );
    const softwareDateStr = configRes.rows[0]?.value || null;

    const compiledRules = rules.map(r => {
      try {
        const ast = this.parseExpressionToAST(r.expression);
        const sql = this.compileASTToSQL(ast, softwareDateStr, 'd');
        const isIfBlock = ast.type === 'IF_BLOCK';
        return { name: r.name, sql, isIfBlock };
      } catch (err) {
        throw new Error(`Rule "${r.name}" has an invalid expression: ${err.message}`);
      }
    });

    const ruleCases = compiledRules.map(r => {
      const escapedName = r.name.replace(/'/g, "''");
      if (r.isIfBlock) {
        return `CASE WHEN (${r.sql}) IS NOT NULL THEN '${escapedName}' ELSE NULL END`;
      } else {
        return `CASE WHEN (${r.sql}) THEN '${escapedName}' ELSE NULL END`;
      }
    });

    const ruleArraySql = `ARRAY_REMOVE(ARRAY[${ruleCases.join(', ')}], NULL)`;
    const branchFilter = branchCode ? `WHERE d.branch_code = '${branchCode.replace(/'/g, "''")}'` : '';
    
    let watchListCond = '';
    if (watchListFilter === 'flagged') {
      watchListCond = 'WHERE e.watch_list_id IS NOT NULL';
    } else if (watchListFilter === 'new') {
      watchListCond = 'WHERE e.watch_list_id IS NULL';
    }

    const offset = (page - 1) * limit;

    const query = `
      WITH matches AS (
        SELECT d.account_id, d.account_no, d.long_name, d.branch_code, d.scheme_desc, d.balance,
               w.id as watch_list_id,
               ${ruleArraySql} as matched_rules
        FROM ews_loan_dump d
        LEFT JOIN ews_watch_list w ON w.account_id = d.account_id AND w.status != 'Resolved'
        ${branchFilter}
      ),
      evaluated AS (
        SELECT account_id, account_no, long_name, branch_code, scheme_desc, balance, watch_list_id, matched_rules,
               CARDINALITY(matched_rules) as hit_count
        FROM matches
        WHERE CARDINALITY(matched_rules) >= $1
      ),
      totals AS (
        SELECT 
          COUNT(*)::INT as total_matched,
          COUNT(watch_list_id)::INT as total_flagged
        FROM evaluated
      ),
      filtered AS (
        SELECT e.*, t.total_matched, t.total_flagged,
               COUNT(*) OVER() as filtered_count
        FROM evaluated e
        CROSS JOIN totals t
        ${watchListCond}
      )
      SELECT * FROM filtered
      ORDER BY hit_count DESC, account_id ASC
      LIMIT $2 OFFSET $3
    `;

    const res = await this.db.query(query, [minMatchCount, limit, offset]);

    if (res.rows.length === 0) {
      const countOnlyQuery = `
        WITH matches AS (
          SELECT d.account_id, w.id as watch_list_id, ${ruleArraySql} as matched_rules
          FROM ews_loan_dump d
          LEFT JOIN ews_watch_list w ON w.account_id = d.account_id AND w.status != 'Resolved'
          ${branchFilter}
        ),
        evaluated AS (
          SELECT watch_list_id FROM matches WHERE CARDINALITY(matched_rules) >= $1
        )
        SELECT COUNT(*)::INT as total_matched, COUNT(watch_list_id)::INT as total_flagged FROM evaluated
      `;
      const tRes = await this.db.query(countOnlyQuery, [minMatchCount]);
      const totalMatched = tRes.rows[0]?.total_matched || 0;
      const totalFlagged = tRes.rows[0]?.total_flagged || 0;
      return {
        total: 0,
        totalMatched,
        flaggedTotal: totalFlagged,
        newTotal: totalMatched - totalFlagged,
        data: []
      };
    }

    const totalMatched = parseInt(res.rows[0].total_matched, 10);
    const totalFlagged = parseInt(res.rows[0].total_flagged, 10);
    const filteredCount = parseInt(res.rows[0].filtered_count, 10);

    const data = res.rows.map(({ total_matched, total_flagged, filtered_count, ...rest }) => rest);

    return {
      total: filteredCount,
      totalMatched,
      flaggedTotal: totalFlagged,
      newTotal: totalMatched - totalFlagged,
      data
    };
  }

  private compileASTToSQL(node: any, softwareDateStr?: string, tableAlias: string = ''): string {
    if (!node) return 'FALSE';
    const colPrefix = tableAlias ? `${tableAlias}.` : '';

    switch (node.type) {
      case 'IF_BLOCK': {
        let sql = '(CASE ';
        for (const branch of node.branches) {
          const condSql = this.compileASTToSQL(branch.condition, softwareDateStr, tableAlias);
          const riskSql = this.compileASTToSQL(branch.risk, softwareDateStr, tableAlias);
          sql += `WHEN ${condSql} THEN ${riskSql} `;
        }
        if (node.defaultRisk) {
          sql += `ELSE ${this.compileASTToSQL(node.defaultRisk, softwareDateStr, tableAlias)} `;
        } else {
          sql += `ELSE NULL `;
        }
        sql += 'END)';
        return sql;
      }
      case 'LITERAL':
        if (node.value === null) return 'NULL';
        if (typeof node.value === 'string') return `'${node.value.replace(/'/g, "''")}'`;
        if (node.value instanceof Date) {
          return `'${node.value.toISOString().split('T')[0]}'::DATE`;
        }
        if (typeof node.value === 'boolean') return node.value ? 'TRUE' : 'FALSE';
        return String(node.value);
        
      case 'VARIABLE': {
        const token = String(node.name).toLowerCase();
        
        const todaySql = softwareDateStr ? `'${softwareDateStr}'::DATE` : 'CURRENT_DATE';
        const nowSql = softwareDateStr ? `'${softwareDateStr} 12:00:00'::TIMESTAMP` : 'CURRENT_TIMESTAMP';
        const todayDaysSql = softwareDateStr ? `(EXTRACT(EPOCH FROM '${softwareDateStr}'::DATE)/86400)` : '(EXTRACT(EPOCH FROM CURRENT_DATE)/86400)';
        
        // System variables
        if (token === 'today') return todaySql;
        if (token === 'now') return nowSql;
        if (token === 'today_days') return todayDaysSql;
        
        // Derived date diffs
        if (token === 'days_since_open') return `(${todaySql} - ${colPrefix}account_open_date::DATE)`;
        if (token === 'days_since_sanc') return `(${todaySql} - ${colPrefix}sanc_date::DATE)`;
        if (token === 'days_since_disb') return `(${todaySql} - ${colPrefix}disbursement_date::DATE)`;
        if (token === 'days_since_npa') return `(${todaySql} - ${colPrefix}npa_date::DATE)`;
        if (token === 'days_since_insp') return `(${todaySql} - ${colPrefix}insp_date::DATE)`;
        if (token === 'days_until_exp') return `(${colPrefix}exp_date::DATE - ${todaySql})`;
        if (token === 'days_overdue') return `(CASE WHEN ${colPrefix}exp_date::DATE < ${todaySql} THEN (${todaySql} - ${colPrefix}exp_date::DATE) ELSE 0 END)`;
        
        // Derived booleans
        if (token === 'is_expired') return `(${colPrefix}exp_date < ${todaySql})`;
        if (token === 'is_npa') return `(${colPrefix}npa = 'Y')`;
        
        // If not a standard column, assume it's a dynamic question
        const isStandardColumn = [
          'id', 'branch_code', 'customer_no', 'product_code', 'product_desc', 'scheme_code',
          'scheme_desc', 'account_no', 'account_id', 'long_name', 'member_type', 'account_open_date',
          'sanc_date', 'disbursement_date', 'exp_date', 'instal_start_date', 'insp_date',
          'suit_file_dt', 'birth_date', 'charge_noted_date', 'valuation_date', 'npa_date',
          'effective_from_date', 'policy_due_date', 'policy_commencement_date', 'sanc_authority',
          'tot_sanc_limit', 'disbursement_amount', 'principal_outstanding', 'interest_outstanding',
          'charges_os', 'interest_receivable_oir', 'interest_receivable_oir2', 'balance',
          'security_amount', 'standard_int_rate', 'int_rate', 'no_of_instl', 'instal_amt',
          'award_amt', 'cibil_score', 'plantand_machinery', 'trunover_details',
          'borrower_property_count', 'lninstfreq', 'npa', 'loan_against_deposit',
          'priority_sector_yn', 'non_priority_sector', 'priority_sector_category',
          'sub_priority_sector_category', 'sub_priority_sector_category1',
          'sub_priority_sector_category2', 'weaker_sector_yn', 'weaker_sector_category',
          'sub_weaker_sector_code', 'purpose_code', 'sub_purpose_code', 'bank_cust_rating',
          'pan_no', 'industry_type', 'industry_sub_type', 'govt_prog_yn', 'address1',
          'award_status', 'membership_no', 'gender', 'cersai_charge_noted',
          'property_asset_id', 'interest_id', 'udyam_reg_number', 'enduse', 'credit_rating',
          'ckyc_no', 'is_existing_home_owner', 'insurance_company', 'policy_type',
          'policy_number', 'security_type', 'upload_id', 'uploaded_at'
        ].includes(token);

        if (!isStandardColumn) {
          // Compile as a subquery against ews_account_question_answers
          const accIdRef = tableAlias ? `${tableAlias}.account_id` : 'account_id';
          const idRef = tableAlias ? `${tableAlias}.id` : 'id';
          return `(SELECT answer_value FROM ews_account_question_answers qa JOIN ews_loan_questions q ON q.id = qa.question_id WHERE (qa.account_id::text = ${accIdRef}::text OR qa.account_id::text = ${idRef}::text) AND q.reference_name = '${token}' AND q.is_active = true LIMIT 1)`;
        }

        return `${colPrefix}${token}`;
      }
      
      case 'OR':
        return `(${this.compileASTToSQL(node.left, softwareDateStr, tableAlias)} OR ${this.compileASTToSQL(node.right, softwareDateStr, tableAlias)})`;
      case 'AND':
        return `(${this.compileASTToSQL(node.left, softwareDateStr, tableAlias)} AND ${this.compileASTToSQL(node.right, softwareDateStr, tableAlias)})`;
      case 'NOT':
        return `(NOT ${this.compileASTToSQL(node.child, softwareDateStr, tableAlias)})`;
      case 'ABS':
        return `ABS(${this.compileASTToSQL(node.child, softwareDateStr, tableAlias)})`;
      case 'BOOLEAN_CAST':
        return `(${this.compileASTToSQL(node.child, softwareDateStr, tableAlias)} IS TRUE)`;
      
      case 'BETWEEN': {
        const left = this.compileASTToSQL(node.left, softwareDateStr, tableAlias);
        const low = this.compileASTToSQL(node.low, softwareDateStr, tableAlias);
        const high = this.compileASTToSQL(node.high, softwareDateStr, tableAlias);
        return `(${left} BETWEEN ${low} AND ${high})`;
      }
        
      case 'COMPARE': {
        const left = this.compileASTToSQL(node.left, softwareDateStr, tableAlias);
        let op = String(node.op).toUpperCase();
        
        if (op === 'IN' || op === 'NOT IN') {
          const listSql = node.right.items.map((i: any) => this.compileASTToSQL(i, softwareDateStr, tableAlias)).join(', ');
          return `(${left} ${op} (${listSql}))`;
        }

        const right = this.compileASTToSQL(node.right, softwareDateStr, tableAlias);
        
        if (op === 'LIKE') op = 'ILIKE';
        if (op === 'CONTAINS') return `(${left} ILIKE '%' || ${right} || '%')`;
        if (op === 'NOT CONTAINS') return `(${left} NOT ILIKE '%' || ${right} || '%')`;
        
        // Handle NULL comparisons properly in SQL
        if (right === 'NULL') {
          if (op === '=') return `(${left} IS NULL)`;
          if (op === '!=') return `(${left} IS NOT NULL)`;
        }
        
        return `(${left} ${op} ${right})`;
      }
      
      case 'LIST':
        return '(' + node.items.map((i: any) => this.compileASTToSQL(i, softwareDateStr, tableAlias)).join(', ') + ')';
        
      case 'ARITHMETIC':
        return `(${this.compileASTToSQL(node.left, softwareDateStr, tableAlias)} ${node.op} ${this.compileASTToSQL(node.right, softwareDateStr, tableAlias)})`;
    }
    return 'FALSE';
  }

  async getSoftwareDate(): Promise<Date | null> {
    try {
      const res = await this.db.query(
        "SELECT value FROM ews_risk_config WHERE key = 'software_date'",
      );
      const val = res.rows[0]?.value;
      if (!val) return null;
      const parts = val.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        return new Date(year, month, day, 0, 0, 0, 0);
      }
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    } catch (e) {
      this.logger.error('Failed to fetch software date config: ' + e.message);
      return null;
    }
  }

  /**
   * Evaluate all enabled rules against a loan dump row.
   * Returns array of signal IDs that fired.
   */
  async evaluateRow(row: Record<string, any>): Promise<number[]> {
    const rules = await this.findAll();
    const softwareDate = await this.getSoftwareDate();
    const context = this.buildContext(row, softwareDate);

    const accountId = row['id'] || row['ID'];
    if (accountId) {
      const answersRes = await this.db.query(
        `SELECT q.reference_name, a.answer_value 
         FROM ews_loan_questions q
         LEFT JOIN ews_account_question_answers a ON a.question_id = q.id AND a.account_id = $1
         WHERE q.is_active = true`,
        [accountId]
      );
      for (const ans of answersRes.rows) {
        if (ans.reference_name) {
          context[ans.reference_name] = ans.answer_value;
        }
      }
    }

    const firedSignals: number[] = [];

    for (const rule of rules) {
      if (!rule.enabled) continue;
      try {
        const result = this.evaluate(rule.expression, context);
        if (result) {
          if (rule.signal_ids && rule.signal_ids.length > 0) {
            firedSignals.push(...rule.signal_ids);
          }
        }
      } catch (e) {
        this.logger.warn(`Rule "${rule.name}" eval error: ${e.message}`);
      }
    }
    return firedSignals;
  }

  /**
   * Validate an expression before saving (dry-run against dummy context)
   */
  async validateExpression(expression: string): Promise<{ valid: boolean; error?: string }> {
    const dummyContext: Record<string, any> = {
      TODAY: new Date(),
      TODAY_DAYS: 0,
      NOW: new Date(),
      principal_outstanding: 0,
      interest_outstanding: 0,
      balance: 0,
      int_rate: 0,
      npa: 'N',
      bank_cust_rating: 'STANDARD',
      exp_date: new Date(),
    };

    // Inject dynamic loan questions for validation
    const questionsRes = await this.db.query('SELECT reference_name FROM ews_loan_questions WHERE is_active = true');
    for (const q of questionsRes.rows) {
      if (q.reference_name) {
        dummyContext[q.reference_name] = null;
      }
    }

    try {
      this.evaluate(expression, dummyContext);
      return { valid: true };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }

  // ─── Internal Expression Evaluator ───────────────────────────────────────────

  public buildContext(row: Record<string, any>, softwareDate?: Date): Record<string, any> {
    const today = softwareDate ? new Date(softwareDate.getTime()) : new Date();
    today.setHours(0, 0, 0, 0);

    const parseDate = (val: any): Date | null => {
      if (!val) return null;
      if (val instanceof Date) return val;
      // Excel serial number
      if (typeof val === 'number') {
        const d = new Date((val - 25569) * 86400 * 1000);
        return d;
      }
      
      let str = String(val).trim();
      // Support DD-MM-YYYY or DD/MM/YYYY
      const dmY = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(str);
      if (dmY) {
        str = `${dmY[3]}-${dmY[2].padStart(2, '0')}-${dmY[1].padStart(2, '0')}`;
      }
      
      const d = new Date(str);
      return isNaN(d.getTime()) ? null : d;
    };

    const daysDiff = (d: Date | null): number => {
      if (!d) return 0;
      const tDate = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
      const dDate = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
      return Math.floor((tDate - dDate) / (1000 * 60 * 60 * 24));
    };

    const toNum = (val: any): number => {
      if (!val) return 0;
      const num = Number(String(val).replace(/,/g, '').trim());
      return isNaN(num) ? 0 : num;
    };

    // Map all LOAN DUMP columns to snake_case context keys
    const ctx: Record<string, any> = {
      // System variables
      TODAY: today,
      TODAY_DAYS: 0,
      NOW: new Date(),

      // All loan dump columns (snake_case mapping)
      branch_code: String(row['Branch Code'] || row['branch_code'] || ''),
      customer_no: row['Customer No'] || row['customer_no'] || null,
      product_code: row['Product Code'] || row['product_code'] || null,
      product_desc: row['Product Desc'] || '',
      scheme_code: row['Scheme Code'] || row['scheme_code'] || null,
      scheme_desc: row['Scheme Desc'] || '',
      account_no: row['Accountno'] || row['account_no'] || '',
      account_id:
        row['accountid'] || row['AccountId'] || row['account_id'] || '',
      long_name: row['Long Name'] || row['long_name'] || '',
      member_type: row['Member Type'] || '',
      sanc_authority: row['Sanc Authority'] || '',
      tot_sanc_limit: toNum(row['Tot Sanc Limit'] || row['tot_sanc_limit']),
      disbursement_amount: toNum(row['Disbursement Amount'] || row['disbursement_amount']),
      principal_outstanding: toNum(row['Principal Outstanding'] || row['principal_outstanding']),
      interest_outstanding: toNum(row['Interest Out Standing'] || row['interest_outstanding']),
      charges_os: toNum(row['Chrgs OS'] || row['charges_os']),
      interest_receivable_oir: toNum(
        row['Interest Receivable / OIR  - This will be unrealized interest not debited to loan account in case of NPA'] || 
        row['interest_receivable_oir']
      ),
      interest_receivable_oir2: toNum(row['Interest Receivable / OIR '] || row['interest_receivable_oir2']),
      balance: toNum(row['Balance'] || row['Balance '] || row['Balance Outstanding INR'] || row['balance']),
      lninstfreq: row['LNINSTFREQ'] || row['lninstfreq'] || '',
      npa: row['NPA'] || row['npa'] || 'N',
      security_amount: toNum(row['Security Amount'] || row['security_amount']),
      security_type: row['Security Type'] || row['security_type'] || '',
      standard_int_rate: toNum(row['Standard Int Rate'] || row['standard_int_rate']),
      int_rate: toNum(row['Int Rate'] || row['int_rate'] || row['Balance Outstanding INR']),
      no_of_instl: parseInt(row['Noof Instl'] || row['no_of_instl']) || 0,
      instal_amt: toNum(row['Instal Amt'] || row['instal_amt']),
      loan_against_deposit: row['Loan Against Deposit'] || 'N',
      priority_sector_yn: row['Priority Sector YN'] || 'N',
      non_priority_sector: row['NONPriority Sector'] || '',
      priority_sector_category: row['Priority Sector Category'] || '',
      weaker_sector_yn: row['Weaker Sector YN'] || 'N',
      weaker_sector_category: row['Weaker Sector Category'] || '',
      purpose_code: row['Purpose Code'] || '',
      sub_purpose_code: row['Sub Purpose Code'] || '',
      bank_cust_rating:
        row['Bank Cust Rating'] || row['bank_cust_rating'] || 'STANDARD',
      pan_no: row['Pan No'] || '',
      industry_type: row['Industry Type'] || '',
      industry_sub_type: row['Industry Sub Type'] || '',
      govt_prog_yn: row['Govt Prog YN'] || 'N',
      address1: row['Addres1'] || '',
      award_amt: parseFloat(row['Award Amt'] || row['award_amt']) || 0,
      award_status: row['Awardstatus'] || '',
      membership_no: row['Membership No'] || '',
      gender: row['Gender'] || '',
      cersai_charge_noted: row['Cersai Charge Noted'] ?? row[' Cersai Charge Noted'] ?? row['cersai_charge_noted'] ?? null,
      cibil_score: parseFloat(row['Cibil Score'] || row['cibil_score']) || 0,
      udyam_reg_number: row['Udyam Reg Number'] || '',
      enduse: row['Enduse'] || '',
      plantand_machinery:
        parseFloat(row['Plantand Machinery'] || row['plantand_machinery']) || 0,
      credit_rating: row['Credit Rating'] || '',
      trunover_details:
        parseFloat(row['Trunover Details'] || row['trunover_details']) || 0,
      ckyc_no: row['CKYCNo'] || '',
      borrower_property_count:
        parseInt(
          row['Borrower Property Count'] || row['borrower_property_count'],
        ) || 0,
      is_existing_home_owner: row['Is Existing Home Owner'] || 'N',
      insurance_company: row['Insurance Company'] || '',
      policy_type: row['Policy Type'] || row['policy_type'] || '',
      policy_number: row['Policy Number'] || row['policy_number'] || '',
      suit_file_dt: row['Suit File Dt'] || row['suit_file_dt'] || null,
    };

    // Compute date fields and derived day variables
    const expDate = parseDate(row['Exp Date'] || row['exp_date']);
    const npaDate = parseDate(row['Npadate'] || row['npa_date']);
    const inspDate = parseDate(row['Insp Date'] || row['insp_date']);
    const openDate = parseDate(
      row['Account Open Date'] || row['account_open_date'],
    );
    const sancDate = parseDate(row['Sanc Date'] || row['sanc_date']);
    const disbDate = parseDate(
      row['Disbursement Date'] || row['disbursement_date'],
    );
    const instalStart = parseDate(
      row['Instal Start Date'] || row['instal_start_date'],
    );
    const policyDue = parseDate(
      row['Policy Due Date'] || row['policy_due_date'],
    );
    const suitFile = parseDate(row['Suit File Dt'] || row['suit_file_dt']);

    ctx.exp_date = expDate;
    ctx.npa_date = npaDate;
    ctx.insp_date = inspDate;
    ctx.account_open_date = openDate;
    ctx.sanc_date = sancDate;
    ctx.disbursement_date = disbDate;
    ctx.instal_start_date = instalStart;
    ctx.policy_due_date = policyDue;
    ctx.suit_file_dt = suitFile;
    ctx.today = today;
    ctx.TODAY = today;

    // Derived: days since / until
    ctx.days_since_open = daysDiff(openDate);
    ctx.days_since_sanc = daysDiff(sancDate);
    ctx.days_since_disb = daysDiff(disbDate);
    ctx.days_since_npa = daysDiff(npaDate);
    ctx.days_since_insp = daysDiff(inspDate);
    ctx.days_until_exp = expDate
      ? Math.floor(
          (Date.UTC(expDate.getFullYear(), expDate.getMonth(), expDate.getDate()) - 
           Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / (1000 * 60 * 60 * 24),
        )
      : null;
    ctx.days_overdue = expDate && expDate < today ? daysDiff(expDate) : 0;
    ctx.is_expired = expDate ? expDate < today : false;
    ctx.is_npa = ctx.npa === 'Y';

    return ctx;
  }

  /**
   * Full expression evaluator supporting:
   * - AND, OR, NOT
   * - Parentheses ()
   * - Operators: >, >=, <, <=, =, !=, LIKE
   * - System vars: TODAY, TODAY_DAYS, NOW, is_expired, is_npa, days_overdue, etc.
   * - String literals: "VALUE" or 'VALUE'
   * - Numeric literals
   * - Date comparison: field < TODAY means field < today's Date
   */
  public evaluate(expression: string, context: Record<string, any>): any {
    const ast = this.parseExpressionToAST(expression);
    return this.evaluateAST(ast, context);
  }

  public parseExpressionToAST(expression: string): any {
    const tokens = this.tokenize(expression);
    const pos = { i: 0 };
    const ast = this.parseScriptAST(tokens, pos);
    if (pos.i < tokens.length) {
      throw new Error(`Unexpected token '${tokens[pos.i]}' in expression.`);
    }
    return ast;
  }

  private parseScriptAST(tokens: string[], pos = { i: 0 }): any {
    if (pos.i < tokens.length && tokens[pos.i].toUpperCase() === 'IF') {
      const branches = [];
      let defaultRisk = null;

      while (pos.i < tokens.length) {
        const cur = tokens[pos.i].toUpperCase();
        if (cur === 'IF' || cur === 'ELSEIF' || (cur === 'ELSE' && tokens[pos.i + 1]?.toUpperCase() === 'IF')) {
          if (cur === 'IF' || cur === 'ELSEIF') pos.i++;
          else pos.i += 2; // ELSE IF

          const condition = this.parseExprAST(tokens, pos);
          
          if (pos.i < tokens.length && tokens[pos.i].toUpperCase() === 'THEN') pos.i++;
          if (pos.i < tokens.length && tokens[pos.i].toUpperCase() === 'SET') pos.i++;
          if (pos.i < tokens.length && (tokens[pos.i].toLowerCase() === 'risk' || tokens[pos.i].toLowerCase() === 'risk_level')) pos.i++;
          if (pos.i < tokens.length && tokens[pos.i] === '=') pos.i++;
          
          const risk = this.resolveTermAST(tokens[pos.i]);
          if (pos.i < tokens.length) pos.i++;
          
          branches.push({ condition, risk });
        } else if (cur === 'ELSE') {
          pos.i++;
          if (pos.i < tokens.length && tokens[pos.i].toUpperCase() === 'SET') pos.i++;
          if (pos.i < tokens.length && (tokens[pos.i].toLowerCase() === 'risk' || tokens[pos.i].toLowerCase() === 'risk_level')) pos.i++;
          if (pos.i < tokens.length && tokens[pos.i] === '=') pos.i++;
          
          defaultRisk = this.resolveTermAST(tokens[pos.i]);
          if (pos.i < tokens.length) pos.i++;
        } else if (cur === 'END' && tokens[pos.i + 1]?.toUpperCase() === 'IF') {
          pos.i += 2;
          break;
        } else {
          break;
        }
      }
      return { type: 'IF_BLOCK', branches, defaultRisk };
    }

    return this.parseExprAST(tokens, pos);
  }

  private tokenize(expr: string): string[] {
    // Tokenize: handles quoted strings, multi-char operators, words, numbers
    const tokens: string[] = [];
    let i = 0;
    expr = expr.trim();
    while (i < expr.length) {
      // Skip whitespace
      if (/\s/.test(expr[i])) {
        i++;
        continue;
      }
      // Quoted string
      if (expr[i] === '"' || expr[i] === "'") {
        const q = expr[i];
        let j = i + 1;
        while (j < expr.length && expr[j] !== q) j++;
        tokens.push(expr.substring(i, j + 1));
        i = j + 1;
        continue;
      }
      // Two-char operators
      if (i + 1 < expr.length) {
        const twoChar = expr.substring(i, i + 2);
        if (['>=', '<=', '!='].includes(twoChar)) {
          tokens.push(twoChar);
          i += 2;
          continue;
        }
        // User typo mappings
        if (twoChar === '=>') {
          tokens.push('>=');
          i += 2;
          continue;
        }
        if (twoChar === '=<') {
          tokens.push('<=');
          i += 2;
          continue;
        }
      }
      // Single-char operators including arithmetic and comma
      if ('()><=+-*/,'.includes(expr[i])) {
        tokens.push(expr[i]);
        i++;
        continue;
      }
      // Word/number
      let j = i;
      while (j < expr.length && !/[\s()><=!'",]+/.test(expr[j])) j++;
      if (j > i) {
        tokens.push(expr.substring(i, j));
        i = j;
        continue;
      }
      i++;
    }
    return tokens;
  }

  private parseExprAST(tokens: string[], pos = { i: 0 }): any {
    let left = this.parseAndAST(tokens, pos);
    while (pos.i < tokens.length && tokens[pos.i].toUpperCase() === 'OR') {
      pos.i++;
      const right = this.parseAndAST(tokens, pos);
      left = { type: 'OR', left, right };
    }
    return left;
  }

  private parseAndAST(tokens: string[], pos: { i: number }): any {
    let left = this.parseNotAST(tokens, pos);
    while (pos.i < tokens.length && tokens[pos.i].toUpperCase() === 'AND') {
      pos.i++;
      const right = this.parseNotAST(tokens, pos);
      left = { type: 'AND', left, right };
    }
    return left;
  }

  private parseNotAST(tokens: string[], pos: { i: number }): any {
    if (pos.i < tokens.length && tokens[pos.i].toUpperCase() === 'NOT') {
      pos.i++;
      const child = this.parseNotAST(tokens, pos);
      return { type: 'NOT', child };
    }
    return this.parseComparisonAST(tokens, pos);
  }

  private parseComparisonAST(tokens: string[], pos: { i: number }): any {
    const left = this.parseAddSubAST(tokens, pos);
    
    if (pos.i < tokens.length) {
      const cur = tokens[pos.i].toUpperCase();

      // BETWEEN ... AND ...
      if (cur === 'BETWEEN') {
        pos.i++;
        const low = this.parseAddSubAST(tokens, pos);
        if (pos.i < tokens.length && tokens[pos.i].toUpperCase() === 'AND') pos.i++;
        const high = this.parseAddSubAST(tokens, pos);
        return { type: 'BETWEEN', left, low, high };
      }

      // NOT BETWEEN ... AND ...
      if (cur === 'NOT' && pos.i + 1 < tokens.length && tokens[pos.i + 1].toUpperCase() === 'BETWEEN') {
        pos.i += 2;
        const low = this.parseAddSubAST(tokens, pos);
        if (pos.i < tokens.length && tokens[pos.i].toUpperCase() === 'AND') pos.i++;
        const high = this.parseAddSubAST(tokens, pos);
        return { type: 'NOT', child: { type: 'BETWEEN', left, low, high } };
      }

      // IS NULL / IS NOT NULL
      if (cur === 'IS') {
        pos.i++;
        const next = (tokens[pos.i] || '').toUpperCase();
        if (next === 'NOT') {
          pos.i++;
          if ((tokens[pos.i] || '').toUpperCase() === 'NULL') pos.i++;
          return { type: 'COMPARE', left, op: '!=', right: { type: 'LITERAL', value: null } };
        }
        if (next === 'NULL') {
          pos.i++;
          return { type: 'COMPARE', left, op: '=', right: { type: 'LITERAL', value: null } };
        }
      }

      // IN / NOT IN
      if (cur === 'IN') {
        pos.i++;
        const right = this.parseListAST(tokens, pos);
        return { type: 'COMPARE', left, op: 'IN', right };
      }
      if (cur === 'NOT' && pos.i + 1 < tokens.length && tokens[pos.i+1].toUpperCase() === 'IN') {
        pos.i += 2;
        const right = this.parseListAST(tokens, pos);
        return { type: 'COMPARE', left, op: 'NOT IN', right };
      }

      if (cur === 'NOT' && pos.i + 1 < tokens.length && tokens[pos.i+1].toUpperCase() === 'CONTAINS') {
        pos.i += 2;
        const right = this.parseAddSubAST(tokens, pos);
        return { type: 'COMPARE', left, op: 'NOT CONTAINS', right };
      }
    }

    const ops = ['>=', '<=', '!=', '>', '<', '=', 'LIKE', 'CONTAINS'];
    if (pos.i < tokens.length && ops.includes(tokens[pos.i].toUpperCase())) {
      const op = tokens[pos.i].toUpperCase();
      pos.i++;
      const right = this.parseAddSubAST(tokens, pos);
      return { type: 'COMPARE', left, op, right };
    }
    return left;
  }

  private parseListAST(tokens: string[], pos: { i: number }): any {
    if (pos.i >= tokens.length || tokens[pos.i] !== '(') return { type: 'LIST', items: [] };
    pos.i++;
    const items = [];
    while (pos.i < tokens.length && tokens[pos.i] !== ')') {
      if (tokens[pos.i] === ',') {
        pos.i++;
        continue;
      }
      items.push(this.resolveTermAST(tokens[pos.i]));
      pos.i++;
    }
    if (pos.i < tokens.length && tokens[pos.i] === ')') pos.i++;
    return { type: 'LIST', items };
  }

  private parseAddSubAST(tokens: string[], pos: { i: number }): any {
    let left = this.parseMulDivAST(tokens, pos);
    while (pos.i < tokens.length && ['+', '-'].includes(tokens[pos.i])) {
      const op = tokens[pos.i];
      pos.i++;
      const right = this.parseMulDivAST(tokens, pos);
      left = { type: 'ARITHMETIC', left, op, right };
    }
    return left;
  }

  private parseMulDivAST(tokens: string[], pos: { i: number }): any {
    let left = this.parsePrimaryAST(tokens, pos);
    while (pos.i < tokens.length && ['*', '/'].includes(tokens[pos.i])) {
      const op = tokens[pos.i];
      pos.i++;
      const right = this.parsePrimaryAST(tokens, pos);
      left = { type: 'ARITHMETIC', left, op, right };
    }
    return left;
  }

  private parsePrimaryAST(tokens: string[], pos: { i: number }): any {
    if (pos.i < tokens.length && tokens[pos.i].toUpperCase() === 'ABS') {
      pos.i++;
      if (pos.i < tokens.length && tokens[pos.i] === '(') {
        pos.i++;
        const val = this.parseExprAST(tokens, pos);
        if (pos.i < tokens.length && tokens[pos.i] === ')') pos.i++;
        return { type: 'ABS', child: val };
      }
    }
    if (pos.i < tokens.length && tokens[pos.i] === '(') {
      pos.i++;
      const val = this.parseExprAST(tokens, pos);
      if (pos.i < tokens.length && tokens[pos.i] === ')') pos.i++;
      return val;
    }
    const token = tokens[pos.i];
    pos.i++;
    return this.resolveTermAST(token);
  }

  private resolveTermAST(token: string): any {
    if (token === undefined) return { type: 'LITERAL', value: null };
    if (
      (token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'"))
    ) {
      const str = token.slice(1, -1);
      const ddMmYyyy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(str);
      if (ddMmYyyy)
        return {
          type: 'LITERAL',
          value: new Date(
            parseInt(ddMmYyyy[3]),
            parseInt(ddMmYyyy[2]) - 1,
            parseInt(ddMmYyyy[1]),
          ),
        };
      const yyyyMmDd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
      if (yyyyMmDd)
        return {
          type: 'LITERAL',
          value: new Date(
            parseInt(yyyyMmDd[1]),
            parseInt(yyyyMmDd[2]) - 1,
            parseInt(yyyyMmDd[3]),
          ),
        };
      return { type: 'LITERAL', value: str };
    }
    if (/^-?\d+(\.\d+)?$/.test(token))
      return { type: 'LITERAL', value: parseFloat(token) };
    if (token.toUpperCase() === 'TRUE') return { type: 'LITERAL', value: true };
    if (token.toUpperCase() === 'FALSE')
      return { type: 'LITERAL', value: false };
    if (token.toUpperCase() === 'NULL') return { type: 'LITERAL', value: null };

    return { type: 'VARIABLE', name: token };
  }

  public evaluateAST(node: any, context: Record<string, any>): any {
    if (!node) return false;
    switch (node.type) {
      case 'IF_BLOCK': {
        for (const branch of node.branches) {
          if (this.evaluateAST(branch.condition, context)) {
            return this.evaluateAST(branch.risk, context);
          }
        }
        if (node.defaultRisk) {
          return this.evaluateAST(node.defaultRisk, context);
        }
        return false;
      }
      case 'LITERAL':
        return node.value;
      case 'VARIABLE': {
        const token = node.name;
        if (context.hasOwnProperty(token)) return context[token];
        const lower = token.toLowerCase();
        for (const key of Object.keys(context)) {
          if (key.toLowerCase() === lower) return context[key];
        }
        if (token.toUpperCase() === 'TODAY') {
          return new Date();
        }
        return token; // fallback to string literal
      }
      case 'OR':
        return (
          Boolean(this.evaluateAST(node.left, context)) ||
          Boolean(this.evaluateAST(node.right, context))
        );
      case 'AND':
        return (
          Boolean(this.evaluateAST(node.left, context)) &&
          Boolean(this.evaluateAST(node.right, context))
        );
      case 'NOT':
        return !this.evaluateAST(node.child, context);
      case 'ABS':
        return Math.abs(Number(this.evaluateAST(node.child, context)) || 0);
      case 'BOOLEAN_CAST':
        return Boolean(this.evaluateAST(node.child, context));
      // Fix 1: BETWEEN in evaluator
      case 'BETWEEN': {
        const val = this.evaluateAST(node.left, context);
        const low = this.evaluateAST(node.low, context);
        const high = this.evaluateAST(node.high, context);
        if (val instanceof Date && low instanceof Date && high instanceof Date) {
          return val >= low && val <= high;
        }
        const n = Number(val); const lo = Number(low); const hi = Number(high);
        return n >= lo && n <= hi;
      }
      case 'COMPARE':
        return this.compare(
          this.evaluateAST(node.left, context),
          node.op,
          node.op === 'IN' || node.op === 'NOT IN' ? node.right : this.evaluateAST(node.right, context),
        );
      case 'LIST':
        return node.items.map((i: any) => this.evaluateAST(i, context));
      case 'ARITHMETIC': {
        const rawLeft = this.evaluateAST(node.left, context);
        const rawRight = this.evaluateAST(node.right, context);

        if (rawLeft === null || rawRight === null) return null;

        if (node.op === '-') {
          const isLeftDate = rawLeft instanceof Date || (typeof rawLeft === 'number' && rawLeft > 1000000000000);
          const isRightDate = rawRight instanceof Date || (typeof rawRight === 'number' && rawRight > 1000000000000);
          
          if (isLeftDate && isRightDate) {
            const d1 = rawLeft instanceof Date ? rawLeft : new Date(rawLeft);
            const d2 = rawRight instanceof Date ? rawRight : new Date(rawRight);
            const tDate = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
            const dDate = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
            return Math.round((tDate - dDate) / (1000 * 60 * 60 * 24));
          }
        }

        const left = Number(rawLeft);
        const right = Number(rawRight);
        if (node.op === '+') return left + right;
        if (node.op === '-') return left - right;
        if (node.op === '*') return left * right;
        if (node.op === '/') return left / right;
        return 0;
      }
    }
    return false;
  }

  private compare(left: any, op: string, right: any): boolean {
    if (left === null || right === null) {
      if (op === '=') return left === right;
      if (op === '!=') return left !== right;
      return false; // SQL: NULL > X is NULL (falsy)
    }

    // Date comparison (ignores time component, only DD-MM-YYYY part)
    if (left instanceof Date && right instanceof Date) {
      const d1 = new Date(
        left.getFullYear(),
        left.getMonth(),
        left.getDate(),
      ).getTime();
      const d2 = new Date(
        right.getFullYear(),
        right.getMonth(),
        right.getDate(),
      ).getTime();
      switch (op) {
        case '>':
          return d1 > d2;
        case '>=':
          return d1 >= d2;
        case '<':
          return d1 < d2;
        case '<=':
          return d1 <= d2;
        case '=':
          return d1 === d2;
        case '!=':
          return d1 !== d2;
      }
    }
    // Numeric
    if (typeof left === 'number' && typeof right === 'number') {
      switch (op) {
        case '>':
          return left > right;
        case '>=':
          return left >= right;
        case '<':
          return left < right;
        case '<=':
          return left <= right;
        case '=':
          return left === right;
        case '!=':
          return left !== right;
      }
    }
    if (op === 'IN' || op === 'NOT IN') {
      const list = right?.type === 'LIST' ? right.items.map((i: any) => String(i.value ?? '').trim().toUpperCase()) : [];
      const inList = list.includes(String(left ?? '').trim().toUpperCase());
      return op === 'IN' ? inList : !inList;
    }
    // String LIKE (SQL-style % and _ wildcards, case-insensitive to match SQL ILIKE)
    if (op === 'LIKE') {
      const pattern = String(right).replace(/%/g, '.*').replace(/_/g, '.');
      return new RegExp('^' + pattern + '$', 'i').test(String(left));
    }
    if (op === 'CONTAINS') {
      return String(left).toUpperCase().includes(String(right).toUpperCase());
    }
    if (op === 'NOT CONTAINS') {
      return !String(left).toUpperCase().includes(String(right).toUpperCase());
    }
    // Fix 3: String/generic equality — always case-insensitive (mirrors SQL ILIKE / = UPPER behaviour)
    const l = String(left ?? '').trim().toUpperCase();
    const r = String(right ?? '').trim().toUpperCase();
    switch (op) {
      case '=':  return l === r;
      case '!=': return l !== r;
      case '>':  return l > r;
      case '>=': return l >= r;
      case '<':  return l < r;
      case '<=': return l <= r;
    }
    return false;
  }
}

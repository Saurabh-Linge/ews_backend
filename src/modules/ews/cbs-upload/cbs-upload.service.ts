import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../core/database/database.service';
import { CbsRulesService } from '../cbs-rules/cbs-rules.service';
import { AuditTrailService } from '../audit-trail/audit-trail.service';
import { DisputesService } from '../disputes/disputes.service';

const CHUNK_SIZE = 800; // rows per bulk INSERT

@Injectable()
export class CbsUploadService {
  private readonly logger = new Logger(CbsUploadService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly cbsRules: CbsRulesService,
    private readonly auditTrail: AuditTrailService,
    private readonly disputes: DisputesService,
  ) { }

  // ──────────────────────────────────────────────────────────────────────────────
  // Public query endpoints
  // ──────────────────────────────────────────────────────────────────────────────

  async getLastUpload() {
    const result = await this.db.query(
      `SELECT u.*,
              COUNT(r.id)::int AS total_results,
              COUNT(r.id) FILTER (WHERE r.action='New flagged')::int AS new_flagged,
              COUNT(r.id) FILTER (WHERE r.action='Updated')::int AS updated,
              COUNT(r.id) FILTER (WHERE r.action='Needs review')::int AS needs_review
       FROM ews_cbs_uploads u
       LEFT JOIN ews_cbs_upload_results r ON r.upload_id = u.id
       GROUP BY u.id
       ORDER BY u.uploaded_at DESC LIMIT 1`,
    );
    return result.rows[0] || null;
  }

  async getUploadResults(uploadId: number) {
    const result = await this.db.query(
      `SELECT r.*, s.name AS signal_name
       FROM ews_cbs_upload_results r
       LEFT JOIN ews_signals s ON s.id = r.signal_id
       WHERE r.upload_id = $1 ORDER BY r.id DESC`,
      [uploadId],
    );
    return result.rows;
  }

  async getRawCbsData(accountId?: string, branchCode?: string) {
    let query = `SELECT * FROM ews_loan_dump WHERE 1=1`;
    const params: any[] = [];
    let idx = 1;
    if (accountId) {
      query += ` AND account_id = $${idx++}`;
      params.push(accountId);
    }
    if (branchCode) {
      query += ` AND branch_code = $${idx++}`;
      params.push(branchCode);
    }
    query += ` ORDER BY uploaded_at DESC LIMIT 1000`;
    const result = await this.db.query(query, params);
    return result.rows;
  }

  async getRawCbsDataByAccount(accountId: string) {
    const result = await this.db.query(
      `SELECT * FROM ews_loan_dump WHERE account_id = $1 ORDER BY uploaded_at DESC LIMIT 1`,
      [accountId],
    );
    return result.rows[0] || null;
  }

  async clearLoanData() {
    // Step 1: Terminate any active backend queries that might be holding locks on our tables.
    // This kills any long-running reflagAll sweeps or upload jobs so the TRUNCATE can proceed.
    await this.db.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE pid <> pg_backend_pid()
        AND state IN ('active', 'idle in transaction')
        AND query NOT ILIKE '%pg_stat_activity%'
        AND query ILIKE ANY (ARRAY[
          '%ews_loan_dump%',
          '%ews_watch_list%',
          '%ews_account_signals%',
          '%ews_cbs_uploads%',
          '%ews_investigations%',
          '%ews_escalations%',
          '%ews_disputes%',
          '%ews_account_question_answers%',
          '%ews_ro_assessments%',
          '%ews_audit_triggers%'
        ])
    `).catch(() => {/* ignore errors — best effort */});

    // Step 2: Short pause to let terminated connections release their locks
    await new Promise(resolve => setTimeout(resolve, 300));

    // Step 3: Truncate with a lock timeout so it never hangs forever
    await this.db.query(`SET LOCAL lock_timeout = '8s'`).catch(() => {});
    await this.db.query(`
      TRUNCATE TABLE 
        ews_loan_dump,
        ews_cbs_uploads,
        ews_cbs_upload_results,
        ews_watch_list,
        ews_account_signals,
        ews_investigations,
        ews_escalations,
        ews_disputes,
        ews_audit_trail,
        ews_account_question_answers,
        ews_ro_assessments,
        ews_audit_triggers
      RESTART IDENTITY CASCADE;
    `);
    return { success: true, message: 'All CBS loan and watch list data cleared.' };
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────────────

  private toDate(val: any): string | null {
    if (!val) return null;
    if (typeof val === 'number') {
      const d = new Date((val - 25569) * 86400 * 1000);
      return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
    }
    if (val instanceof Date)
      return isNaN(val.getTime()) ? null : val.toISOString().split('T')[0];
    
    let str = String(val).trim();
    // Support DD-MM-YYYY or DD/MM/YYYY
    const dmY = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(str);
    if (dmY) {
      str = `${dmY[3]}-${dmY[2].padStart(2, '0')}-${dmY[1].padStart(2, '0')}`;
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
  }

  private toNum(val: any): number | null {
    if (val === null || val === undefined || val === '') return null;
    let str = String(val).replace(/,/g, '').replace(/\s+/g, '');
    const match = str.match(/-?\d+(\.\d+)?/);
    if (!match) return null;
    const n = parseFloat(match[0]);
    return isNaN(n) ? null : n;
  }

  private toInt(val: any): number | null {
    if (val === null || val === undefined || val === '') return null;
    let str = String(val).replace(/,/g, '').replace(/\s+/g, '');
    const match = str.match(/-?\d+(\.\d+)?/);
    if (!match) return null;
    const n = parseInt(match[0], 10);
    return isNaN(n) ? null : n;
  }

  /** Build a flat array of 77 values for a loan dump row */
  private buildLoanDumpValues(row: any, uploadId: number): any[] {
    return [
      String(row['Branch Code'] ?? ''),
      String(row['Customer No'] ?? ''),
      String(row['Product Code'] ?? ''),
      String(row['Product Desc'] ?? '').trim(),
      String(row['Scheme Code'] ?? ''),
      String(row['Scheme Desc'] ?? '').trim(),
      String(row['Accountno'] ?? ''),
      String(row['accountid'] ?? ''),
      String(row['Long Name'] ?? '').trim(),
      String(row['Member Type'] ?? ''),
      this.toDate(row['Account Open Date']),
      this.toDate(row['Sanc Date']),
      this.toDate(row['Disbursement Date']),
      this.toDate(row['Exp Date']),
      this.toDate(row['Instal Start Date']),
      this.toDate(row['Insp Date']),
      this.toDate(row['Suit File Dt']),
      this.toDate(row['Birth Date']),
      this.toDate(row['Charge Noted Date']),
      this.toDate(row['Valuation Date']),
      this.toDate(row['Npadate']),
      this.toDate(row['Effective From Date']),
      this.toDate(row['Policy Due Date']),
      this.toDate(row['Policy Commencement Date']),
      String(row['Sanc Authority'] ?? ''),
      this.toNum(row['Tot Sanc Limit']),
      this.toNum(row['Disbursement Amount']),
      this.toNum(row['Principal Outstanding']),
      this.toNum(row['Interest Out Standing']),
      this.toNum(row['Chrgs OS']),
      this.toNum(
        row[
        'Interest Receivable / OIR  - This will be unrealized interest not debited to loan account in case of NPA'
        ],
      ),
      this.toNum(row['Interest Receivable / OIR ']),
      this.toNum(row['Balance']),
      this.toNum(row['Security Amount']),
      this.toNum(row['Standard Int Rate']),
      this.toNum(row['Int Rate']),
      this.toInt(row['Noof Instl']),
      this.toNum(row['Instal Amt']),
      this.toNum(row['Award Amt']),
      this.toNum(row['Cibil Score']),
      this.toNum(row['Plantand Machinery']),
      this.toNum(row['Trunover Details']),
      this.toInt(row['Borrower Property Count']),
      String(row['LNINSTFREQ'] ?? ''),
      String(row['NPA'] ?? 'N'),
      String(row['Loan Against Deposit'] ?? 'N'),
      String(row['Priority Sector YN'] ?? 'N'),
      String(row['NONPriority Sector'] ?? ''),
      String(row['Priority Sector Category'] ?? ''),
      String(row['Sub Priority Sector Category'] ?? ''),
      String(row['Sub Priority Sector Category1'] ?? ''),
      String(row['Sub Priority Sector Category2'] ?? ''),
      String(row['Weaker Sector YN'] ?? 'N'),
      String(row['Weaker Sector Category'] ?? ''),
      String(row['Sub Weaker Sector Code'] ?? ''),
      String(row['Purpose Code'] ?? ''),
      String(row['Sub Purpose Code'] ?? ''),
      String(row['Bank Cust Rating'] ?? 'STANDARD'),
      String(row['Pan No'] ?? ''),
      String(row['Industry Type'] ?? ''),
      String(row['Industry Sub Type'] ?? ''),
      String(row['Govt Prog YN'] ?? 'N'),
      String(row['Addres1'] ?? '').trim(),
      String(row['Awardstatus'] ?? ''),
      String(row['Membership No'] ?? ''),
      String(row['Gender'] ?? ''),
      String(row['Cersai Charge Noted'] ?? row[' Cersai Charge Noted'] ?? ''),
      String(row['Udyam Reg Number'] ?? ''),
      String(row['Enduse'] ?? ''),
      String(row['Credit Rating'] ?? ''),
      String(row['CKYCNo'] ?? ''),
      String(row['Is Existing Home Owner'] ?? 'N'),
      String(row['Insurance Company'] ?? ''),
      String(row['Policy Type'] ?? ''),
      String(row['Policy Number'] ?? ''),
      String(row['Security Type'] ?? ''),
      uploadId,
    ];
  }

  /** Bulk INSERT up to CHUNK_SIZE rows into ews_loan_dump using multi-row VALUES */
  private async bulkInsertLoanDump(chunks: any[][]): Promise<void> {
    if (chunks.length === 0) return;
    const COLS = 77; // number of columns per row
    const placeholders = chunks
      .map(
        (_, ri) =>
          '(' +
          Array.from(
            { length: COLS },
            (__, ci) => `$${ri * COLS + ci + 1}`,
          ).join(',') +
          ')',
      )
      .join(',');
    const values = chunks.flat();

    await this.db.query(
      `INSERT INTO ews_loan_dump (
        branch_code, customer_no, product_code, product_desc,
        scheme_code, scheme_desc, account_no, account_id,
        long_name, member_type,
        account_open_date, sanc_date, disbursement_date, exp_date,
        instal_start_date, insp_date, suit_file_dt, birth_date,
        charge_noted_date, valuation_date, npa_date,
        effective_from_date, policy_due_date, policy_commencement_date,
        sanc_authority, tot_sanc_limit, disbursement_amount,
        principal_outstanding, interest_outstanding, charges_os,
        interest_receivable_oir, interest_receivable_oir2, balance,
        security_amount, standard_int_rate, int_rate,
        no_of_instl, instal_amt, award_amt, cibil_score,
        plantand_machinery, trunover_details, borrower_property_count,
        lninstfreq, npa, loan_against_deposit,
        priority_sector_yn, non_priority_sector, priority_sector_category,
        sub_priority_sector_category, sub_priority_sector_category1,
        sub_priority_sector_category2, weaker_sector_yn, weaker_sector_category,
        sub_weaker_sector_code, purpose_code, sub_purpose_code,
        bank_cust_rating, pan_no, industry_type, industry_sub_type,
        govt_prog_yn, address1, award_status, membership_no, gender,
        cersai_charge_noted, udyam_reg_number, enduse,
        credit_rating, ckyc_no, is_existing_home_owner,
        insurance_company, policy_type, policy_number, security_type,
        upload_id
      ) VALUES ${placeholders}, ${chunks.map(() => '').join('')}
      ON CONFLICT DO NOTHING`
        // Re-build clean without the extra trailing comma trick:
        .replace(`, ${chunks.map(() => '').join('')}`, ''),
      values,
    );
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Main upload processor — fully optimised
  // ──────────────────────────────────────────────────────────────────────────────

  async processUpload(rows: any[], uploadedBy: string) {
    const t0 = Date.now();

    // Fetch software date configuration
    const configRes = await this.db.query("SELECT value FROM ews_risk_config WHERE key = 'software_date'");
    const softwareDateStr = configRes.rows[0]?.value || null;
    let softwareDate: Date | null = null;
    if (softwareDateStr) {
      const parts = softwareDateStr.split('-');
      if (parts.length === 3) {
        softwareDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 0, 0, 0, 0);
      } else {
        softwareDate = new Date(softwareDateStr);
      }
    }
    const timestampSql = softwareDateStr ? `'${softwareDateStr} 12:00:00'::TIMESTAMP` : 'CURRENT_TIMESTAMP';

    // ── 1. Create upload record ────────────────────────────────────────────────
    const uploadResult = await this.db.query(
      `INSERT INTO ews_cbs_uploads (uploaded_by, total_rows, status, uploaded_at)
       VALUES ($1,$2,'Processing',${timestampSql}) RETURNING *`,
      [uploadedBy, rows.length],
    );
    const upload = uploadResult.rows[0];

    // ── 2. Load all enabled rules ONCE ────────────────────────────────────────
    const allRules = await this.cbsRules.findAll();
    const enabledRules = allRules.filter((r: any) => r.enabled);

    // PRE-COMPILE RULES INTO AST
    for (const rule of enabledRules) {
      try {
        rule.ast = this.cbsRules.parseExpressionToAST(rule.expression);
      } catch (e) {
        this.logger.warn(`Failed to parse rule ${rule.name}: ${e.message}`);
      }
    }

    this.logger.log(`Loaded ${enabledRules.length} enabled rules`);

    // ── 3. Filter valid rows ───────────────────────────────────────────────────
    const validRows = rows.filter((row) => {
      const id = String(
        row['accountid'] || row['AccountId'] || row['account_id'] || '',
      ).trim();
      return id && id !== 'accountid';
    });
    this.logger.log(
      `Processing ${validRows.length} valid rows out of ${rows.length}`,
    );

    // ── 4. Bulk insert all rows into ews_loan_dump in CHUNK_SIZE batches ──────
    let dumpInserted = 0;
    for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
      const chunk = validRows.slice(i, i + CHUNK_SIZE);
      const valueArrays = chunk.map((row) =>
        this.buildLoanDumpValues(row, upload.id),
      );

      if (valueArrays.length === 0) continue;
      const COLS = 77;
      const placeholders = valueArrays
        .map(
          (_, ri) =>
            '(' +
            Array.from(
              { length: COLS },
              (__, ci) => `$${ri * COLS + ci + 1}`,
            ).join(',') +
            ')',
        )
        .join(',');
      const flatValues = valueArrays.flat();

      const columnsList = [
        'branch_code',
        'customer_no',
        'product_code',
        'product_desc',
        'scheme_code',
        'scheme_desc',
        'account_no',
        'account_id',
        'long_name',
        'member_type',
        'account_open_date',
        'sanc_date',
        'disbursement_date',
        'exp_date',
        'instal_start_date',
        'insp_date',
        'suit_file_dt',
        'birth_date',
        'charge_noted_date',
        'valuation_date',
        'npa_date',
        'effective_from_date',
        'policy_due_date',
        'policy_commencement_date',
        'sanc_authority',
        'tot_sanc_limit',
        'disbursement_amount',
        'principal_outstanding',
        'interest_outstanding',
        'charges_os',
        'interest_receivable_oir',
        'interest_receivable_oir2',
        'balance',
        'security_amount',
        'standard_int_rate',
        'int_rate',
        'no_of_instl',
        'instal_amt',
        'award_amt',
        'cibil_score',
        'plantand_machinery',
        'trunover_details',
        'borrower_property_count',
        'lninstfreq',
        'npa',
        'loan_against_deposit',
        'priority_sector_yn',
        'non_priority_sector',
        'priority_sector_category',
        'sub_priority_sector_category',
        'sub_priority_sector_category1',
        'sub_priority_sector_category2',
        'weaker_sector_yn',
        'weaker_sector_category',
        'sub_weaker_sector_code',
        'purpose_code',
        'sub_purpose_code',
        'bank_cust_rating',
        'pan_no',
        'industry_type',
        'industry_sub_type',
        'govt_prog_yn',
        'address1',
        'award_status',
        'membership_no',
        'gender',
        'cersai_charge_noted',
        'udyam_reg_number',
        'enduse',
        'credit_rating',
        'ckyc_no',
        'is_existing_home_owner',
        'insurance_company',
        'policy_type',
        'policy_number',
        'security_type',
        'upload_id',
      ];

      const updateSet = columnsList
        .filter((c) => c !== 'account_id' && c !== 'account_no')
        .map((c) => `${c} = EXCLUDED.${c}`)
        .join(', ');

      try {
        await this.db.query(
          `INSERT INTO ews_loan_dump (${columnsList.join(', ')})
           VALUES ${placeholders}
           ON CONFLICT (account_id) DO UPDATE SET ${updateSet}, uploaded_at = CURRENT_TIMESTAMP`,
          flatValues,
        );
        dumpInserted += chunk.length;
      } catch (e) {
        this.logger.warn(
          `Loan dump chunk ${i}-${i + chunk.length} error: ${e.message}`,
        );
      }
    }
    this.logger.log(
      `Loan dump bulk insert done: ${dumpInserted} rows in ${Date.now() - t0}ms`,
    );

    
    
    // ── 5. Evaluate rules in-memory (no DB per row) ───────────────────────────
    const firedMap = new Map<string, { signalMap: Map<number, string[]>, maxRisk: string | null }>(); // accountId -> {signalMap, maxRisk}
    const riskScores: Record<string, number> = { 'Low': 1, 'Medium': 2, 'High': 3 };

    for (const row of validRows) {
      const accountId = String(
        row['accountid'] || row['AccountId'] || row['account_id'] || '',
      ).trim();
      const context = this.cbsRules.buildContext(row, softwareDate);
      const signalMap = new Map<number, string[]>();
      let maxRisk: string | null = null;

      for (const rule of enabledRules) {
        if (!rule.ast) continue;
        try {
          const evalResult = this.cbsRules.evaluateAST(rule.ast, context);
          if (
            rule.signal_ids &&
            rule.signal_ids.length > 0 &&
            evalResult
          ) {
            let ruleRisk = rule.risk_level || null;
            if (typeof evalResult === 'string' && riskScores[evalResult]) {
               ruleRisk = evalResult;
            }

            if (ruleRisk) {
              if (!maxRisk || (riskScores[ruleRisk] || 0) > (riskScores[maxRisk] || 0)) {
                maxRisk = ruleRisk;
              }
            }

            for (const sigId of rule.signal_ids) {
              if (!signalMap.has(sigId)) signalMap.set(sigId, []);
              signalMap.get(sigId).push(rule.name);
            }
          }
        } catch (_) { }
      }
      if (signalMap.size > 0) firedMap.set(accountId, { signalMap, maxRisk });
    }
    this.logger.log(
      `Rules evaluated in-memory: ${firedMap.size} accounts triggered signals in ${Date.now() - t0}ms`,
    );

    if (firedMap.size === 0) {
      await this.db.query(
        `UPDATE ews_cbs_uploads SET status='Completed', new_flagged=0, updated=0, needs_review=0, processed_at=${timestampSql} WHERE id=$1`,
        [upload.id],
      );
      return {
        upload_id: upload.id,
        total: validRows.length,
        new_flagged: 0,
        updated: 0,
        needs_review: 0,
        duration_ms: Date.now() - t0,
      };
    }

    // ── 6. Batch fetch all existing watch list accounts in ONE query ───────────
    const triggeredIds = [...firedMap.keys()];
    const existingRes = await this.db.query(
      `SELECT id, account_id, borrower_name, branch FROM ews_watch_list
       WHERE account_id = ANY($1) AND status != 'Resolved'`,
      [triggeredIds],
    );
    const existingMap = new Map<string, any>();
    for (const r of existingRes.rows) existingMap.set(r.account_id, r);

    // ── 7. Batch fetch all pending disputes for triggered accounts ONE query ───
    const disputeRes = await this.db.query(
      `SELECT d.id, d.signal_id, w.account_id
       FROM ews_disputes d
       JOIN ews_watch_list w ON w.id = d.watch_list_id
       WHERE w.account_id = ANY($1) AND d.status = 'Pending'`,
      [triggeredIds],
    );
    // disputeLookup: "accountId:signalId" -> dispute IDs
    const disputeLookup = new Map<string, number[]>();
    for (const d of disputeRes.rows) {
      const key = `${d.account_id}:${d.signal_id}`;
      if (!disputeLookup.has(key)) disputeLookup.set(key, []);
      disputeLookup.get(key).push(d.id);
    }

    // ── 8. Build row metadata from validRows map for triggered accounts ────────
    const rowMeta = new Map<string, any>();
    for (const row of validRows) {
      const accountId = String(row['accountid'] || '').trim();
      if (firedMap.has(accountId) && !rowMeta.has(accountId)) {
        rowMeta.set(accountId, {
          borrower_name:
            String(row['Long Name'] || '').trim() || `Customer ${accountId}`,
          branch: String(row['Branch Code'] || '').trim(),
          loan_type: String(
            row['Scheme Desc'] || row['Product Desc'] || '',
          ).trim(),
        });
      }
    }

    // ── 9. Insert new watch list entries in bulk ───────────────────────────────
    const toInsert: any[] = [];
    const alreadyExisting: any[] = [];

    for (const [accountId, { signalMap, maxRisk }] of firedMap) {
      const signalIds = [...signalMap.keys()];
      const meta = rowMeta.get(accountId) || {
        borrower_name: `Customer ${accountId}`,
        branch: '',
        loan_type: '',
      };
      if (!existingMap.has(accountId)) {
        toInsert.push({ accountId, ...meta, signalIds, maxRisk });
      } else {
        alreadyExisting.push({
          accountId,
          entry: existingMap.get(accountId)!,
          signalIds,
        });
      }
    }

    // Bulk insert new watch list accounts
    let newWatchEntries: any[] = [];
    if (toInsert.length > 0) {
      for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
        const chunk = toInsert.slice(i, i + CHUNK_SIZE);
        const ph = chunk
          .map((_, ri) => {
            if (ri === 0) return `($${ri * 8 + 1},$${ri * 8 + 2},$${ri * 8 + 3},$${ri * 8 + 4}::text,$${ri * 8 + 5},$${ri * 8 + 6},$${ri * 8 + 7},$${ri * 8 + 8},${timestampSql})`;
            return `($${ri * 8 + 1},$${ri * 8 + 2},$${ri * 8 + 3},$${ri * 8 + 4},$${ri * 8 + 5},$${ri * 8 + 6},$${ri * 8 + 7},$${ri * 8 + 8},${timestampSql})`;
          })
          .join(',');
        const vals = chunk.flatMap((r) => [
          r.accountId,
          r.borrower_name,
          r.branch,
          r.branch || null,
          r.loan_type,
          'System',
          'CBS Upload',
          r.maxRisk || null,
        ]);
        const res = await this.db
          .query(
            `INSERT INTO ews_watch_list (account_id, borrower_name, branch, branch_id, loan_type, source, added_by, risk_level, status, added_at)
           SELECT v.account_id, v.borrower_name, v.branch, b.id, v.loan_type, v.source, v.added_by, v.risk_level, 'Pending review', v.added_at
           FROM (VALUES ${ph}) AS v(account_id, borrower_name, branch, branch_code, loan_type, source, added_by, risk_level, added_at)
           LEFT JOIN ews_branches b ON b.code = v.branch_code
           ON CONFLICT (account_id) WHERE status != 'Resolved' DO NOTHING
           RETURNING id, account_id, borrower_name, branch`,
            vals,
          )
          .catch(() =>
            // Fallback: plain insert without join if branch code doesn't match
            this.db.query(
              `INSERT INTO ews_watch_list (account_id, borrower_name, branch, loan_type, source, added_by, risk_level, status, added_at)
             VALUES ${chunk.map((_, ri) => `($${ri * 7 + 1},$${ri * 7 + 2},$${ri * 7 + 3},$${ri * 7 + 4},$${ri * 7 + 5},$${ri * 7 + 6},$${ri * 7 + 7},'Pending review',${timestampSql})`).join(',')}
             ON CONFLICT (account_id) WHERE status != 'Resolved' DO NOTHING RETURNING id, account_id, borrower_name, branch`,
              chunk.flatMap((r) => [
                r.accountId,
                r.borrower_name,
                r.branch,
                r.loan_type,
                'System',
                'CBS Upload',
                r.maxRisk || 'Medium',
              ]),
            ),
          );
        newWatchEntries = newWatchEntries.concat(res.rows);
      }
    }

    // Merge new entries into existingMap
    for (const e of newWatchEntries) existingMap.set(e.account_id, e);

    // ── 10. Bulk insert signals ────────────────────────────────────────────────
    const signalRows: any[] = []; // [watch_list_id, signal_id, rules[]]
    for (const [accountId, { signalMap }] of firedMap) {
      const entry = existingMap.get(accountId);
      if (!entry) continue;
      for (const [sigId, ruleNames] of signalMap) {
        signalRows.push([entry.id, sigId, ruleNames]);
      }
    }

    if (signalRows.length > 0) {
      for (let i = 0; i < signalRows.length; i += 500) {
        const chunk = signalRows.slice(i, i + 500);
        const ph = chunk
          .map(
            (_, ri) =>
              `($${ri * 3 + 1},$${ri * 3 + 2},2,$${ri * 3 + 3}::jsonb,${timestampSql})`,
          )
          .join(',');
        await this.db
          .query(
            `INSERT INTO ews_account_signals (watch_list_id, signal_id, layer, details, triggered_at)
           VALUES ${ph}
           ON CONFLICT (watch_list_id, signal_id, layer) DO UPDATE
           SET details = jsonb_set(
             COALESCE(ews_account_signals.details, '{}'::jsonb),
             '{rules}',
             COALESCE(ews_account_signals.details->'rules', '[]'::jsonb) || (EXCLUDED.details->'rules')
           )`,
            chunk.flatMap((r) => [r[0], r[1], JSON.stringify({ rules: r[2] })]),
          )
          .catch((e) =>
            this.logger.warn('Signal bulk insert error: ' + e.message),
          );
      }
    }

    // ── 11. Annotate active disputes in bulk ───────────────────────────────────
    const disputeIdsToAnnotate = new Set<number>();
    for (const [accountId, { signalMap }] of firedMap) {
      for (const sigId of signalMap.keys()) {
        const disputeIds = disputeLookup.get(`${accountId}:${sigId}`) || [];
        disputeIds.forEach((id) => disputeIdsToAnnotate.add(id));
      }
    }
    if (disputeIdsToAnnotate.size > 0) {
      const ids = [...disputeIdsToAnnotate];
      await this.db.query(
        `UPDATE ews_disputes
         SET resolution_notes = CONCAT(COALESCE(resolution_notes,''), E'\nSystem auto-verified via CBS Upload.')
         WHERE id = ANY($1)`,
        [ids],
      );
    }

    // ── 12. Bulk insert results & audit trail ─────────────────────────────────
    const resultRows: any[] = [];
    const auditRows: any[] = [];
    let newFlagged = 0,
      updated = 0,
      needsReview = 0;

    for (const [accountId, { signalMap }] of firedMap) {
      const signalIds = [...signalMap.keys()];
      const entry = existingMap.get(accountId);
      const meta = rowMeta.get(accountId) || {
        borrower_name: '',
        branch: '',
        loan_type: '',
      };
      const hasDispute = signalIds.some(
        (sid) => (disputeLookup.get(`${accountId}:${sid}`) || []).length > 0,
      );
      const isNew = newWatchEntries.some((e) => e.account_id === accountId);
      let action: string;
      if (isNew) {
        action = 'New flagged';
        newFlagged++;
      } else if (hasDispute) {
        action = 'Needs review';
        needsReview++;
      } else {
        action = 'Updated';
        updated++;
      }

      const sigNames: string[] = [];
      for (const sid of signalIds) {
        const rules = signalMap.get(sid) || [];
        sigNames.push(`Sig #${sid} (${rules.join(', ')})`);
      }
      const details = sigNames.join('; ');

      resultRows.push([
        upload.id,
        accountId,
        meta.borrower_name,
        meta.branch,
        signalIds[0],
        details,
        action,
      ]);

      if (isNew) {
        auditRows.push([
          accountId,
          meta.borrower_name,
          meta.branch,
          'Added to watch list',
          'System (auto)',
          `CBS upload — ${details}`,
        ]);
      }
    }

    // Bulk insert upload results
    if (resultRows.length > 0) {
      for (let i = 0; i < resultRows.length; i += 500) {
        const chunk = resultRows.slice(i, i + 500);
        const ph = chunk
          .map(
            (_, ri) =>
              `($${ri * 7 + 1},$${ri * 7 + 2},$${ri * 7 + 3},$${ri * 7 + 4},$${ri * 7 + 5},$${ri * 7 + 6},$${ri * 7 + 7})`,
          )
          .join(',');
        await this.db
          .query(
            `INSERT INTO ews_cbs_upload_results (upload_id, account_id, borrower_name, branch, signal_id, value, action) VALUES ${ph}`,
            chunk.flat(),
          )
          .catch((e) =>
            this.logger.warn('Results bulk insert error: ' + e.message),
          );
      }
    }

    // Bulk insert audit trail
    if (auditRows.length > 0) {
      for (let i = 0; i < auditRows.length; i += 500) {
        const chunk = auditRows.slice(i, i + 500);
        const ph = chunk
          .map(
            (_, ri) =>
              `($${ri * 6 + 1},$${ri * 6 + 2},$${ri * 6 + 3},$${ri * 6 + 4},$${ri * 6 + 5},$${ri * 6 + 6},${timestampSql})`,
          )
          .join(',');
        await this.db
          .query(
            `INSERT INTO ews_audit_trail (account_id, borrower_name, branch, action, performed_by, remarks, logged_at) VALUES ${ph}`,
            chunk.flat(),
          )
          .catch((e) =>
            this.logger.warn('Audit bulk insert error: ' + e.message),
          );
      }
    }

    // ── 13. Finalize upload ────────────────────────────────────────────────────
    const duration = Date.now() - t0;
    await this.db.query(
      `UPDATE ews_cbs_uploads SET status='Completed', new_flagged=$1, updated=$2, needs_review=$3, processed_at=${timestampSql} WHERE id=$4`,
      [newFlagged, updated, needsReview, upload.id],
    );

    this.logger.log(
      `Upload ${upload.id} complete: ${validRows.length} rows in ${duration}ms | new=${newFlagged} updated=${updated} review=${needsReview}`,
    );
    return {
      upload_id: upload.id,
      total: validRows.length,
      new_flagged: newFlagged,
      updated,
      needs_review: needsReview,
      duration_ms: duration,
    };
  }
}



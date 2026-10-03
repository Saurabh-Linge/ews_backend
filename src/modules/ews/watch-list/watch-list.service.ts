import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../core/database/database.service';

@Injectable()
export class WatchListService {
  private readonly logger = new Logger(WatchListService.name);

  constructor(private readonly db: DatabaseService) {}

  async findAll(filters?: {
    branch?: string;
    risk_level?: string;
    source?: string;
    status?: string;
    role?: string;
    branch_ids?: string; // comma separated string or array
    signal_id?: string;
    rule_name?: string;
    loan_type?: string;
  }) {
    let query = `
      SELECT
        w.id, w.account_id, w.borrower_name, w.branch, COALESCE(b.name, w.branch) as branch_name, w.loan_type,
        w.risk_level, w.status, w.source,
        MAX(d.customer_no) as customer_no, MAX(d.account_no) as account_no,
        EXTRACT(DAY FROM COALESCE((SELECT NULLIF(value, '')::TIMESTAMP FROM ews_risk_config WHERE key = 'software_date'), NOW()) - w.added_at)::INT AS days_on_list,
        w.added_at, w.updated_at,
        COUNT(s.id) AS signal_count,
        (
          SELECT json_agg(json_build_object('name', sig.name, 'rules', sa.details->'rules'))
          FROM ews_account_signals sa
          JOIN ews_signals sig ON sa.signal_id = sig.id
          WHERE sa.watch_list_id = w.id
        ) as signals_data
      FROM ews_watch_list w
      LEFT JOIN ews_loan_dump d ON w.account_id = d.account_id
      LEFT JOIN ews_account_signals s ON s.watch_list_id = w.id
      LEFT JOIN ews_branches b ON w.branch_id = b.id
      WHERE ${filters?.status === 'Resolved' ? 'w.removed_at IS NOT NULL' : 'w.removed_at IS NULL'}
    `;
    const params: any[] = [];
    let idx = 1;

    if (filters?.branch) {
      query += ` AND (b.name = $${idx} OR w.branch = $${idx})`;
      params.push(filters.branch);
      idx++;
    }
    if (filters?.risk_level) {
      query += ` AND w.risk_level = $${idx++}`;
      params.push(filters.risk_level);
    }
    if (filters?.loan_type) {
      query += ` AND w.loan_type = $${idx++}`;
      params.push(filters.loan_type);
    }
    if (filters?.source) {
      query += ` AND w.source = $${idx++}`;
      params.push(filters.source);
    }
    if (filters?.status && filters.status !== 'Resolved') {
      query += ` AND w.status = $${idx++}`;
      params.push(filters.status);
    }

    // Default role filters when no explicit status is requested
    if (!filters?.status) {
      // Removed RO restriction to Pending review so RO can see full active watchlist,
      // but they can filter to Pending review using the UI dropdown.
    }

    // Strictly enforce branch visibility to prevent viewing 'Pending review' via UI filters
    if (filters?.role === 'branch') {
      query += ` AND w.status != 'Pending review'`;
    }
    if (filters?.branch_ids) {
      const ids = Array.isArray(filters.branch_ids)
        ? filters.branch_ids
        : filters.branch_ids.split(',').map(Number);
      query += ` AND w.branch_id = ANY($${idx++})`;
      params.push(ids);
    }
    if (filters?.signal_id) {
      query += ` AND EXISTS (SELECT 1 FROM ews_account_signals s2 WHERE s2.watch_list_id = w.id AND s2.signal_id = $${idx++})`;
      params.push(filters.signal_id);
    }
    if (filters?.rule_name) {
      // rule_name is stored in details->'rules' JSON array of layer 2 signals
      query += ` AND EXISTS (
        SELECT 1 FROM ews_account_signals s3 
        WHERE s3.watch_list_id = w.id 
          AND s3.layer = 2 
          AND s3.details->'rules' @> $${idx++}::jsonb
      )`;
      params.push(JSON.stringify([filters.rule_name]));
    }

    query += ' GROUP BY w.id, b.name ORDER BY w.added_at DESC';
    const result = await this.db.query(query, params);
    return result.rows;
  }

  async findOne(id: number) {
    const result = await this.db.query(
      `SELECT w.*, EXTRACT(DAY FROM COALESCE((SELECT NULLIF(value, '')::TIMESTAMP FROM ews_risk_config WHERE key = 'software_date'), NOW()) - w.added_at)::INT AS days_on_list
       FROM ews_watch_list w WHERE w.id = $1`,
      [id],
    );
    if (!result.rows[0])
      throw new NotFoundException(`Watch list entry ${id} not found`);
    return result.rows[0];
  }

  async findByAccountId(accountId: string) {
    const result = await this.db.query(
      `SELECT * FROM ews_watch_list WHERE account_id = $1`,
      [accountId],
    );
    return result.rows[0] || null;
  }

  async getDetails(id: number) {
    const baseAccount = await this.findOne(id);

    // Fetch enriched account details from loan dump
    const accountDetails = await this.db.query(
      `SELECT w.*, COALESCE(b.name, w.branch) as branch_name, d.tot_sanc_limit as sanction_amount, d.principal_outstanding as outstanding, NULL as dp, row_to_json(d.*) as dump_data
       FROM ews_watch_list w
       LEFT JOIN ews_loan_dump d ON w.account_id = d.account_id
       LEFT JOIN ews_branches b ON w.branch_id = b.id
       WHERE w.id = $1`,
      [id],
    );
    const account = accountDetails.rows[0] || baseAccount;

    const signals = await this.db.query(
      `SELECT s.*, sig.name as signal_name, sig.number as signal_number 
       FROM ews_account_signals s
       LEFT JOIN ews_signals sig ON s.signal_id = sig.id
       WHERE s.watch_list_id = $1 ORDER BY s.id ASC`,
      [id],
    );

    const mappedSignals = signals.rows.map((s) => {
      if (s.layer === 2 && s.details && Array.isArray(s.details.rules)) {
        s.details.rules = s.details.rules.map((ruleName: string | any) => {
          const name = typeof ruleName === 'string' ? ruleName : ruleName.name;
          return {
            name
          };
        });
      }
      return s;
    });

    const timeline = await this.db.query(
      `SELECT * FROM ews_audit_trail WHERE account_id = $1 ORDER BY logged_at ASC`,
      [account.account_id],
    );
    const disputes = await this.db.query(
      `SELECT d.*, s.name AS signal_name, s.number AS signal_number 
       FROM ews_disputes d
       LEFT JOIN ews_signals s ON d.signal_id = s.id
       WHERE d.watch_list_id = $1 ORDER BY d.raised_at DESC`,
      [id],
    );
    const investigations = await this.db.query(
      `SELECT * FROM ews_investigations WHERE watch_list_id = $1 ORDER BY sent_at DESC`,
      [id],
    );

    return {
      account,
      signals: mappedSignals,
      timeline: timeline.rows,
      disputes: disputes.rows,
      investigations: investigations.rows,
    };
  }

  async getDumpDetails(id: number) {
    // Fetch enriched account details from loan dump directly
    const accountDetails = await this.db.query(
      `SELECT d.id, d.account_id, COALESCE(b.name, d.branch_code) as branch_name, d.tot_sanc_limit as sanction_amount, d.principal_outstanding as outstanding, NULL as dp, row_to_json(d.*) as dump_data, d.long_name as borrower_name, d.scheme_desc as loan_type, d.npa as risk_level
       FROM ews_loan_dump d
       LEFT JOIN ews_branches b ON d.branch_code = b.code
       WHERE d.id = $1`,
      [id],
    );
    if (!accountDetails.rows[0]) throw new NotFoundException('Account not found');
    const account = accountDetails.rows[0];

    // If account is on watch list, delegate to getDetails to return full signals, timeline, etc.
    const wl = await this.db.query(
      `SELECT id FROM ews_watch_list WHERE account_id = $1`,
      [account.account_id]
    );
    if (wl.rows[0]) {
      return this.getDetails(wl.rows[0].id);
    }

    account.status = 'Normal';

    return {
      account,
      signals: [],
      timeline: [],
      disputes: [],
      investigations: []
    };
  }

  async add(data: {
    account_id: string;
    borrower_name: string;
    branch: string;
    branch_id?: number;
    loan_type: string;
    source: 'Auditor' | 'System' | 'Manual';
    added_by: string;
    initial_signal_id?: number;
    signal_name?: string;
    risk_level?: string;
    remarks?: string;
  }) {
    // Check if already on watch list
    let existing = await this.findByAccountId(data.account_id);
    let watchListId;
    
    if (existing) {
      watchListId = existing.id;
    } else {
      const result = await this.db.query(
        `INSERT INTO ews_watch_list
          (account_id, borrower_name, branch, branch_id, loan_type, source, added_by, risk_level, status, added_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Pending review',CURRENT_TIMESTAMP)
         RETURNING *`,
        [
          data.account_id,
          data.borrower_name,
          data.branch,
          data.branch_id ?? null,
          data.loan_type,
          data.source,
          data.added_by,
          data.risk_level ?? 'Medium',
        ],
      );
      watchListId = result.rows[0].id;
      existing = result.rows[0];
    }

    if (data.signal_name) {
      const sigRes = await this.db.query(`SELECT id FROM ews_signals WHERE name = $1`, [data.signal_name]);
      if (sigRes.rows.length > 0) {
        await this.db.query(
          `INSERT INTO ews_account_signals (watch_list_id, signal_id, layer, details, triggered_at)
           VALUES ($1, $2, 3, '{}', CURRENT_TIMESTAMP)`,
          [watchListId, sigRes.rows[0].id]
        );
      }
    }

    await this.db.query(
      `INSERT INTO ews_audit_trail (account_id, watch_list_id, action, performed_by, remarks, logged_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [data.account_id, watchListId, 'Added to watch list', data.added_by, data.remarks || 'Manual flag']
    );

    return existing;
  }

  async updateStatus(
    id: number,
    status: string,
    updatedBy: string,
    remarks?: string,
  ) {
    const result = await this.db.query(
      `UPDATE ews_watch_list SET status=$1, updated_by=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3 RETURNING *`,
      [status, updatedBy, id],
    );
    return result.rows[0];
  }

  async updateRisk(id: number, riskLevel: string) {
    const result = await this.db.query(
      `UPDATE ews_watch_list SET risk_level=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *`,
      [riskLevel, id],
    );
    return result.rows[0];
  }

  async remove(id: number, removedBy: string, resolution: string) {
    await this.db.query(
      `UPDATE ews_watch_list SET removed_at=CURRENT_TIMESTAMP, removed_by=$1, resolution=$2, status='Resolved' WHERE id=$3`,
      [removedBy, resolution, id],
    );
    return { success: true };
  }

  async getStats(filters?: { branch_ids?: string; role?: string }) {
    const params: any[] = [];
    let whereClause = '';
    let ldBranchCond = '';
    let overdueBranchCond = '';

    if (filters?.branch_ids) {
      const ids = Array.isArray(filters.branch_ids)
        ? filters.branch_ids
        : filters.branch_ids.split(',').map(Number);
      params.push(ids);
      whereClause = `WHERE branch_id = ANY($1)`;
      ldBranchCond = `WHERE branch_code IN (SELECT code FROM ews_branches WHERE id = ANY($1))`;
      overdueBranchCond = `AND w2.branch_id = ANY($1)`;
    }

    const query = `
      SELECT
        (COUNT(*) FILTER (WHERE status != 'Resolved' ${filters?.role === 'branch' ? "AND status != 'Pending review'" : ''}))::INT AS total_active,
        (COUNT(*) FILTER (WHERE status != 'Resolved' AND risk_level = 'High'))::INT AS high_risk,
        (COUNT(*) FILTER (WHERE status != 'Resolved' AND risk_level = 'Medium'))::INT AS medium_risk,
        (COUNT(*) FILTER (WHERE status != 'Resolved' AND risk_level = 'Low'))::INT AS low_risk,
        (COUNT(*) FILTER (WHERE status = 'Escalated'))::INT AS escalated,
        (COUNT(*) FILTER (WHERE status = 'Under investigation'))::INT AS under_investigation,
        (COUNT(*) FILTER (WHERE status = 'Resolved' AND DATE_TRUNC('month',updated_at)=DATE_TRUNC('month',NOW())))::INT AS resolved_this_month,
        (SELECT COUNT(*)::INT FROM ews_loan_dump ${ldBranchCond}) AS total_portfolio_accounts,
        (
          SELECT COUNT(*)::INT 
          FROM ews_investigations i
          JOIN ews_watch_list w2 ON i.watch_list_id = w2.id
          WHERE i.status = 'Pending' AND i.deadline < NOW() ${overdueBranchCond}
        ) AS overdue
      FROM ews_watch_list
      ${whereClause}
    `;

    const result = await this.db.query(query, params);
    return result.rows[0];
  }

  async getBranchStats(filters?: { branch_ids?: string }) {
    let query = `
      SELECT
        COALESCE(b.name, d.branch_code) AS branch,
        b.id AS branch_id,
        COUNT(d.id)::INT AS total_accounts,
        COUNT(w.id) FILTER (WHERE w.status != 'Resolved') AS flagged,
        COUNT(w.id) FILTER (WHERE w.status = 'Under investigation') AS under_investigation,
        COUNT(w.id) FILTER (WHERE w.status = 'Escalated') AS escalated,
        MAX(w.updated_at) AS last_activity
      FROM ews_loan_dump d
      LEFT JOIN ews_watch_list w ON d.account_id = w.account_id
      LEFT JOIN ews_branches b ON d.branch_code = b.code
    `;
    const params: any[] = [];
    if (filters?.branch_ids) {
      const ids = Array.isArray(filters.branch_ids)
        ? filters.branch_ids
        : filters.branch_ids.split(',').map(Number);
      query += ` WHERE b.id = ANY($1)`;
      params.push(ids);
    }
    query += ` GROUP BY COALESCE(b.name, d.branch_code), b.id ORDER BY flagged DESC, total_accounts DESC`;
    const result = await this.db.query(query, params);
    return result.rows;
  }
}

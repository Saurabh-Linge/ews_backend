import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../core/database/database.service';

@Injectable()
export class AccountsService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(params: {
    page: number;
    limit: number;
    search?: string;
    branch?: string;
    flagged?: string;
  }) {
    const offset = (params.page - 1) * params.limit;
    
    let whereClauses = [];
    let values = [];
    let vIndex = 1;

    if (params.search) {
      whereClauses.push(`(d.account_id ILIKE $${vIndex} OR d.long_name ILIKE $${vIndex} OR d.account_no ILIKE $${vIndex})`);
      values.push(`%${params.search}%`);
      vIndex++;
    }

    if (params.branch) {
      whereClauses.push(`d.branch_code = $${vIndex}`);
      values.push(params.branch);
      vIndex++;
    }

    if (params.flagged === 'true') {
      whereClauses.push(`w.id IS NOT NULL`);
    } else if (params.flagged === 'false') {
      whereClauses.push(`w.id IS NULL`);
    }

    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*) as total 
      FROM ews_loan_dump d
      LEFT JOIN ews_watch_list w ON d.account_id = w.account_id
      ${whereString}
    `;

    const isUnlimited = params.limit === -1;

    const dataQuery = `
      SELECT d.*, 
             w.id as watch_list_id, 
             w.status as watch_list_status, 
             w.risk_level as watch_list_risk_level,
             w.added_at as watch_list_added_at,
             (
               SELECT json_agg(json_build_object('name', sig.name, 'rules', sa.details->'rules'))
               FROM ews_account_signals sa
               JOIN ews_signals sig ON sa.signal_id = sig.id
               WHERE sa.watch_list_id = w.id
             ) as signals_data
      FROM ews_loan_dump d
      LEFT JOIN ews_watch_list w ON d.account_id = w.account_id
      ${whereString}
      ORDER BY w.id NULLS LAST, d.id ASC
      ${isUnlimited ? '' : `LIMIT $${vIndex} OFFSET $${vIndex + 1}`}
    `;

    const queryParams = isUnlimited ? values : [...values, params.limit, offset];

    const [countRes, dataRes] = await Promise.all([
      this.db.query(countQuery, values),
      this.db.query(dataQuery, queryParams),
    ]);

    return {
      total: parseInt(countRes.rows[0].total, 10),
      data: dataRes.rows,
    };
  }

  async update(accountId: string, data: any) {
    // Filter out keys we shouldn't update directly
    const protectedKeys = ['id', 'account_id', 'uploaded_at', 'upload_id'];
    const keys = Object.keys(data).filter(k => !protectedKeys.includes(k));
    
    if (keys.length === 0) return { success: true };

    const setClauses = keys.map((k, i) => `"${k}" = $${i + 2}`);
    const values = keys.map(k => data[k]);

    const query = `
      UPDATE ews_loan_dump 
      SET ${setClauses.join(', ')}
      WHERE account_id = $1
      RETURNING *
    `;

    const result = await this.db.query(query, [accountId, ...values]);
    return result.rows[0];
  }
}

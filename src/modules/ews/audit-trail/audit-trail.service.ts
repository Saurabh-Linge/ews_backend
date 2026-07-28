import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../core/database/database.service';

@Injectable()
export class AuditTrailService {
  private readonly logger = new Logger(AuditTrailService.name);

  constructor(private readonly db: DatabaseService) {}

  async log(entry: {
    account_id: string;
    borrower_name: string;
    branch: string;
    action: string;
    performed_by: string;
    remarks?: string;
    attachments?: any[];
  }) {
    await this.db.query(
      `INSERT INTO ews_audit_trail (account_id, borrower_name, branch, action, performed_by, remarks, attachments, logged_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,CURRENT_TIMESTAMP)`,
      [
        entry.account_id,
        entry.borrower_name,
        entry.branch,
        entry.action,
        entry.performed_by,
        entry.remarks ?? '',
        entry.attachments ? JSON.stringify(entry.attachments) : null,
      ],
    );
  }

  async findAll(filters?: {
    branch?: string;
    action?: string;
    performed_by?: string;
    limit?: number;
  }) {
    let query = `
      SELECT id, account_id, borrower_name, branch, action, performed_by, remarks, attachments, logged_at
      FROM ews_audit_trail WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;

    if (filters?.branch) {
      query += ` AND branch = $${idx++}`;
      params.push(filters.branch);
    }
    if (filters?.action) {
      query += ` AND action = $${idx++}`;
      params.push(filters.action);
    }
    if (filters?.performed_by) {
      query += ` AND performed_by = $${idx++}`;
      params.push(filters.performed_by);
    }

    query += ' ORDER BY logged_at DESC';
    if (filters?.limit) {
      query += ` LIMIT $${idx++}`;
      params.push(filters.limit);
    }

    const result = await this.db.query(query, params);
    return result.rows;
  }
}

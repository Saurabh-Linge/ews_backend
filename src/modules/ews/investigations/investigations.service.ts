import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../core/database/database.service';
import { WatchListService } from '../watch-list/watch-list.service';
import { AuditTrailService } from '../audit-trail/audit-trail.service';

@Injectable()
export class InvestigationsService {
  private readonly logger = new Logger(InvestigationsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly watchList: WatchListService,
    private readonly auditTrail: AuditTrailService,
  ) {}

  async findAll(filters?: { branch?: string; status?: string }) {
    let query = `
      SELECT i.*, w.account_id, w.borrower_name, w.branch, w.loan_type, w.risk_level,
             EXTRACT(DAY FROM NOW() - i.sent_at)::INT AS days_open,
             (
               SELECT json_agg(json_build_object('name', sig.name, 'rules', sa.details->'rules'))
               FROM ews_account_signals sa
               JOIN ews_signals sig ON sa.signal_id = sig.id
               WHERE sa.watch_list_id = i.watch_list_id
             ) as signals_data
      FROM ews_investigations i
      JOIN ews_watch_list w ON w.id = i.watch_list_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;
    if (filters?.branch) {
      query += ` AND w.branch = $${idx++}`;
      params.push(filters.branch);
    }
    if (filters?.status) {
      query += ` AND i.status = $${idx++}`;
      params.push(filters.status);
    }
    query += ' ORDER BY i.sent_at DESC';
    const result = await this.db.query(query, params);
    return result.rows;
  }

  async findOne(id: number) {
    const result = await this.db.query(
      `SELECT i.*, w.account_id, w.borrower_name, w.branch, w.loan_type, w.risk_level,
             (
               SELECT json_agg(json_build_object('name', sig.name, 'rules', sa.details->'rules'))
               FROM ews_account_signals sa
               JOIN ews_signals sig ON sa.signal_id = sig.id
               WHERE sa.watch_list_id = i.watch_list_id
             ) as signals_data
       FROM ews_investigations i
       JOIN ews_watch_list w ON w.id = i.watch_list_id
       WHERE i.id = $1`,
      [id],
    );
    return result.rows[0] || null;
  }

  async sendForInvestigation(data: {
    watch_list_id: number;
    sent_by: string;
    notes?: string;
    deadline_days?: number;
    attachments?: any[];
  }) {
    const deadlineDays = data.deadline_days ?? 7;
    const result = await this.db.query(
      `INSERT INTO ews_investigations (watch_list_id, sent_by, notes, deadline, status, sent_at)
       VALUES ($1,$2,$3,NOW() + INTERVAL '${deadlineDays} days','Pending',CURRENT_TIMESTAMP)
       RETURNING *`,
      [data.watch_list_id, data.sent_by, data.notes ?? ''],
    );
    await this.watchList.updateStatus(
      data.watch_list_id,
      'Under investigation',
      data.sent_by,
    );
    const entry = await this.watchList.findOne(data.watch_list_id);
    await this.auditTrail.log({
      account_id: entry.account_id,
      borrower_name: entry.borrower_name,
      branch: entry.branch,
      action: 'Sent for investigation',
      performed_by: data.sent_by,
      remarks: data.notes ?? '',
      attachments: data.attachments,
    });
    return result.rows[0];
  }

  async submitBranchResponse(
    id: number,
    data: {
      branch_response: string;
      response_by: string;
      resolution_status?: string;
      attachments?: any[];
    },
  ) {
    const newResponse = {
      response: data.branch_response,
      by: data.response_by,
      status: data.resolution_status || 'In process',
      at: new Date().toISOString(),
      attachments: data.attachments || [],
    };

    const result = await this.db.query(
      `UPDATE ews_investigations
       SET branch_response=$1, response_by=$2, response_at=CURRENT_TIMESTAMP, 
           status='Branch responded', updated_at=CURRENT_TIMESTAMP,
           responses = COALESCE(responses, '[]'::jsonb) || $3::jsonb
       WHERE id=$4 RETURNING *`,
      [
        data.branch_response,
        data.response_by,
        JSON.stringify([newResponse]),
        id,
      ],
    );
    const inv = result.rows[0];
    const entry = await this.watchList.findOne(inv.watch_list_id);
    await this.auditTrail.log({
      account_id: entry.account_id,
      borrower_name: entry.borrower_name,
      branch: entry.branch,
      action: 'Branch response received',
      performed_by: `Branch (${entry.branch})`,
      remarks: data.branch_response.substring(0, 200),
      attachments: data.attachments,
    });
    return inv;
  }

  async sendReminder(id: number, sentBy: string) {
    await this.db.query(
      `UPDATE ews_investigations SET reminder_sent_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [id],
    );
    return { success: true };
  }
}

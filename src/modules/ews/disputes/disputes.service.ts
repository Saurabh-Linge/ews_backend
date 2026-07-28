import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../core/database/database.service';
import { AuditTrailService } from '../audit-trail/audit-trail.service';
import { WatchListService } from '../watch-list/watch-list.service';

@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly auditTrail: AuditTrailService,
    private readonly watchList: WatchListService
  ) {}

  async findAll(status?: string) {
    let query = `
      SELECT d.*, w.account_id, w.borrower_name, w.branch, s.name AS signal_name, s.number AS signal_number,
             (
               SELECT json_agg(json_build_object('name', sig.name, 'rules', sa.details->'rules'))
               FROM ews_account_signals sa
               JOIN ews_signals sig ON sa.signal_id = sig.id
               WHERE sa.watch_list_id = d.watch_list_id
             ) as signals_data
      FROM ews_disputes d
      JOIN ews_watch_list w ON w.id = d.watch_list_id
      LEFT JOIN ews_signals s ON s.id = d.signal_id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (status) {
      query += ' AND d.status = $1';
      params.push(status);
    }
    query += ' ORDER BY d.raised_at DESC';
    const result = await this.db.query(query, params);
    return result.rows;
  }

  async raise(data: {
    watch_list_id: number;
    signal_id: number;
    branch: string;
    reason: string;
    raised_by: string;
    attachments?: any[];
  }) {
    const result = await this.db.query(
      `INSERT INTO ews_disputes (watch_list_id, signal_id, branch, reason, raised_by, status, raised_at, attachments)
       VALUES ($1,$2,$3,$4,$5,'Pending',CURRENT_TIMESTAMP,$6) RETURNING *`,
      [
        data.watch_list_id,
        data.signal_id,
        data.branch,
        data.reason,
        data.raised_by,
        data.attachments ? JSON.stringify(data.attachments) : '[]',
      ],
    );

    const dispute = result.rows[0];
    const entry = await this.watchList.findOne(data.watch_list_id);
    
    await this.auditTrail.log({
      account_id: entry.account_id,
      borrower_name: entry.borrower_name,
      branch: entry.branch,
      action: 'Dispute raised by branch',
      performed_by: data.raised_by,
      remarks: data.reason,
      attachments: data.attachments,
    });

    return dispute;
  }

  async resolve(
    id: number,
    decision: 'Accepted' | 'Rejected',
    resolvedBy: string,
    notes?: string,
  ) {
    const result = await this.db.query(
      `UPDATE ews_disputes SET status=$1, resolved_by=$2, resolution_notes=$3, resolved_at=CURRENT_TIMESTAMP
       WHERE id=$4 RETURNING *`,
      [decision, resolvedBy, notes ?? '', id],
    );
    
    const dispute = result.rows[0];
    const entry = await this.watchList.findOne(dispute.watch_list_id);

    if (decision === 'Accepted') {
      if (dispute.signal_id) {
        await this.db.query(
          `DELETE FROM ews_account_signals WHERE watch_list_id = $1 AND signal_id = $2`,
          [dispute.watch_list_id, dispute.signal_id]
        );
      } else {
        await this.watchList.remove(dispute.watch_list_id, resolvedBy, 'Dispute Accepted');
      }
    }

    await this.auditTrail.log({
      account_id: entry.account_id,
      borrower_name: entry.borrower_name,
      branch: entry.branch,
      action: `Dispute ${decision}`,
      performed_by: resolvedBy,
      remarks: notes || `Dispute ${decision.toLowerCase()} by ${resolvedBy}`,
    });

    return dispute;
  }

  async findPendingByAccountAndSignal(accountId: string, signalId: number) {
    const result = await this.db.query(
      `SELECT d.*
       FROM ews_disputes d
       JOIN ews_watch_list w ON w.id = d.watch_list_id
       WHERE w.account_id = $1 AND d.signal_id = $2 AND d.status = 'Pending'`,
      [accountId, signalId],
    );
    return result.rows;
  }
}

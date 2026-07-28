import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../core/database/database.service';
import { WatchListService } from '../watch-list/watch-list.service';
import { AuditTrailService } from '../audit-trail/audit-trail.service';

@Injectable()
export class EscalationsService {
  private readonly logger = new Logger(EscalationsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly watchList: WatchListService,
    private readonly auditTrail: AuditTrailService,
  ) {}

  async findAll(status?: string) {
    let query = `
      SELECT e.*, w.account_id, w.borrower_name, w.branch, w.loan_type, w.risk_level,
             EXTRACT(DAY FROM NOW() - e.escalated_at)::INT AS days_since_escalation,
             (SELECT COUNT(*) FROM ews_account_signals s WHERE s.watch_list_id = e.watch_list_id) AS signal_count,
             (
               SELECT json_agg(json_build_object('name', sig.name, 'rules', sa.details->'rules'))
               FROM ews_account_signals sa
               JOIN ews_signals sig ON sa.signal_id = sig.id
               WHERE sa.watch_list_id = e.watch_list_id
             ) as signals_data
      FROM ews_escalations e
      JOIN ews_watch_list w ON w.id = e.watch_list_id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (status) {
      query += ' AND e.status = $1';
      params.push(status);
    }
    query += ' ORDER BY e.escalated_at DESC';
    const result = await this.db.query(query, params);
    return result.rows;
  }

  async escalate(data: {
    watch_list_id: number;
    escalated_by: string;
    reason: string;
    ro_recommendation: string;
    signal_count?: number;
  }) {
    const result = await this.db.query(
      `INSERT INTO ews_escalations (watch_list_id, escalated_by, reason, ro_recommendation, status, escalated_at)
       VALUES ($1,$2,$3,$4,'Pending CRO',CURRENT_TIMESTAMP) RETURNING *`,
      [
        data.watch_list_id,
        data.escalated_by,
        data.reason,
        data.ro_recommendation,
      ],
    );
    await this.watchList.updateStatus(
      data.watch_list_id,
      'Escalated',
      data.escalated_by,
    );
    const entry = await this.watchList.findOne(data.watch_list_id);
    await this.auditTrail.log({
      account_id: entry.account_id,
      borrower_name: entry.borrower_name,
      branch: entry.branch,
      action: 'Escalated to CRO',
      performed_by: data.escalated_by,
      remarks: data.reason,
    });
    return result.rows[0];
  }

  async decide(
    id: number,
    decision: 'Approved' | 'Sent back' | 'Downgraded' | 'Force escalated',
    decidedBy: string,
    notes?: string,
  ) {
    const result = await this.db.query(
      `UPDATE ews_escalations SET cro_decision=$1, decided_by=$2, decision_notes=$3, decided_at=CURRENT_TIMESTAMP, status=$1
       WHERE id=$4 RETURNING *`,
      [decision, decidedBy, notes ?? '', id],
    );
    const esc = result.rows[0];
    const entry = await this.watchList.findOne(esc.watch_list_id);

    let newStatus = 'Escalated';
    if (decision === 'Sent back') newStatus = 'Pending review';
    else if (decision === 'Downgraded') newStatus = 'Resolved';
    else newStatus = 'Approved by CRO';

    await this.watchList.updateStatus(esc.watch_list_id, newStatus, decidedBy);

    await this.auditTrail.log({
      account_id: entry.account_id,
      borrower_name: entry.borrower_name,
      branch: entry.branch,
      action: `CRO Decision: ${decision}`,
      performed_by: decidedBy,
      remarks: notes || decision,
    });

    return esc;
  }
}

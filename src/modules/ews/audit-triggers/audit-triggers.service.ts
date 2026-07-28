import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../core/database/database.service';
import { WatchListService } from '../watch-list/watch-list.service';
import { AuditTrailService } from '../audit-trail/audit-trail.service';

@Injectable()
export class AuditTriggersService {
  private readonly logger = new Logger(AuditTriggersService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly watchList: WatchListService,
    private readonly auditTrail: AuditTrailService,
  ) {}

  /**
   * Receives a trigger from AuditPro via API.
   * Maps audit question answers to EWS signals and adds account to watch list.
   */
  async receiveFromAuditPro(payload: {
    account_id: string;
    borrower_name: string;
    branch: string;
    branch_id?: number;
    loan_type: string;
    audit_id: string;
    triggered_signals: Array<{
      signal_id: number;
      question: string;
      answer: string;
      risk_level: 'High' | 'Medium' | 'Low';
    }>;
    triggered_by: string;
  }) {
    // Add to watch list
    const entry = await this.watchList.add({
      account_id: payload.account_id,
      borrower_name: payload.borrower_name,
      branch: payload.branch,
      branch_id: payload.branch_id,
      loan_type: payload.loan_type,
      source: 'Auditor',
      added_by: payload.triggered_by,
      risk_level: this.computeRisk(payload.triggered_signals),
    });

    // Record each signal
    for (const sig of payload.triggered_signals) {
      await this.db.query(
        `INSERT INTO ews_account_signals (watch_list_id, signal_id, layer, details, triggered_at)
         VALUES ($1, $2, 1, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (watch_list_id, signal_id, layer) DO NOTHING`,
        [
          entry.id,
          sig.signal_id,
          JSON.stringify({ question: sig.question, answer: sig.answer }),
        ],
      );
    }

    // Record audit trigger
    await this.db.query(
      `INSERT INTO ews_audit_triggers (watch_list_id, audit_id, triggered_by, signal_count, created_at)
       VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP)`,
      [
        entry.id,
        payload.audit_id,
        payload.triggered_by,
        payload.triggered_signals.length,
      ],
    );

    // Audit trail
    await this.auditTrail.log({
      account_id: payload.account_id,
      borrower_name: payload.borrower_name,
      branch: payload.branch,
      action: 'Added to watch list',
      performed_by: `Auditor (auto) — ${payload.triggered_by}`,
      remarks: `${payload.triggered_signals.length} signal(s) triggered via audit`,
    });

    return { success: true, watch_list_id: entry.id };
  }

  async findByWatchListId(watchListId: number) {
    const result = await this.db.query(
      `SELECT at.*, s.name AS signal_name, s.number AS signal_number
       FROM ews_audit_triggers at
       LEFT JOIN ews_account_signals acs ON acs.watch_list_id = at.watch_list_id AND acs.layer = 1
       LEFT JOIN ews_signals s ON s.id = acs.signal_id
       WHERE at.watch_list_id = $1`,
      [watchListId],
    );
    return result.rows;
  }

  private computeRisk(signals: Array<{ risk_level: string }>) {
    if (signals.some((s) => s.risk_level === 'High')) return 'High';
    if (signals.some((s) => s.risk_level === 'Medium')) return 'Medium';
    return 'Low';
  }
}

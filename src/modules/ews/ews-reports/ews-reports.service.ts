import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../core/database/database.service';

@Injectable()
export class EwsReportsService {
  private readonly logger = new Logger(EwsReportsService.name);

  constructor(private readonly db: DatabaseService) {}

  async getWatchListReport(filters?: any) {
    const result = await this.db.query(`
      SELECT w.account_id, w.borrower_name, w.branch, w.loan_type, w.risk_level,
             w.status, w.source, EXTRACT(DAY FROM NOW() - w.added_at)::INT AS days_on_list,
             COUNT(s.id) AS signal_count,
             (
               SELECT json_agg(json_build_object('name', sig.name, 'rules', sa.details->'rules'))
               FROM ews_account_signals sa
               JOIN ews_signals sig ON sa.signal_id = sig.id
               WHERE sa.watch_list_id = w.id
             ) as signals_data
      FROM ews_watch_list w
      LEFT JOIN ews_account_signals s ON s.watch_list_id = w.id
      WHERE w.removed_at IS NULL
      GROUP BY w.id ORDER BY w.added_at DESC
    `);
    return result.rows;
  }

  async getInvestigationStatusReport() {
    const result = await this.db.query(`
      SELECT i.id, w.account_id, w.borrower_name, w.branch, w.loan_type, w.risk_level,
             i.sent_at, i.deadline, i.branch_response, i.response_at, i.status,
             EXTRACT(DAY FROM NOW() - i.sent_at)::INT AS days_open,
             (i.deadline < NOW() AND i.response_at IS NULL) AS is_overdue,
             (
               SELECT json_agg(json_build_object('name', sig.name, 'rules', sa.details->'rules'))
               FROM ews_account_signals sa
               JOIN ews_signals sig ON sa.signal_id = sig.id
               WHERE sa.watch_list_id = w.id
             ) as signals_data
      FROM ews_investigations i
      JOIN ews_watch_list w ON w.id = i.watch_list_id
      ORDER BY i.sent_at DESC
    `);
    return result.rows;
  }

  async getBranchSummaryReport() {
    const result = await this.db.query(`
      SELECT
        w.branch,
        COUNT(*) FILTER (WHERE w.removed_at IS NULL) AS total_flagged,
        COUNT(*) FILTER (WHERE w.removed_at IS NULL AND w.status='Under investigation') AS pending_inv,
        COUNT(*) FILTER (WHERE w.removed_at IS NOT NULL) AS resolved,
        ROUND(100.0 * COUNT(*) FILTER (WHERE w.removed_at IS NOT NULL) / NULLIF(COUNT(*),0), 1) AS resolution_rate
      FROM ews_watch_list w
      GROUP BY w.branch ORDER BY total_flagged DESC
    `);
    return result.rows;
  }

  async getBankWideReport() {
    const result = await this.db.query(`
      SELECT
        COUNT(*) FILTER (WHERE removed_at IS NULL) AS active,
        COUNT(*) FILTER (WHERE removed_at IS NULL AND risk_level = 'High') AS high_risk,
        COUNT(*) FILTER (WHERE removed_at IS NULL AND status='Escalated') AS escalated,
        COUNT(*) FILTER (WHERE removed_at IS NULL AND status='Under investigation') AS under_investigation,
        COUNT(*) FILTER (WHERE removed_at IS NOT NULL AND DATE_TRUNC('month',removed_at)=DATE_TRUNC('month',NOW())) AS resolved_this_month
      FROM ews_watch_list
    `);
    return result.rows[0];
  }

  async getHighRiskReport() {
    const result = await this.db.query(`
      SELECT w.*, EXTRACT(DAY FROM NOW() - w.added_at)::INT AS days_on_list, COUNT(s.id) AS signal_count,
             (
               SELECT json_agg(json_build_object('name', sig.name, 'rules', sa.details->'rules'))
               FROM ews_account_signals sa
               JOIN ews_signals sig ON sa.signal_id = sig.id
               WHERE sa.watch_list_id = w.id
             ) as signals_data
      FROM ews_watch_list w
      LEFT JOIN ews_account_signals s ON s.watch_list_id = w.id
      WHERE w.removed_at IS NULL AND w.risk_level = 'High'
      GROUP BY w.id ORDER BY w.risk_level DESC, signal_count DESC
    `);
    return result.rows;
  }

  async getOverdueReport() {
    const result = await this.db.query(`
      SELECT i.*, w.account_id, w.borrower_name, w.branch, w.loan_type,
             EXTRACT(DAY FROM NOW() - i.sent_at)::INT AS days_overdue,
             (
               SELECT json_agg(json_build_object('name', sig.name, 'rules', sa.details->'rules'))
               FROM ews_account_signals sa
               JOIN ews_signals sig ON sa.signal_id = sig.id
               WHERE sa.watch_list_id = w.id
             ) as signals_data
      FROM ews_investigations i
      JOIN ews_watch_list w ON w.id = i.watch_list_id
      WHERE i.deadline < NOW() AND i.response_at IS NULL
      ORDER BY i.sent_at ASC
    `);
    return result.rows;
  }

  async getSignalWiseReport() {
    const result = await this.db.query(`
      SELECT s.number, s.name, s.category, COUNT(acs.id) AS account_count, COUNT(DISTINCT acs.watch_list_id) AS unique_accounts
      FROM ews_signals s
      LEFT JOIN ews_account_signals acs ON acs.signal_id = s.id
      GROUP BY s.id ORDER BY account_count DESC
    `);
    return result.rows;
  }

  async getResolvedReport() {
    const result = await this.db.query(`
      SELECT w.account_id, w.borrower_name, w.branch, w.loan_type, w.resolution,
             w.added_at, w.removed_at, w.removed_by,
             EXTRACT(DAY FROM w.removed_at - w.added_at)::INT AS days_to_resolve
      FROM ews_watch_list w
      WHERE w.removed_at IS NOT NULL
      ORDER BY w.removed_at DESC
    `);
    return result.rows;
  }
}

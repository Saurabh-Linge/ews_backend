import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../core/database/database.service';

const DEFAULT_CONFIG = [
  { key: 'threshold_low', value: '1' },
  { key: 'threshold_medium', value: '3' },
  { key: 'threshold_high', value: '6' },
  { key: 'threshold_very_high', value: '10' },
  { key: 'weight_high_signal', value: '3' },
  { key: 'weight_medium_signal', value: '2' },
  { key: 'weight_low_signal', value: '1' },
  { key: 'auto_escalate_risk', value: 'High' },
  { key: 'ro_cannot_close_risk', value: 'High' },
  { key: 'investigation_deadline_days', value: '7' },
  { key: 'overdue_alert_days', value: '7' },
  { key: 'ro_questionnaire_mode', value: 'full' },
];

@Injectable()
export class RiskConfigService {
  private readonly logger = new Logger(RiskConfigService.name);

  constructor(private readonly db: DatabaseService) {}

  async getAll() {
    const result = await this.db.query(
      'SELECT * FROM ews_risk_config ORDER BY key ASC',
    );
    const map: Record<string, string> = {};
    for (const row of result.rows) {
      map[row.key] = row.value;
    }
    return map;
  }

  async get(key: string) {
    const result = await this.db.query(
      'SELECT value FROM ews_risk_config WHERE key = $1',
      [key],
    );
    return result.rows[0]?.value ?? null;
  }

  async set(key: string, value: string, changedBy: string) {
    await this.db.query(
      `INSERT INTO ews_risk_config (key, value, changed_by, updated_at)
       VALUES ($1,$2,$3,CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value=$2, changed_by=$3, updated_at=CURRENT_TIMESTAMP`,
      [key, value, changedBy],
    );
    return { key, value };
  }

  async setBulk(configs: Record<string, string>, changedBy: string) {
    for (const [key, value] of Object.entries(configs)) {
      await this.set(key, value, changedBy);
    }
    return this.getAll();
  }

  async getChangeLog() {
    const result = await this.db.query(
      'SELECT * FROM ews_config_changelog ORDER BY changed_at DESC LIMIT 100',
    );
    return result.rows;
  }
}

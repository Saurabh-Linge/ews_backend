import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../core/database/database.service';

@Injectable()
export class LoanTypeSignalConfigService {
  private readonly logger = new Logger(LoanTypeSignalConfigService.name);

  constructor(private readonly db: DatabaseService) {}

  async findAll() {
    const result = await this.db.query(
      `SELECT ltsc.*, s.name AS signal_name, s.number AS signal_number, s.category
       FROM ews_loan_type_signal_config ltsc
       JOIN ews_signals s ON s.id = ltsc.signal_id
       ORDER BY ltsc.loan_type, s.number ASC`,
    );
    return result.rows;
  }

  async findByLoanType(loanType: string) {
    const result = await this.db.query(
      `SELECT ltsc.applicability, s.id, s.number, s.name, s.category, s.default_risk
       FROM ews_loan_type_signal_config ltsc
       JOIN ews_signals s ON s.id = ltsc.signal_id
       WHERE ltsc.loan_type = $1
       ORDER BY s.number ASC`,
      [loanType],
    );
    return result.rows;
  }

  async getLoanTypes() {
    const result = await this.db.query(
      'SELECT id, product_code, product_name as loan_type, product_name as name FROM ews_loan_products ORDER BY product_name ASC',
    );
    return result.rows;
  }

  async getSummary() {
    const query = `
      SELECT 
        lp.product_name as loan_type,
        COUNT(c.id) FILTER (WHERE c.applicability = 'Y') as always_y,
        COUNT(c.id) FILTER (WHERE c.applicability = 'C') as conditional_c,
        COUNT(c.id) FILTER (WHERE c.applicability IN ('Y', 'C')) as total_shown,
        COUNT(c.id) FILTER (WHERE c.applicability = 'N') as skipped_n,
        COUNT(c.id) FILTER (WHERE c.applicability IN ('Y', 'C')) * 5 as est_q
      FROM ews_loan_products lp
      LEFT JOIN ews_loan_type_signal_config c ON c.loan_type = lp.product_name
      GROUP BY lp.product_name
      ORDER BY lp.product_name ASC
    `;
    const result = await this.db.query(query);
    return result.rows;
  }

  async update(
    signalId: number,
    loanType: string,
    applicability: 'Y' | 'C' | 'N',
    changedBy: string,
  ) {
    const result = await this.db.query(
      `INSERT INTO ews_loan_type_signal_config (signal_id, loan_type, applicability, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP)
       ON CONFLICT (signal_id, loan_type) DO UPDATE SET applicability=$3, updated_by=$4, updated_at=CURRENT_TIMESTAMP
       RETURNING *`,
      [signalId, loanType, applicability, changedBy],
    );
    return result.rows[0];
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../core/database/database.service';

@Injectable()
export class RoAssessmentService {
  private readonly logger = new Logger(RoAssessmentService.name);

  constructor(private readonly db: DatabaseService) {}

  async findByWatchListId(watchListId: number) {
    const result = await this.db.query(
      `SELECT ra.*, s.name AS signal_name, s.number AS signal_number
       FROM ews_ro_assessments ra
       LEFT JOIN ews_signals s ON s.id = ra.signal_id
       WHERE ra.watch_list_id = $1
       ORDER BY ra.created_at DESC`,
      [watchListId],
    );
    return result.rows;
  }

  async saveAnswer(data: {
    watch_list_id: number;
    signal_id?: number;
    question_text: string;
    answer: string;
    risk_area: string;
    ro_user: string;
  }) {
    const result = await this.db.query(
      `INSERT INTO ews_ro_assessments (watch_list_id, signal_id, question_text, answer, risk_area, ro_user, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)
       ON CONFLICT (watch_list_id, question_text)
       DO UPDATE SET answer=$4, ro_user=$6, updated_at=CURRENT_TIMESTAMP
       RETURNING *`,
      [
        data.watch_list_id,
        data.signal_id ?? null,
        data.question_text,
        data.answer,
        data.risk_area,
        data.ro_user,
      ],
    );
    return result.rows[0];
  }

  async saveBulkAnswers(watchListId: number, answers: any[], roUser: string) {
    const results = [];
    for (const a of answers) {
      const r = await this.saveAnswer({
        ...a,
        watch_list_id: watchListId,
        ro_user: roUser,
      });
      results.push(r);
    }
    return results;
  }

  async getQuestionnaire(watchListId: number, loanType: string) {
    // Returns questions applicable for this loan type
    const result = await this.db.query(
      `SELECT s.id AS signal_id, s.number, s.name AS signal_name, s.category,
              ltsc.applicability, s.default_risk,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', sq.id,
                    'text', sq.question_text,
                    'type', sq.question_type,
                    'cbs', sq.cbs_availability
                  ) ORDER BY sq.id
                ) FILTER (WHERE sq.id IS NOT NULL), '[]'
              ) AS questions
       FROM ews_signals s
       JOIN ews_loan_type_signal_config ltsc ON ltsc.signal_id = s.id
       LEFT JOIN ews_signal_questions sq ON sq.signal_id = s.id
       WHERE ltsc.loan_type = $1 AND ltsc.applicability IN ('Y','C') AND s.enabled = true
       GROUP BY s.id, ltsc.applicability
       ORDER BY s.number ASC`,
      [loanType],
    );
    return result.rows;
  }
}


import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../../core/database/database.service';
import { CbsRulesService } from '../../cbs-rules/cbs-rules.service';

@Injectable()
export class LoanQuestionsService {
  private readonly logger = new Logger(LoanQuestionsService.name);
  constructor(
    private readonly db: DatabaseService,
    private readonly cbsRules: CbsRulesService,
  ) {}

  async findAll() {
    const res = await this.db.query('SELECT * FROM ews_loan_questions ORDER BY id ASC');
    return res.rows;
  }

  async findOne(id: number) {
    const res = await this.db.query('SELECT * FROM ews_loan_questions WHERE id = $1', [id]);
    if (res.rowCount === 0) throw new NotFoundException('Question not found');
    return res.rows[0];
  }

  async create(data: any) {
    const isActive = data.is_active !== undefined ? data.is_active : true;
    const res = await this.db.query(
      `INSERT INTO ews_loan_questions (question_desc, type, options, reference_name, loan_products, is_active)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [data.question_desc, data.type, JSON.stringify(data.options || []), data.reference_name, JSON.stringify(data.loan_products || []), isActive]
    );
    return res.rows[0];
  }

  async update(id: number, data: any) {
    const isActive = data.is_active !== undefined ? data.is_active : true;
    const res = await this.db.query(
      `UPDATE ews_loan_questions
       SET question_desc = $1, type = $2, options = $3, reference_name = $4, loan_products = $5, is_active = $6, updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [data.question_desc, data.type, JSON.stringify(data.options || []), data.reference_name, JSON.stringify(data.loan_products || []), isActive, id]
    );
    if (res.rowCount === 0) throw new NotFoundException('Question not found');
    return res.rows[0];
  }

  async remove(id: number) {
    const res = await this.db.query('DELETE FROM ews_loan_questions WHERE id = $1 RETURNING id', [id]);
    if (res.rowCount === 0) throw new NotFoundException('Question not found');
    return { success: true };
  }

  /**
   * Get questions for account. Accepts account_id string (e.g "AJR001").
   * Also fetches existing saved answers using the dump row id.
   */
  async getByAccountStr(accountStr: string) {
    // Resolve dump row
    const accRes = await this.db.query(
      'SELECT id, scheme_desc FROM ews_loan_dump WHERE account_id = $1 ORDER BY id DESC LIMIT 1',
      [accountStr]
    );
    const dumpRow = accRes.rows[0];
    const dumpId = dumpRow?.id ?? null;
    const schemeDesc = dumpRow?.scheme_desc ?? null;
    return this.fetchQuestions(dumpId, schemeDesc);
  }

  /**
   * Get questions for a dump row by numeric dump ID.
   */
  async getForAccount(dumpId: number) {
    const accRes = await this.db.query(
      'SELECT id, scheme_desc FROM ews_loan_dump WHERE id = $1',
      [dumpId]
    );
    if (accRes.rowCount === 0) throw new NotFoundException('Account not found');
    const schemeDesc = accRes.rows[0].scheme_desc;
    return this.fetchQuestions(dumpId, schemeDesc);
  }

  private async fetchQuestions(dumpId: number | null, schemeDesc: string | null) {
    const qRes = await this.db.query(
      `SELECT 
          q.id, q.question_desc, q.type, q.options, q.reference_name, q.is_active, q.loan_products,
          a.answer_value
       FROM ews_loan_questions q
       LEFT JOIN ews_account_question_answers a 
         ON a.question_id = q.id 
         AND a.account_id = $1
       WHERE q.is_active = true 
       ORDER BY q.id ASC`,
      [dumpId]
    );

    // Filter by loan product in JS to avoid JSONB operator type-casting issues
    return qRes.rows.filter((q: any) => {
      const lp = q.loan_products;
      if (!lp || !Array.isArray(lp) || lp.length === 0) return true;
      if (!schemeDesc) return true;
      return lp.some((p: string) =>
        p?.trim()?.toLowerCase() === schemeDesc?.trim()?.toLowerCase()
      );
    });
  }

  async saveAnswers(accountId: number, answers: any[], answeredBy: string) {
    if (answers && answers.length > 0) {
      const values = [];
      const queryParams = [];
      let pIdx = 1;

      for (const ans of answers) {
        values.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, NOW())`);
        queryParams.push(accountId, ans.question_id, ans.answer_value, answeredBy);
      }

      await this.db.query(
        `INSERT INTO ews_account_question_answers (account_id, question_id, answer_value, answered_by, answered_at)
         VALUES ${values.join(', ')}
         ON CONFLICT (account_id, question_id) 
         DO UPDATE SET answer_value = EXCLUDED.answer_value, answered_by = EXCLUDED.answered_by, answered_at = NOW()`,
        queryParams
      );
    }

    // After saving answers, trigger a targeted sweep of RO rules (those starting with 'RO Q')
    // for this specific account's dump row.
    let evaluationResult = { firedSignals: [], maxRisk: 'Low' };
    try {
      evaluationResult = await this.cbsRules.evaluateAccountForRoRules(accountId);
    } catch(e) {
      this.logger.error(`RO rules sweep failed for account ${accountId}: ${e.message}`);
    }

    return { success: true, evaluation: evaluationResult };
  }
}

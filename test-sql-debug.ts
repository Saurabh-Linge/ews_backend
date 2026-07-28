import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: 'c:/lukman/kredpool/ews/backend/.env' });

async function check() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT q.*, a.answer_value 
       FROM ews_loan_questions q
       LEFT JOIN ews_account_question_answers a ON a.question_id = q.id AND a.account_id = $1
       WHERE q.is_active = true 
       AND (
         q.loan_products IS NULL 
         OR jsonb_typeof(q.loan_products) = 'null'
         OR (jsonb_typeof(q.loan_products) = 'array' AND jsonb_array_length(q.loan_products) = 0)
         OR (jsonb_typeof(q.loan_products) = 'array' AND q.loan_products ? $2)
       )
       ORDER BY q.id ASC
    `, [41, 'OVER DRAFT']);
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  }
  await client.end();
}
check();

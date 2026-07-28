import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ews_loan_questions (
        id SERIAL PRIMARY KEY,
        question_desc TEXT NOT NULL,
        type VARCHAR(50) NOT NULL,
        options JSONB,
        reference_name VARCHAR(255) UNIQUE NOT NULL,
        loan_products JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("Created table ews_loan_questions");

  } catch(e) {
    console.error("Error migrating DB:", e);
  } finally {
    pool.end();
  }
}
run();

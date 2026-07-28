const { Pool } = require('pg');
require('dotenv').config({ path: './backend/.env' });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const sql = `
  ALTER TABLE proposal_income_job
    ADD COLUMN IF NOT EXISTS salary_bank_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS salary_branch_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS salary_ifsc_code VARCHAR(20);
`;

pool.query(sql)
  .then(() => { console.log('Migration success: bank columns added.'); pool.end(); })
  .catch(e => { console.error('Migration failed:', e.message); pool.end(); });

const xlsx = require('xlsx');
const fs = require('fs');
const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ews',
  password: '',
  port: 5432,
});

async function runImport() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('Starting Excel import...');

    // 1. Loan Products
    console.log('Importing Loan Products...');
    const lpFile = '../rssb loan product with scheme code.xlsx';
    if (fs.existsSync(lpFile)) {
      const ws = xlsx.readFile(lpFile).Sheets['Sheet1'];
      const rows = xlsx.utils.sheet_to_json(ws, { header: 1 }).slice(1); // skip header
      for (const row of rows) {
        if (!row[0]) continue;
        const pCode = String(row[0]).trim();
        const pName = String(row[1]).trim();
        const sCode = String(row[2]).trim();
        const sDesc = String(row[3]).trim();
        await client.query(
          `INSERT INTO ews_loan_products (product_code, product_name, scheme_code, scheme_desc) VALUES ($1, $2, $3, $4)`,
          [pCode, pName, sCode, sDesc]
        );
      }
      console.log('Loan Products imported.');
    }

    // 2. CBS Account Data
    console.log('Importing CBS Account Data...');
    const cbsFiles = ['../RSSB account temp 1 1.xlsx', '../RSSB account temp 2 1.xlsx'];
    for (const file of cbsFiles) {
      if (fs.existsSync(file)) {
        const ws = xlsx.readFile(file).Sheets['Sheet1'];
        const rows = xlsx.utils.sheet_to_json(ws, { header: 1 }).slice(1);
        for (const row of rows) {
          if (!row[0]) continue;
          const accountId = String(row[0]).trim();
          const branchCode = String(row[3]).trim();
          const customerId = String(row[4]).trim();
          const facilityType = row[9] ? String(row[9]).trim() : null;
          const schemeCode = row[8] ? String(row[8]).trim() : null;
          const balanceOutstanding = parseFloat(row[17]) || 0;
          const currentLimit = parseFloat(row[20]) || 0;
          const drawingPower = parseFloat(row[22]) || 0;
          const overdueAmt = parseFloat(row[24]) || 0;
          const assetClass = row[32] ? String(row[32]).trim() : null;

          await client.query(
            `INSERT INTO ews_cbs_account_data (account_id, branch_code, customer_id, facility_type, scheme_code, balance_outstanding, current_limit, drawing_power, overdue_amt, asset_class) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [accountId, branchCode, customerId, facilityType, schemeCode, balanceOutstanding, currentLimit, drawingPower, overdueAmt, assetClass]
          );
        }
        console.log(`CBS Data from ${file} imported.`);
      }
    }

    // 3. RO Questions
    console.log('Importing RO Questions...');
    const qFile = '../RO_EWS_Questionnaire_Refined.xlsx';
    if (fs.existsSync(qFile)) {
      const ws = xlsx.readFile(qFile).Sheets['RO EWS Questionnaire'];
      const rows = xlsx.utils.sheet_to_json(ws, { header: 1 });
      let currentSignalNumber = 0;
      
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        
        const col0 = String(row[0]).trim();
        if (col0.startsWith('SIGNAL')) {
          const match = col0.match(/SIGNAL\s+(\d+)/);
          if (match) currentSignalNumber = parseInt(match[1], 10);
        } else if (/^\d+\.\d+/.test(col0)) {
          // Question row
          const qText = String(row[1]).trim();
          const cbs = row[8] ? String(row[8]).trim() : null;
          const isGate = col0.endsWith('.1') ? 'Gate' : 'Follow-up';

          if (currentSignalNumber > 0 && qText && qText !== 'undefined') {
            await client.query(
              `INSERT INTO ews_signal_questions (signal_id, question_text, question_type, cbs_availability)
               SELECT id, $2, $3, $4 FROM ews_signals WHERE number = $1`,
              [currentSignalNumber, qText, isGate, cbs]
            );
          }
        }
      }
      console.log('RO Questions imported.');
    }

    await client.query('COMMIT');
    console.log('Import complete!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Import failed:', err);
  } finally {
    client.release();
    pool.end();
  }
}

runImport();

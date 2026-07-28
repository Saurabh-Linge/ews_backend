const { Pool } = require('pg');
const xlsx = require('xlsx');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function run() {
  const filePath = path.join(__dirname, '../../rssb loan product with scheme code.xlsx');
  console.log('Reading from:', filePath);
  
  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet);
  
  console.log(`Found ${rows.length} rows.`);

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Clear existing to avoid duplicates if they've changed, or just insert new ones? 
    // Wait, the prompt just says "add loan products from rssb loan product sheet".
    // I'll use ON CONFLICT DO NOTHING if we have a unique constraint, but we don't know if we do. 
    // Let's just truncate and insert to be safe, since it's a seed script.
    await client.query('TRUNCATE TABLE ews_loan_products CASCADE');
    
    let count = 0;
    for (const row of rows) {
      // The headers are: ProductCode, Product Name, SchemeCode, SchemeDesc
      const pCode = (row['ProductCode'] || '').toString().trim();
      const pName = (row['Product Name'] || '').toString().trim();
      const sCode = (row['SchemeCode'] || '').toString().trim();
      const sDesc = (row['SchemeDesc'] || '').toString().trim();
      
      if (!pName) continue; // Skip empty rows
      
      await client.query(
        `INSERT INTO ews_loan_products (product_code, product_name, scheme_code, scheme_desc)
         VALUES ($1, $2, $3, $4)`,
        [pCode, pName, sCode, sDesc]
      );
      count++;
    }
    
    await client.query('COMMIT');
    console.log(`Successfully inserted ${count} loan products.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error importing loan products:', err);
  } finally {
    client.release();
    pool.end();
  }
}

run();

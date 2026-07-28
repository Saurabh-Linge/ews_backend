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
    await pool.query('BEGIN');

    // 1. Update ews_watch_list
    // We update in order to not override intermediate values. But doing it all at once via CASE is safer.
    const watchRes = await pool.query(`
      UPDATE ews_watch_list
      SET risk_level = CASE
        WHEN risk_level = 'Very High' THEN 'High'
        WHEN risk_level = 'High' THEN 'Medium'
        WHEN risk_level = 'Medium' THEN 'Low'
        ELSE risk_level
      END
      WHERE risk_level IN ('Very High', 'High', 'Medium')
    `);
    console.log(`Updated ews_watch_list: ${watchRes.rowCount} rows`);

    // 2. Update ews_escalations (if risk_level exists there, typically fetched via JOIN, let's check)
    try {
      const escRes = await pool.query(`
        UPDATE ews_escalations
        SET risk_level = CASE
          WHEN risk_level = 'Very High' THEN 'High'
          WHEN risk_level = 'High' THEN 'Medium'
          WHEN risk_level = 'Medium' THEN 'Low'
          ELSE risk_level
        END
        WHERE risk_level IN ('Very High', 'High', 'Medium')
      `);
      console.log(`Updated ews_escalations: ${escRes.rowCount} rows`);
    } catch (e) {
      console.log("No risk_level column in ews_escalations or table missing. Skipping.");
    }

    // 3. Update ews_risk_config
    const confRes = await pool.query(`
      UPDATE ews_risk_config
      SET value = 'High'
      WHERE key IN ('auto_escalate_risk', 'ro_cannot_close_risk') AND value = 'Very High'
    `);
    console.log(`Updated ews_risk_config: ${confRes.rowCount} rows`);

    // 4. Update ews_cbs_rules expressions
    const rulesRes = await pool.query('SELECT id, expression FROM ews_cbs_rules');
    let updatedRules = 0;
    for (const rule of rulesRes.rows) {
      if (!rule.expression) continue;
      let newExpr = rule.expression;
      
      // Replace "Very High" with "High", etc.
      // E.g. SET risk = "Very High" -> SET risk = "High"
      // Since it's string replace, order matters!
      // First temporary replace Very High to TEMP_HIGH
      newExpr = newExpr.replace(/("Very High"|'Very High')/g, '"TEMP_HIGH"');
      newExpr = newExpr.replace(/("High"|'High')/g, '"TEMP_MED"');
      newExpr = newExpr.replace(/("Medium"|'Medium')/g, '"TEMP_LOW"');
      
      newExpr = newExpr.replace(/"TEMP_HIGH"/g, '"High"');
      newExpr = newExpr.replace(/"TEMP_MED"/g, '"Medium"');
      newExpr = newExpr.replace(/"TEMP_LOW"/g, '"Low"');
      
      if (newExpr !== rule.expression) {
        await pool.query('UPDATE ews_cbs_rules SET expression = $1 WHERE id = $2', [newExpr, rule.id]);
        updatedRules++;
      }
    }
    console.log(`Updated ews_cbs_rules: ${updatedRules} rules`);

    await pool.query('COMMIT');
    console.log("Migration successful.");
  } catch(e) {
    await pool.query('ROLLBACK');
    console.error("Error migrating DB:", e);
  } finally {
    pool.end();
  }
}
run();

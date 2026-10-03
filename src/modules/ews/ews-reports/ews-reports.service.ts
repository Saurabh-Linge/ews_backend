import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../core/database/database.service';

/** Helper to parse array / comma-separated filter values into a clean string array */
function parseArrayFilter(val: any): string[] {
  if (!val) return [];
  let arr: string[] = [];
  if (Array.isArray(val)) {
    arr = val.map(v => String(v).trim());
  } else if (typeof val === 'string') {
    arr = val.split(',').map(v => v.trim());
  } else {
    arr = [String(val).trim()];
  }
  return arr.filter(v => v && v.toLowerCase() !== 'all');
}

@Injectable()
export class EwsReportsService {
  private readonly logger = new Logger(EwsReportsService.name);

  constructor(private readonly db: DatabaseService) {}

  // ──────────────────────────────────────────────────────────────────────────
  // REPORT 02 — ACCOUNT SIGNAL DETAIL REPORT
  // ──────────────────────────────────────────────────────────────────────────
  async getAccountSignalDetailReport(filters?: {
    branch?: any;
    risk_level?: any;
    product?: string;
    search?: string;
    min_amount?: number;
    limit?: number;
  }) {
    const params: any[] = [];
    let whereClauses: string[] = [];

    const branches = parseArrayFilter(filters?.branch);
    if (branches.length > 0) {
      params.push(branches);
      whereClauses.push(`branch_code = ANY($${params.length}::varchar[])`);
    }

    if (filters?.product && filters.product !== 'all') {
      params.push(`%${filters.product}%`);
      whereClauses.push(`product_desc ILIKE $${params.length}`);
    }

    if (filters?.search && filters.search.trim()) {
      params.push(`%${filters.search.trim()}%`);
      whereClauses.push(`(account_no ILIKE $${params.length} OR long_name ILIKE $${params.length})`);
    }

    if (filters?.min_amount && Number(filters.min_amount) > 0) {
      params.push(Number(filters.min_amount));
      whereClauses.push(`ABS(COALESCE(principal_outstanding, 0)) >= $${params.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const limitVal = filters?.limit ? Math.min(Number(filters.limit), 2000) : 500;

    const riskLevels = parseArrayFilter(filters?.risk_level).map(r => r.toUpperCase());
    let riskFilterSql = '';
    if (riskLevels.length > 0) {
      params.push(riskLevels);
      riskFilterSql = `WHERE overall_risk = ANY($${params.length}::varchar[])`;
    }

    const query = `
      WITH account_flags AS (
        SELECT 
          id,
          branch_code as branch,
          account_no,
          COALESCE(NULLIF(TRIM(long_name), ''), '(Not on record)') as account_holder,
          COALESCE(product_desc, 'GENERAL ADVANCE') as product,
          ABS(COALESCE(principal_outstanding, 0)) as principal_os,
          COALESCE(UPPER(TRIM(bank_cust_rating)), 'STANDARD') as irac_rating,
          ARRAY_REMOVE(ARRAY[
            CASE WHEN UPPER(TRIM(npa)) = 'Y' THEN 'NPA = Y (Confirmed NPA) [VERY HIGH]' END,
            CASE 
              WHEN bank_cust_rating IN ('SUB STANDARD','DOUBTFUL 1','DOUBTFUL 2','DOUBTFUL 3') THEN 'SMA / IRAC Staging (' || bank_cust_rating || ') [VERY HIGH]'
              WHEN bank_cust_rating IN ('SMA 1','SMA 2') THEN 'SMA / IRAC Staging (' || bank_cust_rating || ') [HIGH]'
              WHEN bank_cust_rating = 'SMA 0' THEN 'SMA / IRAC Staging (SMA 0) [MEDIUM]'
            END,
            CASE WHEN (product_desc ILIKE '%GOLD%' OR product_code IN ('1222','1223')) AND exp_date < CURRENT_DATE THEN 'Gold Loan (Bullet) Expiry [HIGH]' END,
            CASE WHEN (product_desc ILIKE '%CASH CREDIT%' OR product_desc ILIKE '%OVER DRAFT%') AND exp_date < CURRENT_DATE THEN 'CC / OD Limit Expiry (Renewal Due) [HIGH]' END,
            CASE WHEN exp_date < CURRENT_DATE AND bank_cust_rating != 'STANDARD' THEN 'Term Loan Expiry [HIGH]' END,
            CASE WHEN ABS(interest_outstanding) > 2 * instal_amt AND instal_amt > 0 THEN 'Interest Outstanding > 2x Installment [HIGH]' END,
            CASE WHEN UPPER(TRIM(npa)) = 'Y' AND (interest_receivable_oir > 0 OR interest_receivable_oir2 > 0 OR ABS(interest_outstanding) > 0) THEN 'Unrealized Interest on NPA Accounts [HIGH]' END,
            CASE WHEN cibil_score > 0 AND cibil_score < 650 THEN 'CIBIL Score < 650 (' || cibil_score || ') [HIGH]' END,
            CASE WHEN (product_desc ILIKE '%CASH CREDIT%' OR product_desc ILIKE '%OVER DRAFT%') AND ABS(balance) > tot_sanc_limit AND tot_sanc_limit > 0 THEN 'CC/OD Balance vs Sanctioned Limit [HIGH]' END,
            CASE WHEN ABS(principal_outstanding) > security_amount AND security_amount > 0 THEN 'Term Loan Principal > Security Value [VERY HIGH]' END,
            CASE WHEN (security_type ILIKE '%MORTGAGE%' OR security_type ILIKE '%LAND%' OR security_type ILIKE '%BUILDING%') AND (cersai_charge_noted IS NULL OR TRIM(UPPER(cersai_charge_noted)) != 'YES') THEN 'CERSAI Charge Not Noted [MEDIUM]' END,
            CASE WHEN (product_code = '1233' OR product_desc ILIKE '%CASH CREDIT%') AND insp_date IS NULL THEN 'Stock Inspection Date Not on Record [MEDIUM]' END,
            CASE WHEN policy_due_date < CURRENT_DATE THEN 'Insurance Policy Lapsed [MEDIUM]' END,
            CASE WHEN (product_code = '1233' OR product_desc ILIKE '%CASH CREDIT%') AND (trunover_details IS NULL OR trunover_details = 0 OR tot_sanc_limit > 0.25 * trunover_details) THEN 'Working Capital Limit vs Turnover > 25% [MEDIUM]' END
          ], NULL) as triggered_signals
        FROM ews_loan_dump
        ${whereSql}
      ),
      evaluated AS (
        SELECT 
          branch,
          account_no,
          account_holder,
          product,
          principal_os,
          irac_rating,
          CARDINALITY(triggered_signals) as signals_fired,
          array_to_string(triggered_signals, '; ') as signals_triggered,
          CASE 
            WHEN array_to_string(triggered_signals, ' ') LIKE '%[VERY HIGH]%' THEN 'VERY HIGH'
            WHEN array_to_string(triggered_signals, ' ') LIKE '%[HIGH]%' THEN 'HIGH'
            WHEN array_to_string(triggered_signals, ' ') LIKE '%[MEDIUM]%' THEN 'MEDIUM'
            ELSE 'LOW'
          END as overall_risk
        FROM account_flags
        WHERE CARDINALITY(triggered_signals) > 0
      )
      SELECT *
      FROM evaluated
      ${riskFilterSql}
      ORDER BY principal_os DESC
      LIMIT ${limitVal}
    `;

    const result = await this.db.query(query, params);
    return result.rows;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // REPORT 04 — BRANCH-WISE EWS SUMMARY
  // ──────────────────────────────────────────────────────────────────────────
  async getBranchWiseSummaryReport(filters?: { branch?: any }) {
    const params: any[] = [];
    let whereSql = '';

    const branches = parseArrayFilter(filters?.branch);
    if (branches.length > 0) {
      params.push(branches);
      whereSql = `WHERE d.branch_code = ANY($1::varchar[])`;
    }

    const query = `
      SELECT 
        d.branch_code,
        COALESCE(b.name, 'Branch ' || d.branch_code) as branch_name,
        COUNT(d.id)::INT as total_accounts,
        SUM(ABS(COALESCE(d.principal_outstanding, 0)))::NUMERIC(18,2) as total_principal,
        COUNT(d.id) FILTER (
          WHERE UPPER(TRIM(d.npa)) = 'Y' 
             OR d.bank_cust_rating IN ('SMA 0','SMA 1','SMA 2','SUB STANDARD','DOUBTFUL 1','DOUBTFUL 2','DOUBTFUL 3') 
             OR d.policy_due_date < CURRENT_DATE
        )::INT as flagged_accounts,
        ROUND(
          100.0 * COUNT(d.id) FILTER (
            WHERE UPPER(TRIM(d.npa)) = 'Y' 
               OR d.bank_cust_rating IN ('SMA 0','SMA 1','SMA 2','SUB STANDARD','DOUBTFUL 1','DOUBTFUL 2','DOUBTFUL 3') 
               OR d.policy_due_date < CURRENT_DATE
          ) / NULLIF(COUNT(d.id), 0), 1
        ) as pct_flagged,
        COUNT(d.id) FILTER (WHERE UPPER(TRIM(d.npa)) = 'Y' OR d.bank_cust_rating IN ('SUB STANDARD','DOUBTFUL 1','DOUBTFUL 2','DOUBTFUL 3'))::INT as very_high,
        COUNT(d.id) FILTER (WHERE UPPER(TRIM(d.npa)) != 'Y' AND d.bank_cust_rating IN ('SMA 1','SMA 2'))::INT as high_risk,
        COUNT(d.id) FILTER (WHERE UPPER(TRIM(d.npa)) != 'Y' AND d.bank_cust_rating = 'SMA 0')::INT as medium_risk,
        COUNT(d.id) FILTER (WHERE UPPER(TRIM(d.npa)) = 'Y')::INT as npa_accounts
      FROM ews_loan_dump d
      LEFT JOIN ews_branches b ON d.branch_code = b.code
      ${whereSql}
      GROUP BY d.branch_code, b.name
      ORDER BY NULLIF(regexp_replace(d.branch_code, '\\D', '', 'g'), '')::INT NULLS LAST, d.branch_code
    `;

    const result = await this.db.query(query, params);
    return result.rows;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // REPORT 05 — SIGNAL-WISE DISTRIBUTION
  // ──────────────────────────────────────────────────────────────────────────
  async getSignalWiseDistributionReport(filters?: { branch?: any }) {
    const params: any[] = [];
    let whereSql = '';

    const branches = parseArrayFilter(filters?.branch);
    if (branches.length > 0) {
      params.push(branches);
      whereSql = `WHERE branch_code = ANY($1::varchar[])`;
    }

    const query = `
      SELECT
        COUNT(*)::INT as total_portfolio,
        -- Signal 1
        COUNT(*) FILTER (WHERE UPPER(TRIM(npa)) = 'Y')::INT as s1_total,
        COUNT(*) FILTER (WHERE UPPER(TRIM(npa)) = 'Y')::INT as s1_vh,
        0::INT as s1_h, 0::INT as s1_m,
        -- Signal 2
        COUNT(*) FILTER (WHERE bank_cust_rating IN ('SUB STANDARD','DOUBTFUL 1','DOUBTFUL 2','DOUBTFUL 3','SMA 1','SMA 2','SMA 0'))::INT as s2_total,
        COUNT(*) FILTER (WHERE bank_cust_rating IN ('SUB STANDARD','DOUBTFUL 1','DOUBTFUL 2','DOUBTFUL 3'))::INT as s2_vh,
        COUNT(*) FILTER (WHERE bank_cust_rating IN ('SMA 1','SMA 2'))::INT as s2_h,
        COUNT(*) FILTER (WHERE bank_cust_rating = 'SMA 0')::INT as s2_m,
        -- Signal 3
        COUNT(*) FILTER (WHERE (product_desc ILIKE '%GOLD%' OR product_code IN ('1222','1223')) AND exp_date < CURRENT_DATE)::INT as s3_total,
        COUNT(*) FILTER (WHERE (product_desc ILIKE '%GOLD%' OR product_code IN ('1222','1223')) AND exp_date < CURRENT_DATE AND UPPER(TRIM(npa)) = 'Y')::INT as s3_vh,
        COUNT(*) FILTER (WHERE (product_desc ILIKE '%GOLD%' OR product_code IN ('1222','1223')) AND exp_date < CURRENT_DATE AND UPPER(TRIM(npa)) != 'Y' AND bank_cust_rating IN ('SMA 1','SMA 2'))::INT as s3_h,
        COUNT(*) FILTER (WHERE (product_desc ILIKE '%GOLD%' OR product_code IN ('1222','1223')) AND exp_date < CURRENT_DATE AND (bank_cust_rating = 'SMA 0' OR bank_cust_rating = 'STANDARD'))::INT as s3_m,
        -- Signal 4
        COUNT(*) FILTER (WHERE (product_desc ILIKE '%CASH CREDIT%' OR product_desc ILIKE '%OVER DRAFT%') AND exp_date < CURRENT_DATE)::INT as s4_total,
        COUNT(*) FILTER (WHERE (product_desc ILIKE '%CASH CREDIT%' OR product_desc ILIKE '%OVER DRAFT%') AND exp_date < CURRENT_DATE AND bank_cust_rating IN ('SUB STANDARD','DOUBTFUL 1','DOUBTFUL 2','DOUBTFUL 3'))::INT as s4_vh,
        COUNT(*) FILTER (WHERE (product_desc ILIKE '%CASH CREDIT%' OR product_desc ILIKE '%OVER DRAFT%') AND exp_date < CURRENT_DATE AND bank_cust_rating IN ('SMA 1','SMA 2'))::INT as s4_h,
        COUNT(*) FILTER (WHERE (product_desc ILIKE '%CASH CREDIT%' OR product_desc ILIKE '%OVER DRAFT%') AND exp_date < CURRENT_DATE AND bank_cust_rating = 'SMA 0')::INT as s4_m,
        -- Signal 5
        COUNT(*) FILTER (WHERE exp_date < CURRENT_DATE AND bank_cust_rating != 'STANDARD')::INT as s5_total,
        COUNT(*) FILTER (WHERE exp_date < CURRENT_DATE AND bank_cust_rating IN ('SUB STANDARD','DOUBTFUL 1','DOUBTFUL 2','DOUBTFUL 3'))::INT as s5_vh,
        COUNT(*) FILTER (WHERE exp_date < CURRENT_DATE AND bank_cust_rating IN ('SMA 1','SMA 2'))::INT as s5_h,
        COUNT(*) FILTER (WHERE exp_date < CURRENT_DATE AND bank_cust_rating = 'SMA 0')::INT as s5_m,
        -- Signal 6
        COUNT(*) FILTER (WHERE ABS(interest_outstanding) > 2 * instal_amt AND instal_amt > 0)::INT as s6_total,
        0::INT as s6_vh,
        COUNT(*) FILTER (WHERE ABS(interest_outstanding) > 2 * instal_amt AND instal_amt > 0)::INT as s6_h,
        0::INT as s6_m,
        -- Signal 7
        COUNT(*) FILTER (WHERE UPPER(TRIM(npa)) = 'Y' AND (interest_receivable_oir > 0 OR interest_receivable_oir2 > 0 OR ABS(interest_outstanding) > 0))::INT as s7_total,
        0::INT as s7_vh,
        COUNT(*) FILTER (WHERE UPPER(TRIM(npa)) = 'Y' AND (interest_receivable_oir > 0 OR interest_receivable_oir2 > 0 OR ABS(interest_outstanding) > 0))::INT as s7_h,
        0::INT as s7_m,
        -- Signal 8
        COUNT(*) FILTER (WHERE cibil_score > 0 AND cibil_score < 650)::INT as s8_total,
        COUNT(*) FILTER (WHERE cibil_score > 0 AND cibil_score < 650 AND UPPER(TRIM(npa)) = 'Y')::INT as s8_vh,
        COUNT(*) FILTER (WHERE cibil_score > 0 AND cibil_score < 650 AND UPPER(TRIM(npa)) != 'Y')::INT as s8_h,
        0::INT as s8_m,
        -- Signal 9
        COUNT(*) FILTER (WHERE (product_desc ILIKE '%CASH CREDIT%' OR product_desc ILIKE '%OVER DRAFT%') AND ABS(balance) > tot_sanc_limit AND tot_sanc_limit > 0)::INT as s9_total,
        COUNT(*) FILTER (WHERE (product_desc ILIKE '%CASH CREDIT%' OR product_desc ILIKE '%OVER DRAFT%') AND ABS(balance) > tot_sanc_limit AND tot_sanc_limit > 0 AND bank_cust_rating IN ('SUB STANDARD','DOUBTFUL 1','DOUBTFUL 2','DOUBTFUL 3'))::INT as s9_vh,
        COUNT(*) FILTER (WHERE (product_desc ILIKE '%CASH CREDIT%' OR product_desc ILIKE '%OVER DRAFT%') AND ABS(balance) > tot_sanc_limit AND tot_sanc_limit > 0 AND bank_cust_rating NOT IN ('SUB STANDARD','DOUBTFUL 1','DOUBTFUL 2','DOUBTFUL 3'))::INT as s9_h,
        0::INT as s9_m,
        -- Signal 10
        COUNT(*) FILTER (WHERE ABS(principal_outstanding) > security_amount AND security_amount > 0)::INT as s10_total,
        COUNT(*) FILTER (WHERE ABS(principal_outstanding) > security_amount AND security_amount > 0)::INT as s10_vh,
        0::INT as s10_h, 0::INT as s10_m,
        -- Signal 11
        COUNT(*) FILTER (WHERE (security_type ILIKE '%MORTGAGE%' OR security_type ILIKE '%LAND%' OR security_type ILIKE '%BUILDING%') AND (cersai_charge_noted IS NULL OR TRIM(UPPER(cersai_charge_noted)) != 'YES'))::INT as s11_total,
        0::INT as s11_vh, 0::INT as s11_h,
        COUNT(*) FILTER (WHERE (security_type ILIKE '%MORTGAGE%' OR security_type ILIKE '%LAND%' OR security_type ILIKE '%BUILDING%') AND (cersai_charge_noted IS NULL OR TRIM(UPPER(cersai_charge_noted)) != 'YES'))::INT as s11_m,
        -- Signal 12
        COUNT(*) FILTER (WHERE (product_code = '1233' OR product_desc ILIKE '%CASH CREDIT%') AND insp_date IS NULL)::INT as s12_total,
        0::INT as s12_vh, 0::INT as s12_h,
        COUNT(*) FILTER (WHERE (product_code = '1233' OR product_desc ILIKE '%CASH CREDIT%') AND insp_date IS NULL)::INT as s12_m,
        -- Signal 13
        COUNT(*) FILTER (WHERE policy_due_date < CURRENT_DATE)::INT as s13_total,
        0::INT as s13_vh, 0::INT as s13_h,
        COUNT(*) FILTER (WHERE policy_due_date < CURRENT_DATE)::INT as s13_m,
        -- Signal 14
        COUNT(*) FILTER (WHERE (product_code = '1233' OR product_desc ILIKE '%CASH CREDIT%'))::INT as s14_total,
        0::INT as s14_vh, 0::INT as s14_h,
        COUNT(*) FILTER (WHERE (product_code = '1233' OR product_desc ILIKE '%CASH CREDIT%'))::INT as s14_m
      FROM ews_loan_dump
      ${whereSql}
    `;

    const res = await this.db.query(query, params);
    const row = res.rows[0] || {};
    const totalPortfolio = Number(row.total_portfolio) || 1;

    const signalDefs = [
      { num: 1, name: 'NPA = Y (Confirmed NPA)', vh: row.s1_vh, h: row.s1_h, m: row.s1_m, total: row.s1_total },
      { num: 2, name: 'SMA / IRAC Staging (Bank Cust Rating)', vh: row.s2_vh, h: row.s2_h, m: row.s2_m, total: row.s2_total },
      { num: 3, name: 'Gold Loan (Bullet) Expiry', vh: row.s3_vh, h: row.s3_h, m: row.s3_m, total: row.s3_total },
      { num: 4, name: 'CC / OD Limit Expiry (Renewal Due)', vh: row.s4_vh, h: row.s4_h, m: row.s4_m, total: row.s4_total },
      { num: 5, name: 'Term Loan Expiry (excl. Standard)', vh: row.s5_vh, h: row.s5_h, m: row.s5_m, total: row.s5_total },
      { num: 6, name: 'Interest Outstanding > 2x Installment', vh: row.s6_vh, h: row.s6_h, m: row.s6_m, total: row.s6_total },
      { num: 7, name: 'Unrealized Interest on NPA Accounts', vh: row.s7_vh, h: row.s7_h, m: row.s7_m, total: row.s7_total },
      { num: 8, name: 'CIBIL Score < 650', vh: row.s8_vh, h: row.s8_h, m: row.s8_m, total: row.s8_total },
      { num: 9, name: 'CC/OD Balance vs Sanctioned Limit', vh: row.s9_vh, h: row.s9_h, m: row.s9_m, total: row.s9_total },
      { num: 10, name: 'Term Loan Principal > Security Value', vh: row.s10_vh, h: row.s10_h, m: row.s10_m, total: row.s10_total },
      { num: 11, name: 'CERSAI Charge Not Noted (Mortgage a/cs)', vh: row.s11_vh, h: row.s11_h, m: row.s11_m, total: row.s11_total },
      { num: 12, name: 'Stock Inspection Date Not on Record (CC)', vh: row.s12_vh, h: row.s12_h, m: row.s12_m, total: row.s12_total },
      { num: 13, name: 'Insurance Policy Lapsed', vh: row.s13_vh, h: row.s13_h, m: row.s13_m, total: row.s13_total },
      { num: 14, name: 'Working Capital Limit vs Turnover > 25%', vh: row.s14_vh, h: row.s14_h, m: row.s14_m, total: row.s14_total },
    ];

    let sumVh = 0;
    let sumH = 0;
    let sumM = 0;
    let sumTotal = 0;

    const signals = signalDefs.map((s) => {
      const vh = Number(s.vh) || 0;
      const h = Number(s.h) || 0;
      const m = Number(s.m) || 0;
      const total = Number(s.total) || 0;
      sumVh += vh;
      sumH += h;
      sumM += m;
      sumTotal += total;

      return {
        number: s.num,
        name: s.name,
        very_high: vh,
        high: h,
        medium: m,
        total_flagged: total,
        pct_portfolio: ( (total / totalPortfolio) * 100 ).toFixed(1) + '%',
      };
    });

    return {
      signals,
      total_summary: {
        number: 'TOTAL',
        name: 'TOTAL (signals overlap; accounts may carry multiple)',
        very_high: sumVh,
        high: sumH,
        medium: sumM,
        total_flagged: sumTotal,
        pct_portfolio: '—',
      },
      total_portfolio: totalPortfolio,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // REPORT 06 — LOAN TYPE / PRODUCT RISK REPORT
  // ──────────────────────────────────────────────────────────────────────────
  async getLoanTypeRiskReport(filters?: { branch?: any; search?: string }) {
    const params: any[] = [];
    let whereClauses: string[] = [];

    const branches = parseArrayFilter(filters?.branch);
    if (branches.length > 0) {
      params.push(branches);
      whereClauses.push(`branch_code = ANY($${params.length}::varchar[])`);
    }

    if (filters?.search && filters.search.trim()) {
      params.push(`%${filters.search.trim()}%`);
      whereClauses.push(`(product_code ILIKE $${params.length} OR product_desc ILIKE $${params.length})`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const query = `
      SELECT 
        COALESCE(product_code, 'N/A') as product_code,
        COALESCE(product_desc, 'UNKNOWN PRODUCT') as product_desc,
        COUNT(*)::INT as total_accounts,
        SUM(ABS(COALESCE(principal_outstanding, 0)))::NUMERIC(18,2) as total_principal,
        COUNT(*) FILTER (
          WHERE UPPER(TRIM(npa)) = 'Y' 
             OR bank_cust_rating IN ('SMA 0','SMA 1','SMA 2','SUB STANDARD','DOUBTFUL 1','DOUBTFUL 2','DOUBTFUL 3') 
             OR policy_due_date < CURRENT_DATE
        )::INT as flagged_accounts,
        ROUND(
          100.0 * COUNT(*) FILTER (
            WHERE UPPER(TRIM(npa)) = 'Y' 
               OR bank_cust_rating IN ('SMA 0','SMA 1','SMA 2','SUB STANDARD','DOUBTFUL 1','DOUBTFUL 2','DOUBTFUL 3') 
               OR policy_due_date < CURRENT_DATE
          ) / NULLIF(COUNT(*), 0), 1
        ) as pct_flagged,
        COUNT(*) FILTER (WHERE UPPER(TRIM(npa)) = 'Y' OR bank_cust_rating IN ('SUB STANDARD','DOUBTFUL 1','DOUBTFUL 2','DOUBTFUL 3'))::INT as very_high,
        COUNT(*) FILTER (WHERE UPPER(TRIM(npa)) != 'Y' AND bank_cust_rating IN ('SMA 1','SMA 2'))::INT as high_risk,
        COUNT(*) FILTER (WHERE UPPER(TRIM(npa)) != 'Y' AND bank_cust_rating = 'SMA 0')::INT as medium_risk
      FROM ews_loan_dump
      ${whereSql}
      GROUP BY product_code, product_desc
      ORDER BY total_accounts DESC
    `;

    const result = await this.db.query(query, params);
    return result.rows;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // REPORT 07 — CRO EXECUTIVE DASHBOARD REPORT
  // ──────────────────────────────────────────────────────────────────────────
  async getCroDashboardReport(filters?: {
    branch?: any;
    rating?: any;
    search?: string;
    min_amount?: number;
    limit?: number;
  }) {
    const params: any[] = [];
    let whereClauses: string[] = [];

    const branches = parseArrayFilter(filters?.branch);
    if (branches.length > 0) {
      params.push(branches);
      whereClauses.push(`branch_code = ANY($${params.length}::varchar[])`);
    }

    const ratings = parseArrayFilter(filters?.rating);
    if (ratings.length > 0) {
      params.push(ratings);
      whereClauses.push(`bank_cust_rating = ANY($${params.length}::varchar[])`);
    }

    if (filters?.search && filters.search.trim()) {
      params.push(`%${filters.search.trim()}%`);
      whereClauses.push(`(account_no ILIKE $${params.length} OR long_name ILIKE $${params.length})`);
    }

    if (filters?.min_amount && Number(filters.min_amount) > 0) {
      params.push(Number(filters.min_amount));
      whereClauses.push(`ABS(COALESCE(principal_outstanding, 0)) >= $${params.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // 1. Snapshot Metrics
    const snapshotQuery = `
      SELECT 
        COUNT(*)::INT as total_accounts,
        SUM(ABS(COALESCE(principal_outstanding, 0)))::NUMERIC(18,2) as total_principal,
        COUNT(*) FILTER (
          WHERE UPPER(TRIM(npa)) = 'Y' 
             OR bank_cust_rating IN ('SMA 0','SMA 1','SMA 2','SUB STANDARD','DOUBTFUL 1','DOUBTFUL 2','DOUBTFUL 3') 
             OR policy_due_date < CURRENT_DATE
        )::INT as flagged_accounts,
        COUNT(*) FILTER (WHERE UPPER(TRIM(npa)) = 'Y')::INT as confirmed_npa,
        COUNT(*) FILTER (WHERE UPPER(TRIM(npa)) = 'Y' OR bank_cust_rating IN ('SUB STANDARD','DOUBTFUL 1','DOUBTFUL 2','DOUBTFUL 3'))::INT as very_high,
        COUNT(*) FILTER (WHERE UPPER(TRIM(npa)) != 'Y' AND bank_cust_rating IN ('SMA 1','SMA 2'))::INT as high_risk,
        COUNT(*) FILTER (WHERE UPPER(TRIM(npa)) != 'Y' AND bank_cust_rating = 'SMA 0')::INT as medium_risk
      FROM ews_loan_dump
      ${whereSql}
    `;

    const snapshotRes = await this.db.query(snapshotQuery, params);
    const snapshot = snapshotRes.rows[0];

    // 2. Top Very High / High Risk Accounts by Exposure
    const limitVal = filters?.limit ? Math.min(Number(filters.limit), 100) : 30;
    const topAccountsQuery = `
      WITH account_signals_calc AS (
        SELECT 
          branch_code as branch,
          account_no,
          COALESCE(NULLIF(TRIM(long_name), ''), '(Not on record)') as account_holder,
          COALESCE(product_desc, 'General Advance') as product,
          ABS(COALESCE(principal_outstanding, 0)) as principal_os,
          COALESCE(UPPER(TRIM(bank_cust_rating)), 'STANDARD') as irac_rating,
          ARRAY_REMOVE(ARRAY[
            CASE WHEN UPPER(TRIM(npa)) = 'Y' THEN 'NPA' END,
            CASE WHEN bank_cust_rating IN ('SUB STANDARD','DOUBTFUL 1','DOUBTFUL 2','DOUBTFUL 3') THEN 'SUBSTANDARD/DOUBTFUL' END,
            CASE WHEN bank_cust_rating IN ('SMA 1','SMA 2') THEN 'SMA 1/2' END,
            CASE WHEN bank_cust_rating = 'SMA 0' THEN 'SMA 0' END,
            CASE WHEN (product_desc ILIKE '%GOLD%' OR product_code IN ('1222','1223')) AND exp_date < CURRENT_DATE THEN 'Gold Expiry' END,
            CASE WHEN (product_desc ILIKE '%CASH CREDIT%' OR product_desc ILIKE '%OVER DRAFT%') AND exp_date < CURRENT_DATE THEN 'CC/OD Expiry' END,
            CASE WHEN ABS(interest_outstanding) > 2 * instal_amt AND instal_amt > 0 THEN 'Interest > 2x EMI' END,
            CASE WHEN cibil_score > 0 AND cibil_score < 650 THEN 'Low CIBIL' END,
            CASE WHEN policy_due_date < CURRENT_DATE THEN 'Insurance Lapsed' END
          ], NULL) as sigs
        FROM ews_loan_dump
        ${whereSql}
      )
      SELECT 
        branch,
        account_no,
        account_holder,
        product,
        principal_os,
        irac_rating,
        'VERY HIGH' as overall_risk,
        GREATEST(CARDINALITY(sigs), 1) as signals
      FROM account_signals_calc
      WHERE irac_rating IN ('SUB STANDARD','DOUBTFUL 1','DOUBTFUL 2','DOUBTFUL 3')
         OR irac_rating LIKE 'SMA%'
         OR CARDINALITY(sigs) > 1
      ORDER BY principal_os DESC
      LIMIT ${limitVal}
    `;

    const topRes = await this.db.query(topAccountsQuery, params);

    return {
      snapshot,
      top_accounts: topRes.rows,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // REPORT 09 — RBI / IRAC COMPLIANCE REPORT
  // ──────────────────────────────────────────────────────────────────────────
  async getRbiComplianceReport(filters?: { branch?: any }) {
    const params: any[] = [];
    let whereSql = '';

    const branches = parseArrayFilter(filters?.branch);
    if (branches.length > 0) {
      params.push(branches);
      whereSql = `WHERE branch_code = ANY($1::varchar[])`;
    }

    const totalPortfolioRes = await this.db.query(
      `SELECT SUM(ABS(COALESCE(principal_outstanding, 0))) as total_os, COUNT(*)::INT as total_accs FROM ews_loan_dump ${whereSql}`,
      params,
    );

    const totalPortfolioOs = Number(totalPortfolioRes.rows[0]?.total_os) || 1;
    const totalPortfolioAccs = Number(totalPortfolioRes.rows[0]?.total_accs) || 1;

    const query = `
      SELECT 
        irac_rating,
        COUNT(*)::INT as accounts,
        SUM(ABS(COALESCE(principal_outstanding, 0)))::NUMERIC(18,2) as principal_os
      FROM (
        SELECT 
          CASE 
            WHEN UPPER(TRIM(bank_cust_rating)) IN ('STANDARD','SMA 0','SMA 1','SMA 2','SUB STANDARD','DOUBTFUL 1','DOUBTFUL 2','DOUBTFUL 3') 
              THEN UPPER(TRIM(bank_cust_rating))
            ELSE 'STANDARD'
          END as irac_rating,
          principal_outstanding
        FROM ews_loan_dump
        ${whereSql}
      ) sub
      GROUP BY irac_rating
    `;

    const res = await this.db.query(query, params);
    const dataMap = new Map<string, { accounts: number; principal_os: number }>();
    res.rows.forEach((r) => {
      dataMap.set(r.irac_rating, {
        accounts: Number(r.accounts) || 0,
        principal_os: Number(r.principal_os) || 0,
      });
    });

    const standardNorms: Array<{ rating: string; provision_pct: number }> = [
      { rating: 'STANDARD', provision_pct: 0.4 },
      { rating: 'SMA 0', provision_pct: 0.4 },
      { rating: 'SMA 1', provision_pct: 0.4 },
      { rating: 'SMA 2', provision_pct: 0.4 },
      { rating: 'SUB STANDARD', provision_pct: 15.0 },
      { rating: 'DOUBTFUL 1', provision_pct: 25.0 },
      { rating: 'DOUBTFUL 2', provision_pct: 40.0 },
      { rating: 'DOUBTFUL 3', provision_pct: 100.0 },
    ];

    let totalAccounts = 0;
    let totalPrincipalOs = 0;
    let totalProvisionAmount = 0;

    const classes = standardNorms.map((norm) => {
      const item = dataMap.get(norm.rating) || { accounts: 0, principal_os: 0 };
      const provAmt = (item.principal_os * norm.provision_pct) / 100;
      const pctOfPortfolio = (item.principal_os / totalPortfolioOs) * 100;

      totalAccounts += item.accounts;
      totalPrincipalOs += item.principal_os;
      totalProvisionAmount += provAmt;

      return {
        irac_classification: norm.rating,
        accounts: item.accounts,
        principal_os: item.principal_os.toFixed(2),
        provision_pct: norm.provision_pct.toFixed(2) + '%',
        provision_amount: provAmt.toFixed(2),
        pct_portfolio_os: pctOfPortfolio.toFixed(2) + '%',
      };
    });

    return {
      classes,
      total: {
        irac_classification: 'TOTAL',
        accounts: totalAccounts,
        principal_os: totalPrincipalOs.toFixed(2),
        provision_pct: '—',
        provision_amount: totalProvisionAmount.toFixed(2),
        pct_portfolio_os: '100.00%',
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // REPORT 10 — STOCK / SECURITY INSPECTION DUE REPORT
  // ──────────────────────────────────────────────────────────────────────────
  async getInspectionDueReport(filters?: { branch?: any; status?: any; search?: string }) {
    const params: any[] = [];
    let whereClauses: string[] = [
      `(product_code = '1233' OR product_desc ILIKE '%CASH CREDIT%')`,
    ];

    const branches = parseArrayFilter(filters?.branch);
    if (branches.length > 0) {
      params.push(branches);
      whereClauses.push(`branch_code = ANY($${params.length}::varchar[])`);
    }

    if (filters?.search && filters.search.trim()) {
      params.push(`%${filters.search.trim()}%`);
      whereClauses.push(`(account_no ILIKE $${params.length} OR long_name ILIKE $${params.length})`);
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    const query = `
      SELECT 
        branch_code as branch,
        account_no,
        COALESCE(NULLIF(TRIM(long_name), ''), '(Not on record)') as account_holder,
        COALESCE(product_desc, 'CASH CREDIT LOAN A/C') as product,
        ABS(COALESCE(principal_outstanding, 0)) as principal_os,
        COALESCE(UPPER(TRIM(bank_cust_rating)), 'STANDARD') as irac_rating,
        insp_date,
        CASE 
          WHEN insp_date IS NULL THEN 'NOT ON RECORD'
          WHEN insp_date < CURRENT_DATE - INTERVAL '90 days' THEN 'OVERDUE'
          WHEN insp_date < CURRENT_DATE THEN 'DUE <= 30 DAYS'
          ELSE 'CURRENT'
        END as inspection_status
      FROM ews_loan_dump
      ${whereSql}
      ORDER BY principal_os DESC
    `;

    const res = await this.db.query(query, params);
    let rows = res.rows;

    const statuses = parseArrayFilter(filters?.status).map(s => s.toUpperCase());
    if (statuses.length > 0) {
      rows = rows.filter((r) => statuses.includes(r.inspection_status.toUpperCase()));
    }

    return rows;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // REPORT 11 — INSURANCE RENEWAL DUE REPORT
  // ──────────────────────────────────────────────────────────────────────────
  async getInsuranceRenewalReport(filters?: {
    branch?: any;
    status?: any;
    insurer?: any;
    search?: string;
    limit?: number;
  }) {
    const params: any[] = [];
    let whereClauses: string[] = [`policy_due_date IS NOT NULL`];

    const branches = parseArrayFilter(filters?.branch);
    if (branches.length > 0) {
      params.push(branches);
      whereClauses.push(`branch_code = ANY($${params.length}::varchar[])`);
    }

    const insurers = parseArrayFilter(filters?.insurer);
    if (insurers.length > 0) {
      const insurerClauses = insurers.map(ins => {
        params.push(`%${ins}%`);
        return `insurance_company ILIKE $${params.length}`;
      });
      whereClauses.push(`(${insurerClauses.join(' OR ')})`);
    }

    if (filters?.search && filters.search.trim()) {
      params.push(`%${filters.search.trim()}%`);
      whereClauses.push(`(account_no ILIKE $${params.length} OR long_name ILIKE $${params.length})`);
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    // 1. Summary Buckets
    const summaryQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE policy_due_date < CURRENT_DATE)::INT as lapsed,
        SUM(ABS(COALESCE(principal_outstanding, 0))) FILTER (WHERE policy_due_date < CURRENT_DATE)::NUMERIC(18,2) as lapsed_os,
        COUNT(*) FILTER (WHERE policy_due_date >= CURRENT_DATE AND policy_due_date <= CURRENT_DATE + INTERVAL '30 days')::INT as due_30,
        SUM(ABS(COALESCE(principal_outstanding, 0))) FILTER (WHERE policy_due_date >= CURRENT_DATE AND policy_due_date <= CURRENT_DATE + INTERVAL '30 days')::NUMERIC(18,2) as due_30_os,
        COUNT(*) FILTER (WHERE policy_due_date > CURRENT_DATE + INTERVAL '30 days' AND policy_due_date <= CURRENT_DATE + INTERVAL '90 days')::INT as due_90,
        SUM(ABS(COALESCE(principal_outstanding, 0))) FILTER (WHERE policy_due_date > CURRENT_DATE + INTERVAL '30 days' AND policy_due_date <= CURRENT_DATE + INTERVAL '90 days')::NUMERIC(18,2) as due_90_os,
        COUNT(*) FILTER (WHERE policy_due_date > CURRENT_DATE + INTERVAL '90 days')::INT as current_count,
        SUM(ABS(COALESCE(principal_outstanding, 0))) FILTER (WHERE policy_due_date > CURRENT_DATE + INTERVAL '90 days')::NUMERIC(18,2) as current_os,
        COUNT(*)::INT as total_insured,
        SUM(ABS(COALESCE(principal_outstanding, 0)))::NUMERIC(18,2) as total_insured_os
      FROM ews_loan_dump
      ${whereSql}
    `;

    const summaryRes = await this.db.query(summaryQuery, params);
    const s = summaryRes.rows[0];
    const totalIns = Number(s?.total_insured) || 1;

    const summaryBuckets = [
      {
        status: 'LAPSED',
        accounts: Number(s?.lapsed) || 0,
        total_principal: Number(s?.lapsed_os) || 0,
        pct_insured: (((Number(s?.lapsed) || 0) / totalIns) * 100).toFixed(1) + '%',
      },
      {
        status: 'DUE ≤ 30 DAYS',
        accounts: Number(s?.due_30) || 0,
        total_principal: Number(s?.due_30_os) || 0,
        pct_insured: (((Number(s?.due_30) || 0) / totalIns) * 100).toFixed(1) + '%',
      },
      {
        status: 'DUE ≤ 90 DAYS',
        accounts: Number(s?.due_90) || 0,
        total_principal: Number(s?.due_90_os) || 0,
        pct_insured: (((Number(s?.due_90) || 0) / totalIns) * 100).toFixed(1) + '%',
      },
      {
        status: 'CURRENT',
        accounts: Number(s?.current_count) || 0,
        total_principal: Number(s?.current_os) || 0,
        pct_insured: (((Number(s?.current_count) || 0) / totalIns) * 100).toFixed(1) + '%',
      },
    ];

    // 2. Accounts List
    const statuses = parseArrayFilter(filters?.status).map(st => st.toUpperCase());
    let statusFilterParts: string[] = [];
    if (statuses.length > 0) {
      if (statuses.some(st => st.includes('LAPSED'))) {
        statusFilterParts.push(`policy_due_date < CURRENT_DATE`);
      }
      if (statuses.some(st => st.includes('30'))) {
        statusFilterParts.push(`(policy_due_date >= CURRENT_DATE AND policy_due_date <= CURRENT_DATE + INTERVAL '30 days')`);
      }
      if (statuses.some(st => st.includes('90'))) {
        statusFilterParts.push(`(policy_due_date > CURRENT_DATE + INTERVAL '30 days' AND policy_due_date <= CURRENT_DATE + INTERVAL '90 days')`);
      }
      if (statuses.some(st => st === 'CURRENT')) {
        statusFilterParts.push(`policy_due_date > CURRENT_DATE + INTERVAL '90 days'`);
      }
    }

    const statusFilterSql = statusFilterParts.length > 0 ? `AND (${statusFilterParts.join(' OR ')})` : '';
    const limitVal = filters?.limit ? Math.min(Number(filters.limit), 2000) : 300;

    const accountsQuery = `
      SELECT 
        branch_code as branch,
        account_no,
        COALESCE(NULLIF(TRIM(long_name), ''), '(Not on record)') as account_holder,
        COALESCE(product_desc, 'General Advance') as product,
        COALESCE(NULLIF(TRIM(insurance_company), ''), 'NATIONAL INSURANCE COM') as insurer,
        TO_CHAR(policy_due_date, 'DD-MM-YYYY') as policy_due,
        ABS(COALESCE(principal_outstanding, 0)) as principal_os,
        CASE 
          WHEN policy_due_date < CURRENT_DATE THEN 'LAPSED'
          WHEN policy_due_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'DUE ≤ 30 DAYS'
          WHEN policy_due_date <= CURRENT_DATE + INTERVAL '90 days' THEN 'DUE ≤ 90 DAYS'
          ELSE 'CURRENT'
        END as status
      FROM ews_loan_dump
      ${whereSql} ${statusFilterSql}
      ORDER BY 
        CASE WHEN policy_due_date < CURRENT_DATE THEN 1 ELSE 2 END,
        principal_os DESC
      LIMIT ${limitVal}
    `;

    const accountsRes = await this.db.query(accountsQuery, params);

    return {
      summary: summaryBuckets,
      total_insured_accounts: totalIns,
      total_insured_os: Number(s?.total_insured_os) || 0,
      accounts: accountsRes.rows,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // REPORT 12 — CERSAI PENDENCY REPORT
  // ──────────────────────────────────────────────────────────────────────────
  async getCersaiPendencyReport(filters?: { branch?: any; security_type?: any; search?: string; limit?: number }) {
    const params: any[] = [];
    let whereClauses: string[] = [
      `(security_type ILIKE '%MORTGAGE%' OR security_type ILIKE '%LAND%' OR security_type ILIKE '%BUILDING%' OR security_type ILIKE '%FLAT%' OR security_type ILIKE '%BUNGLOW%')`,
      `(cersai_charge_noted IS NULL OR TRIM(UPPER(cersai_charge_noted)) != 'YES')`,
    ];

    const branches = parseArrayFilter(filters?.branch);
    if (branches.length > 0) {
      params.push(branches);
      whereClauses.push(`branch_code = ANY($${params.length}::varchar[])`);
    }

    const secTypes = parseArrayFilter(filters?.security_type);
    if (secTypes.length > 0) {
      const typeClauses = secTypes.map(t => {
        params.push(`%${t}%`);
        return `security_type ILIKE $${params.length}`;
      });
      whereClauses.push(`(${typeClauses.join(' OR ')})`);
    }

    if (filters?.search && filters.search.trim()) {
      params.push(`%${filters.search.trim()}%`);
      whereClauses.push(`(account_no ILIKE $${params.length} OR long_name ILIKE $${params.length})`);
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    // 1. Branch-wise Pendency Summary
    const branchSummaryQuery = `
      SELECT 
        d.branch_code,
        COALESCE(b.name, 'Branch ' || d.branch_code) as branch_name,
        COUNT(d.id)::INT as pending_accounts,
        SUM(ABS(COALESCE(d.principal_outstanding, 0)))::NUMERIC(18,2) as affected_principal
      FROM ews_loan_dump d
      LEFT JOIN ews_branches b ON d.branch_code = b.code
      ${whereSql}
      GROUP BY d.branch_code, b.name
      ORDER BY NULLIF(regexp_replace(d.branch_code, '\\D', '', 'g'), '')::INT NULLS LAST, d.branch_code
    `;

    const branchSummaryRes = await this.db.query(branchSummaryQuery, params);

    // 2. Top Accounts by Exposure
    const limitVal = filters?.limit ? Math.min(Number(filters.limit), 1000) : 100;
    const accountsQuery = `
      SELECT 
        branch_code as branch,
        account_no,
        COALESCE(NULLIF(TRIM(long_name), ''), '(Not on record)') as account_holder,
        COALESCE(NULLIF(TRIM(security_type), ''), 'REGISTER MORTGAGE') as security_type,
        ABS(COALESCE(principal_outstanding, 0)) as principal_os,
        'NOT NOTED' as status
      FROM ews_loan_dump
      ${whereSql}
      ORDER BY principal_os DESC
      LIMIT ${limitVal}
    `;

    const accountsRes = await this.db.query(accountsQuery, params);

    const totalAccounts = branchSummaryRes.rows.reduce((acc, r) => acc + (Number(r.pending_accounts) || 0), 0);
    const totalPrincipal = branchSummaryRes.rows.reduce((acc, r) => acc + (Number(r.affected_principal) || 0), 0);

    return {
      branch_summary: branchSummaryRes.rows,
      total_pending_accounts: totalAccounts,
      total_affected_principal: totalPrincipal.toFixed(2),
      accounts: accountsRes.rows,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // LEGACY REPORTS (Maintained for Backward Compatibility)
  // ──────────────────────────────────────────────────────────────────────────
  async getWatchListReport(filters?: any) {
    const result = await this.db.query(`
      SELECT w.account_id, w.borrower_name, w.branch, w.loan_type, w.risk_level,
             w.status, w.source, EXTRACT(DAY FROM NOW() - w.added_at)::INT AS days_on_list,
             COUNT(s.id) AS signal_count,
             (
               SELECT json_agg(json_build_object('name', sig.name, 'rules', sa.details->'rules'))
               FROM ews_account_signals sa
               JOIN ews_signals sig ON sa.signal_id = sig.id
               WHERE sa.watch_list_id = w.id
             ) as signals_data
      FROM ews_watch_list w
      LEFT JOIN ews_account_signals s ON s.watch_list_id = w.id
      WHERE w.removed_at IS NULL
      GROUP BY w.id ORDER BY w.added_at DESC
    `);
    return result.rows;
  }

  async getInvestigationStatusReport() {
    const result = await this.db.query(`
      SELECT i.id, w.account_id, w.borrower_name, w.branch, w.loan_type, w.risk_level,
             i.sent_at, i.deadline, i.branch_response, i.response_at, i.status,
             EXTRACT(DAY FROM NOW() - i.sent_at)::INT AS days_open,
             (i.deadline < NOW() AND i.response_at IS NULL) AS is_overdue,
             (
               SELECT json_agg(json_build_object('name', sig.name, 'rules', sa.details->'rules'))
               FROM ews_account_signals sa
               JOIN ews_signals sig ON sa.signal_id = sig.id
               WHERE sa.watch_list_id = w.id
             ) as signals_data
      FROM ews_investigations i
      JOIN ews_watch_list w ON w.id = i.watch_list_id
      ORDER BY i.sent_at DESC
    `);
    return result.rows;
  }

  async getBranchSummaryReport() {
    const result = await this.db.query(`
      SELECT
        w.branch,
        COUNT(*) FILTER (WHERE w.removed_at IS NULL) AS total_flagged,
        COUNT(*) FILTER (WHERE w.removed_at IS NULL AND w.status='Under investigation') AS pending_inv,
        COUNT(*) FILTER (WHERE w.removed_at IS NOT NULL) AS resolved,
        ROUND(100.0 * COUNT(*) FILTER (WHERE w.removed_at IS NOT NULL) / NULLIF(COUNT(*),0), 1) AS resolution_rate
      FROM ews_watch_list w
      GROUP BY w.branch ORDER BY total_flagged DESC
    `);
    return result.rows;
  }

  async getBankWideReport() {
    const result = await this.db.query(`
      SELECT
        COUNT(*) FILTER (WHERE removed_at IS NULL) AS active,
        COUNT(*) FILTER (WHERE removed_at IS NULL AND risk_level = 'High') AS high_risk,
        COUNT(*) FILTER (WHERE removed_at IS NULL AND status='Escalated') AS escalated,
        COUNT(*) FILTER (WHERE removed_at IS NULL AND status='Under investigation') AS under_investigation,
        COUNT(*) FILTER (WHERE removed_at IS NOT NULL AND DATE_TRUNC('month',removed_at)=DATE_TRUNC('month',NOW())) AS resolved_this_month
      FROM ews_watch_list
    `);
    return result.rows[0];
  }

  async getHighRiskReport() {
    const result = await this.db.query(`
      SELECT w.*, EXTRACT(DAY FROM NOW() - w.added_at)::INT AS days_on_list, COUNT(s.id) AS signal_count,
             (
               SELECT json_agg(json_build_object('name', sig.name, 'rules', sa.details->'rules'))
               FROM ews_account_signals sa
               JOIN ews_signals sig ON sa.signal_id = sig.id
               WHERE sa.watch_list_id = w.id
             ) as signals_data
      FROM ews_watch_list w
      LEFT JOIN ews_account_signals s ON s.watch_list_id = w.id
      WHERE w.removed_at IS NULL AND w.risk_level = 'High'
      GROUP BY w.id ORDER BY w.risk_level DESC, signal_count DESC
    `);
    return result.rows;
  }

  async getOverdueReport() {
    const result = await this.db.query(`
      SELECT i.*, w.account_id, w.borrower_name, w.branch, w.loan_type,
             EXTRACT(DAY FROM NOW() - i.sent_at)::INT AS days_overdue,
             (
               SELECT json_agg(json_build_object('name', sig.name, 'rules', sa.details->'rules'))
               FROM ews_account_signals sa
               JOIN ews_signals sig ON sa.signal_id = sig.id
               WHERE sa.watch_list_id = w.id
             ) as signals_data
      FROM ews_investigations i
      JOIN ews_watch_list w ON w.id = i.watch_list_id
      WHERE i.deadline < NOW() AND i.response_at IS NULL
      ORDER BY i.sent_at ASC
    `);
    return result.rows;
  }

  async getSignalWiseReport() {
    const result = await this.db.query(`
      SELECT s.number, s.name, s.category, COUNT(acs.id) AS account_count, COUNT(DISTINCT acs.watch_list_id) AS unique_accounts
      FROM ews_signals s
      LEFT JOIN ews_account_signals acs ON acs.signal_id = s.id
      GROUP BY s.id ORDER BY account_count DESC
    `);
    return result.rows;
  }

  async getResolvedReport() {
    const result = await this.db.query(`
      SELECT w.account_id, w.borrower_name, w.branch, w.loan_type, w.resolution,
             w.added_at, w.removed_at, w.removed_by,
             EXTRACT(DAY FROM w.removed_at - w.added_at)::INT AS days_to_resolve
      FROM ews_watch_list w
      WHERE w.removed_at IS NOT NULL
      ORDER BY w.removed_at DESC
    `);
    return result.rows;
  }
}

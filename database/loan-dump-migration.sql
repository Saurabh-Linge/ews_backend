-- Drop old table and create full LOAN DUMP schema
DROP TABLE IF EXISTS ews_loan_dump CASCADE;

CREATE TABLE ews_loan_dump (
  id                            SERIAL PRIMARY KEY,
  -- Key identifiers
  branch_code                   VARCHAR(20),
  customer_no                   VARCHAR(50),
  product_code                  VARCHAR(20),
  product_desc                  TEXT,
  scheme_code                   VARCHAR(20),
  scheme_desc                   TEXT,
  account_no                    VARCHAR(50),
  account_id                    VARCHAR(50) UNIQUE,
  long_name                     TEXT,
  member_type                   VARCHAR(50),
  -- Dates
  account_open_date             DATE,
  sanc_date                     DATE,
  disbursement_date             DATE,
  exp_date                      DATE,
  instal_start_date             DATE,
  insp_date                     DATE,
  suit_file_dt                  DATE,
  birth_date                    DATE,
  charge_noted_date             DATE,
  valuation_date                DATE,
  npa_date                      DATE,
  effective_from_date           DATE,
  policy_due_date               DATE,
  policy_commencement_date      DATE,
  -- Financial
  sanc_authority                TEXT,
  tot_sanc_limit                NUMERIC(18,2),
  disbursement_amount           NUMERIC(18,2),
  principal_outstanding         NUMERIC(18,2),
  interest_outstanding          NUMERIC(18,2),
  charges_os                    NUMERIC(18,2),
  interest_receivable_oir       NUMERIC(18,2),
  interest_receivable_oir2      NUMERIC(18,2),
  balance                       NUMERIC(18,2),
  security_amount               NUMERIC(18,2),
  standard_int_rate             NUMERIC(8,4),
  int_rate                      NUMERIC(8,4),
  no_of_instl                   INTEGER,
  instal_amt                    NUMERIC(18,2),
  award_amt                     NUMERIC(18,2),
  cibil_score                   NUMERIC(6,2),
  plantand_machinery            NUMERIC(18,2),
  trunover_details              NUMERIC(18,2),
  borrower_property_count       INTEGER,
  -- Flags / Categories
  lninstfreq                    VARCHAR(20),
  npa                           VARCHAR(5),
  loan_against_deposit          VARCHAR(5),
  priority_sector_yn            VARCHAR(5),
  non_priority_sector           TEXT,
  priority_sector_category      TEXT,
  sub_priority_sector_category  TEXT,
  sub_priority_sector_category1 TEXT,
  sub_priority_sector_category2 TEXT,
  weaker_sector_yn              VARCHAR(5),
  weaker_sector_category        TEXT,
  sub_weaker_sector_code        VARCHAR(50),
  purpose_code                  TEXT,
  sub_purpose_code              TEXT,
  bank_cust_rating              VARCHAR(50),
  pan_no                        VARCHAR(20),
  industry_type                 TEXT,
  industry_sub_type             TEXT,
  govt_prog_yn                  VARCHAR(5),
  address1                      TEXT,
  award_status                  VARCHAR(50),
  membership_no                 VARCHAR(50),
  gender                        VARCHAR(10),
  cersai_charge_noted           VARCHAR(5),
  property_asset_id             VARCHAR(50),
  interest_id                   VARCHAR(50),
  udyam_reg_number              VARCHAR(50),
  enduse                        TEXT,
  credit_rating                 VARCHAR(50),
  ckyc_no                       VARCHAR(50),
  is_existing_home_owner        VARCHAR(5),
  insurance_company             TEXT,
  policy_type                   VARCHAR(50),
  policy_number                 VARCHAR(50),
  security_type                 TEXT,
  -- Metadata
  upload_id                     INTEGER REFERENCES ews_cbs_uploads(id) ON DELETE SET NULL,
  uploaded_at                   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_loan_dump_account_id ON ews_loan_dump(account_id);
CREATE INDEX idx_loan_dump_branch     ON ews_loan_dump(branch_code);
CREATE INDEX idx_loan_dump_upload     ON ews_loan_dump(upload_id);

-- Drop and recreate CBS rules table to support expression-based rules
DROP TABLE IF EXISTS ews_cbs_rules CASCADE;

CREATE TABLE ews_cbs_rules (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  description TEXT,
  signal_ids  INTEGER[] DEFAULT '{}',
  -- Expression-based rule: e.g. "(principal_outstanding > 0) AND (npa = 'Y') OR (int_rate > TODAY_DAYS)"
  expression  TEXT NOT NULL,
  enabled     BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP WITH TIME ZONE
);

-- Default sample rules
INSERT INTO ews_cbs_rules (name, description, expression, signal_ids, enabled) VALUES
  ('NPA Account', 'Account marked as NPA', 'npa = "Y"', ARRAY[1], true),
  ('High Principal Outstanding', 'Principal outstanding > 1 lakh', 'principal_outstanding > 100000', ARRAY[2], true),
  ('Overdue Balance', 'Balance is negative (overdue)', 'balance < 0', ARRAY[3], true),
  ('High Interest Rate', 'Interest rate above 15%', 'int_rate > 15', ARRAY[4], true),
  ('Expired Loan', 'Loan expiry date is before today', 'exp_date < TODAY', '{}', true),
  ('SMA Account', 'SMA-1 or SMA-2 rating', 'bank_cust_rating = "SMA 1" OR bank_cust_rating = "SMA 2"', '{}', true),
  ('Large Security Gap', 'Principal outstanding exceeds security amount', 'principal_outstanding > security_amount AND security_amount > 0', '{}', true);

-- ================================================================
-- EWS Database Schema Migration
-- Early Warning Signal System — Rajarshi Shahu Sahakari Bank Ltd.
-- Database: ews
-- ================================================================

-- ── 0. Utilities & Functions ───────────────────────────────────
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ── 0. Masters: Roles, Branches, Users ─────────────────────────
CREATE TABLE IF NOT EXISTS ews_roles (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ews_branches (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL UNIQUE,
  code        VARCHAR(50) UNIQUE,
  address     TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ews_users (
  id          SERIAL PRIMARY KEY,
  username    VARCHAR(100) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,
  full_name   VARCHAR(200) NOT NULL,
  email       VARCHAR(200),
  role_id     INTEGER NOT NULL REFERENCES ews_roles(id),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ
);
CREATE TRIGGER update_ews_users_modtime BEFORE UPDATE ON ews_users FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TABLE IF NOT EXISTS ews_user_branches (
  user_id     INTEGER NOT NULL REFERENCES ews_users(id) ON DELETE CASCADE,
  branch_id   INTEGER NOT NULL REFERENCES ews_branches(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, branch_id)
);

CREATE TABLE IF NOT EXISTS ews_loan_products (
  id           SERIAL PRIMARY KEY,
  product_code VARCHAR(100),
  product_name VARCHAR(300),
  scheme_code  VARCHAR(100),
  scheme_desc  VARCHAR(300),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ── 1. EWS Signals Master (46 RBI Annex II signals) ────────────
CREATE TABLE IF NOT EXISTS ews_signals (
  id           SERIAL PRIMARY KEY,
  number       INTEGER NOT NULL UNIQUE,
  name         VARCHAR(300) NOT NULL,
  category     VARCHAR(100) NOT NULL,
  default_risk VARCHAR(20) NOT NULL DEFAULT 'Medium', -- High / Medium / Low
  weight       INTEGER NOT NULL DEFAULT 2,
  description  TEXT DEFAULT '',
  enabled      BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ
);
CREATE TRIGGER update_ews_signals_modtime BEFORE UPDATE ON ews_signals FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TABLE IF NOT EXISTS ews_signal_questions (
  id              SERIAL PRIMARY KEY,
  signal_id       INTEGER NOT NULL REFERENCES ews_signals(id) ON DELETE CASCADE,
  question_text   TEXT NOT NULL,
  question_type   VARCHAR(50) DEFAULT 'Follow-up', -- 'Gate', 'Follow-up'
  cbs_availability VARCHAR(50), -- 'YES', 'PARTIAL', 'NO'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Loan Type × Signal Config (Y/C/N per loan type) ────────
CREATE TABLE IF NOT EXISTS ews_loan_type_signal_config (
  id             SERIAL PRIMARY KEY,
  signal_id      INTEGER NOT NULL REFERENCES ews_signals(id),
  loan_type      VARCHAR(100) NOT NULL,
  applicability  CHAR(1) NOT NULL DEFAULT 'N', -- Y=Always, C=Conditional, N=Never
  updated_by     VARCHAR(100),
  updated_at     TIMESTAMPTZ,
  UNIQUE (signal_id, loan_type)
);
CREATE TRIGGER update_ews_loan_type_signal_config_modtime BEFORE UPDATE ON ews_loan_type_signal_config FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- ── 3. CBS Rules ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ews_cbs_rules (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  field       VARCHAR(100) NOT NULL,
  operator    VARCHAR(10) NOT NULL,  -- >, >=, <, <=, =, !=
  threshold   VARCHAR(100) NOT NULL,
  signal_id   INTEGER REFERENCES ews_signals(id),
  description TEXT DEFAULT '',
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ
);
CREATE TRIGGER update_ews_cbs_rules_modtime BEFORE UPDATE ON ews_cbs_rules FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- ── 4. EWS Watch List ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ews_watch_list (
  id            SERIAL PRIMARY KEY,
  account_id    VARCHAR(50) NOT NULL,
  borrower_name VARCHAR(200) NOT NULL,
  branch        VARCHAR(100) NOT NULL,
  branch_id     INTEGER,
  loan_type     VARCHAR(100) NOT NULL,
  source        VARCHAR(20) NOT NULL,  -- Auditor / System / Manual
  risk_level    VARCHAR(20) NOT NULL DEFAULT 'Medium',
  status        VARCHAR(50) NOT NULL DEFAULT 'Pending review',
  added_by      VARCHAR(100),
  updated_by    VARCHAR(100),
  removed_by    VARCHAR(100),
  resolution    VARCHAR(200),
  added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ,
  removed_at    TIMESTAMPTZ
);
CREATE TRIGGER update_ews_watch_list_modtime BEFORE UPDATE ON ews_watch_list FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE INDEX IF NOT EXISTS idx_ews_watch_list_account ON ews_watch_list(account_id);
CREATE INDEX IF NOT EXISTS idx_ews_watch_list_status ON ews_watch_list(status);

-- ── 5. Account Signals (signals fired per account) ────────────
CREATE TABLE IF NOT EXISTS ews_account_signals (
  id             SERIAL PRIMARY KEY,
  watch_list_id  INTEGER NOT NULL REFERENCES ews_watch_list(id),
  signal_id      INTEGER NOT NULL REFERENCES ews_signals(id),
  layer          INTEGER NOT NULL,  -- 1=Auditor, 2=CBS, 3=RO
  details        JSONB DEFAULT '{}',
  triggered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (watch_list_id, signal_id, layer)
);

-- ── 6. CBS Uploads ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ews_cbs_uploads (
  id           SERIAL PRIMARY KEY,
  uploaded_by  VARCHAR(100) NOT NULL,
  total_rows   INTEGER NOT NULL DEFAULT 0,
  new_flagged  INTEGER NOT NULL DEFAULT 0,
  updated      INTEGER NOT NULL DEFAULT 0,
  needs_review INTEGER NOT NULL DEFAULT 0,
  status       VARCHAR(20) NOT NULL DEFAULT 'Processing',
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- ── 7. CBS Upload Results ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS ews_cbs_upload_results (
  id            SERIAL PRIMARY KEY,
  upload_id     INTEGER NOT NULL REFERENCES ews_cbs_uploads(id),
  account_id    VARCHAR(50) NOT NULL,
  borrower_name VARCHAR(200),
  branch        VARCHAR(100),
  signal_id     INTEGER REFERENCES ews_signals(id),
  value         TEXT,
  action        VARCHAR(50)  -- New flagged / Updated / Needs review
);

-- ── 8. Audit Triggers (Layer 1 — from AuditPro API) ──────────
CREATE TABLE IF NOT EXISTS ews_audit_triggers (
  id             SERIAL PRIMARY KEY,
  watch_list_id  INTEGER NOT NULL REFERENCES ews_watch_list(id),
  audit_id       VARCHAR(100) NOT NULL,
  triggered_by   VARCHAR(100),
  signal_count   INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 9. RO Assessments (Layer 3) ───────────────────────────────
CREATE TABLE IF NOT EXISTS ews_ro_assessments (
  id             SERIAL PRIMARY KEY,
  watch_list_id  INTEGER NOT NULL REFERENCES ews_watch_list(id),
  signal_id      INTEGER REFERENCES ews_signals(id),
  question_text  TEXT NOT NULL,
  answer         TEXT,
  risk_area      VARCHAR(100),
  ro_user        VARCHAR(100),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ,
  UNIQUE (watch_list_id, question_text)
);
CREATE TRIGGER update_ews_ro_assessments_modtime BEFORE UPDATE ON ews_ro_assessments FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- ── 10. Investigations ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ews_investigations (
  id              SERIAL PRIMARY KEY,
  watch_list_id   INTEGER NOT NULL REFERENCES ews_watch_list(id),
  sent_by         VARCHAR(100),
  notes           TEXT,
  deadline        TIMESTAMPTZ,
  branch_response TEXT,
  response_by     VARCHAR(100),
  response_at     TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,
  status          VARCHAR(50) NOT NULL DEFAULT 'Pending', -- Pending / Branch responded / Overdue
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ
);
CREATE TRIGGER update_ews_investigations_modtime BEFORE UPDATE ON ews_investigations FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- ── 11. Escalations ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ews_escalations (
  id                SERIAL PRIMARY KEY,
  watch_list_id     INTEGER NOT NULL REFERENCES ews_watch_list(id),
  escalated_by      VARCHAR(100),
  reason            TEXT,
  ro_recommendation TEXT,
  cro_decision      VARCHAR(50),  -- Approved / Sent back / Downgraded / Force escalated
  decided_by        VARCHAR(100),
  decision_notes    TEXT,
  status            VARCHAR(50) NOT NULL DEFAULT 'Pending CRO',
  escalated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at        TIMESTAMPTZ
);

-- ── 12. Disputes ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ews_disputes (
  id               SERIAL PRIMARY KEY,
  watch_list_id    INTEGER NOT NULL REFERENCES ews_watch_list(id),
  signal_id        INTEGER REFERENCES ews_signals(id),
  branch           VARCHAR(100),
  reason           TEXT,
  raised_by        VARCHAR(100),
  status           VARCHAR(20) NOT NULL DEFAULT 'Pending',  -- Pending / Accepted / Rejected
  resolved_by      VARCHAR(100),
  resolution_notes TEXT,
  attachments      JSONB DEFAULT '[]'::jsonb,
  raised_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ
);

-- ── 13. Audit Trail ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ews_audit_trail (
  id             SERIAL PRIMARY KEY,
  account_id     VARCHAR(50) NOT NULL,
  borrower_name  VARCHAR(200),
  branch         VARCHAR(100),
  action         VARCHAR(200) NOT NULL,
  performed_by   VARCHAR(100),
  remarks        TEXT,
  attachments    JSONB,
  logged_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ews_audit_trail_account ON ews_audit_trail(account_id);

-- ── 14. Risk Config ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ews_risk_config (
  id          SERIAL PRIMARY KEY,
  key         VARCHAR(100) NOT NULL UNIQUE,
  value       TEXT NOT NULL,
  changed_by  VARCHAR(100),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER update_ews_risk_config_modtime BEFORE UPDATE ON ews_risk_config FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- ── 15. Config Changelog ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS ews_config_changelog (
  id          SERIAL PRIMARY KEY,
  section     VARCHAR(100),
  key         VARCHAR(100),
  old_value   TEXT,
  new_value   TEXT,
  changed_by  VARCHAR(100),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- SEED: Default Risk Config
-- ================================================================
INSERT INTO ews_risk_config (key, value, changed_by) VALUES
  ('threshold_low',           '1',        'system'),
  ('threshold_medium',        '3',        'system'),
  ('threshold_high',          '6',        'system'),
  ('threshold_very_high',     '10',       'system'),
  ('weight_high_signal',      '3',        'system'),
  ('weight_medium_signal',    '2',        'system'),
  ('weight_low_signal',       '1',        'system'),
  ('auto_escalate_risk',      'Very High','system'),
  ('ro_cannot_close_risk',    'Very High','system'),
  ('investigation_deadline_days', '7',    'system'),
  ('overdue_alert_days',      '7',        'system'),
  ('ro_questionnaire_mode',   'full',     'system')
ON CONFLICT (key) DO NOTHING;

-- ================================================================
-- SEED: 46 RBI Annex II EWS Signals
-- ================================================================
INSERT INTO ews_signals (number, name, category, default_risk, weight) VALUES
  (1,  'Default in payment of statutory dues (PF, ESI, GST etc.)',                  'Compliance',         'High',   3),
  (2,  'Bouncing of high-value cheques',                                             'Payment Behaviour',  'High',   3),
  (3,  'Frequent requests for project cost revision / scope change',                 'Credit Facility',    'Medium', 2),
  (4,  'Delay in payment of dues / interest / instalments',                         'Payment Behaviour',  'High',   3),
  (5,  'BG / LC invocations and LC devolvement',                                    'Trade Finance',      'High',   3),
  (6,  'Under-insurance of assets charged to bank',                                 'Collateral',         'High',   3),
  (7,  'Non-submission of invoices / bills with TAN or without TAN',                'Document',           'Medium', 2),
  (8,  'Disputed / contested title of collateral',                                  'Legal',              'High',   3),
  (9,  'Funds from other sources used for repayment',                               'Account Conduct',    'High',   3),
  (10, 'Postponement of plant / collateral inspection',                             'Operational',        'Medium', 2),
  (11, 'Reduction in credit rating by external agency',                             'Credit Facility',    'High',   3),
  (12, 'Frequent visit of borrower to bank without substantial reason',             'Operational',        'Low',    1),
  (13, 'Return of export documents by the overseas buyer',                          'Trade Finance',      'High',   3),
  (14, 'Drawing power (DP) lower than the outstanding balance',                     'Credit Monitoring',  'High',   3),
  (15, 'Frequent / large number of ad hoc sanctions',                               'Credit Facility',    'Medium', 2),
  (16, 'Non-renewal of limits on due date',                                         'Credit Facility',    'Medium', 2),
  (17, 'Downgrade of credit facilities to Special Mention Account (SMA)',           'Credit Monitoring',  'High',   3),
  (18, 'Submission of false / fabricated stock statements',                         'Document',           'High',   3),
  (19, 'Sales proceeds not routed through the bank',                                'Account Conduct',    'High',   3),
  (20, 'Frequent over-drawal in accounts',                                          'Account Conduct',    'Medium', 2),
  (21, 'Large RTGS / NEFT transactions to unrelated third parties',                 'Account Conduct',    'High',   3),
  (22, 'Heavy cash withdrawal in CC / loan accounts',                               'Account Conduct',    'High',   3),
  (23, 'Diversion of funds to subsidiary / sister concerns',                        'Account Conduct',    'High',   3),
  (24, 'Advances to related parties by the borrower',                               'Account Conduct',    'High',   3),
  (25, 'Sudden spurt in sundry creditors',                                          'Financial Statements','Medium', 2),
  (26, 'Substantial decrease in debtors or inventory',                              'Financial Statements','Medium', 2),
  (27, 'Frequent change of accounting policy',                                      'Operational',        'Medium', 2),
  (28, 'Delay in submission of audited financial statements',                       'Document',           'Medium', 2),
  (29, 'Qualified audit report',                                                    'Document',           'High',   3),
  (30, 'Significant drop in sales / revenue',                                       'Financial Statements','High',   3),
  (31, 'Reduction in workforce without valid reason',                               'Operational',        'Medium', 2),
  (32, 'Significant increase in receivables / debtors',                             'Financial Statements','Medium', 2),
  (33, 'Large difference in growth of credit and debit balance in CC account',      'Credit Monitoring',  'High',   3),
  (34, 'Unusual transactions in related party accounts',                            'Account Conduct',    'High',   3),
  (35, 'Delay in project implementation beyond stipulated timeline',               'Credit Facility',    'Medium', 2),
  (36, 'Non-cooperation / denial of site access to bank officials',                 'Operational',        'High',   3),
  (37, 'Overdue foreign bills (export / import)',                                   'Trade Finance',      'High',   3),
  (38, 'Repayment through proceeds of fresh term loan instead of cash flow',        'Credit Facility',    'High',   3),
  (39, 'Interest funded by additional credit facility',                             'Credit Monitoring',  'High',   3),
  (40, 'Funds transferred to group companies without adequate justification',       'Account Conduct',    'High',   3),
  (41, 'Significant increase in working capital cycle',                             'Financial Statements','Medium', 2),
  (42, 'Transfer of business from group concern without valid reason',              'Operational',        'Medium', 2),
  (43, 'Promoter / guarantor willingness to hold additional security',              'Collateral',         'Medium', 2),
  (44, 'Government / regulatory action against borrower',                           'Legal',              'High',   3),
  (45, 'News / media reports about fraud / misappropriation',                       'Legal',              'High',   3),
  (46, 'Evergreening of accounts',                                                  'Credit Monitoring',  'High',   3)
ON CONFLICT (number) DO NOTHING;

-- ================================================================
-- SEED: Default CBS Rules (8 key rules)
-- ================================================================
INSERT INTO ews_cbs_rules (name, field, operator, threshold, signal_id, description) VALUES
  ('Cheque bounce high value',         'cheque_bounce_amount',   '>',  '100000', 2,  'Cheque return > ₹1,00,000'),
  ('Cash withdrawal 3 days',           'cash_withdrawal_3days',  '>',  '100000', 22, 'Cash withdrawal > ₹1L in 3 days'),
  ('Overdue DPD 30+',                  'dpd_days',               '>=', '30',     4,  'DPD >= 30 days'),
  ('DP lower than outstanding',        'dp_deficit',             '>',  '0',      14, 'DP < Outstanding (deficit > 0)'),
  ('RTGS to unrelated parties large',  'rtgs_unrelated',         '>',  '500000', 21, 'RTGS to unrelated > ₹5L'),
  ('BG invocation',                    'bg_invocation',          '>',  '0',      5,  'BG invoked > 0 times'),
  ('Foreign bills overdue',            'foreign_bills_overdue',  '>',  '0',      37, 'Overdue foreign export/import bills'),
  ('Frequent ad hoc sanctions',        'adhoc_sanctions_count',  '>=', '3',      15, 'Ad hoc sanctions >= 3 times')
ON CONFLICT DO NOTHING;

-- ================================================================
-- SEED: Roles, Branches, Users
-- ================================================================

-- 1. Roles
INSERT INTO ews_roles (name, description) VALUES
  ('admin', 'System Administrator'),
  ('cro', 'Chief Risk Officer'),
  ('ro', 'Risk Officer'),
  ('branch', 'Branch Manager')
ON CONFLICT (name) DO NOTHING;

-- 2. Branches
INSERT INTO ews_branches (name, code) VALUES
  ('Main Branch', 'BR001'),
  ('Downtown Branch', 'BR002'),
  ('Uptown Branch', 'BR003')
ON CONFLICT (name) DO NOTHING;

-- 3. Users (Passwords are hashed "password" as a placeholder, we can use simple plain text for demo if backend handles it, but let''s assume 'password' hash is '$2b$10$abcdefghijklmnopqrstuv' or we just use 'password123' and hash it in the code if needed. Actually we'll just put plain text here and the auth controller can compare normally for demo purposes, or a simple mock hash)
INSERT INTO ews_users (username, password, full_name, email, role_id) VALUES
  ('admin', 'admin123', 'System Admin', 'admin@bank.com', (SELECT id FROM ews_roles WHERE name = 'admin')),
  ('cro_user', 'cro123', 'John CRO', 'cro@bank.com', (SELECT id FROM ews_roles WHERE name = 'cro')),
  ('ro_user1', 'ro123', 'Alice RO', 'alice.ro@bank.com', (SELECT id FROM ews_roles WHERE name = 'ro')),
  ('branch_mgr1', 'branch123', 'Bob Manager', 'bob.mgr@bank.com', (SELECT id FROM ews_roles WHERE name = 'branch')),
  ('branch_mgr2', 'branch123', 'Charlie Manager', 'charlie.mgr@bank.com', (SELECT id FROM ews_roles WHERE name = 'branch'))
ON CONFLICT (username) DO NOTHING;

-- 4. User Branches (Assignments)
-- Assign RO Alice to Downtown (2) and Uptown (3)
INSERT INTO ews_user_branches (user_id, branch_id) VALUES
  ((SELECT id FROM ews_users WHERE username = 'ro_user1'), (SELECT id FROM ews_branches WHERE name = 'Downtown Branch')),
  ((SELECT id FROM ews_users WHERE username = 'ro_user1'), (SELECT id FROM ews_branches WHERE name = 'Uptown Branch'))
ON CONFLICT DO NOTHING;

-- Assign Branch Mgr Bob to Main Branch
INSERT INTO ews_user_branches (user_id, branch_id) VALUES
  ((SELECT id FROM ews_users WHERE username = 'branch_mgr1'), (SELECT id FROM ews_branches WHERE name = 'Main Branch'))
ON CONFLICT DO NOTHING;

-- Assign Branch Mgr Charlie to Downtown Branch
INSERT INTO ews_user_branches (user_id, branch_id) VALUES
  ((SELECT id FROM ews_users WHERE username = 'branch_mgr2'), (SELECT id FROM ews_branches WHERE name = 'Downtown Branch'))
ON CONFLICT DO NOTHING;

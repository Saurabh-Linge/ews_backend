TRUNCATE TABLE ews_cbs_rules RESTART IDENTITY;

INSERT INTO ews_cbs_rules (name, description, expression, signal_ids, enabled) VALUES
  ('Limit Breach (Signal #14)', 'Principal Outstanding > Total Sanctioned Limit', 'principal_outstanding > tot_sanc_limit', ARRAY[14], true),
  ('Account Expired / Overdue', 'Exp Date < TODAY and Principal Outstanding > 0', 'is_expired = TRUE AND principal_outstanding > 0', ARRAY[4], true),
  ('Interest Not Being Paid', 'Interest Outstanding > 0 and account not NPA', 'interest_outstanding > 0 AND is_npa = FALSE', ARRAY[4], true),
  ('Interest Receivable (OIR)', 'Interest Receivable > 0', 'interest_receivable_oir > 0', ARRAY[4], true),
  ('Account is NPA', 'NPA flag is Y', 'is_npa = TRUE', ARRAY[4], true),
  ('Security Insufficient', 'Principal Outstanding > Security Amount', 'principal_outstanding > security_amount', ARRAY[14], true),
  ('Stock/Hyp Insurance Lapsed', 'Security Type is Stock/Hyp and Policy Due Date passed', 'security_type LIKE "%STOCK%" AND policy_due_date < TODAY', ARRAY[6], true),
  ('Stock Inspection Overdue', 'More than 180 days since stock inspection', 'days_since_insp > 180 AND security_type LIKE "%STOCK%"', ARRAY[10], true),
  ('Property CERSAI Missing', 'CERSAI Charge Noted is N for Property', 'cersai_charge_noted = "N" AND security_type LIKE "%PROPERTY%"', ARRAY[12], true),
  ('Instalments Not Paid', 'Interest Outstanding > 2x Instalment Amount', 'interest_outstanding > (instal_amt * 2)', ARRAY[4], true),
  ('Bank Cust Rating D/E', 'Internal rating is D or E', 'bank_cust_rating = "D" OR bank_cust_rating = "E"', ARRAY[14], true),
  ('Suit Filed', 'Suit File Date is present', 'suit_file_dt != NULL', ARRAY[8, 32], true),
  ('Award Against Borrower', 'Court decree against borrower with amount > 0', 'award_status = "AGAINST BORROWER" AND award_amt > 0', ARRAY[32], true),
  ('CIBIL Score Low', 'CIBIL Score below 650', 'cibil_score < 650 AND cibil_score > 0', ARRAY[4, 9], true),
  ('Credit Rating D/E', 'External credit rating is D or E', 'credit_rating = "D" OR credit_rating = "E"', ARRAY[4, 14], true);

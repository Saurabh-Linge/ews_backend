-- 1. Clear existing data
DELETE FROM ews_user_branches;
DELETE FROM ews_users;
DELETE FROM ews_branches;

-- 2. Insert Branches
INSERT INTO ews_branches (name) VALUES
('HEAD OFFICE'),
('SHUKRAWAR PETH'),
('DHANKAWADI'),
('PAUD ROAD KOTHRUD'),
('BIBVEWADI'),
('SINHGAD ROAD'),
('KATRAJ'),
('MANJARI'),
('PHURSUNGI'),
('UNDRI'),
('SHIVANE'),
('NARHE'),
('URULI KANCHAN'),
('KHEDSHIVAPUR'),
('URULI DEVACHI'),
('WAGHOLI');

-- 3. Insert Users (Admin, CRO, RO)
INSERT INTO ews_users (username, password, full_name, role_id) VALUES
('admin', 'admin123', 'System Administrator', (SELECT id FROM ews_roles WHERE name='admin')),
('cro_user', 'cro123', 'Chief Risk Officer', (SELECT id FROM ews_roles WHERE name='cro')),
('ro_user1', 'ro123', 'Regional Risk Officer', (SELECT id FROM ews_roles WHERE name='ro'));

-- 4. Insert Branch Manager Users
INSERT INTO ews_users (username, password, full_name, role_id)
SELECT 
  'bm_' || lower(replace(name, ' ', '_')), 
  'branch123', 
  initcap(name) || ' Manager', 
  (SELECT id FROM ews_roles WHERE name='branch')
FROM ews_branches;

-- 5. Assign Branches
-- Assign all branches to CRO
INSERT INTO ews_user_branches (user_id, branch_id)
SELECT u.id, b.id FROM ews_users u CROSS JOIN ews_branches b WHERE u.username = 'cro_user';

-- Assign all branches to RO (for testing purposes, RO handles all)
INSERT INTO ews_user_branches (user_id, branch_id)
SELECT u.id, b.id FROM ews_users u CROSS JOIN ews_branches b WHERE u.username = 'ro_user1';

-- Assign Admin to all branches
INSERT INTO ews_user_branches (user_id, branch_id)
SELECT u.id, b.id FROM ews_users u CROSS JOIN ews_branches b WHERE u.username = 'admin';

-- Assign Branch Managers to their specific branch
INSERT INTO ews_user_branches (user_id, branch_id)
SELECT u.id, b.id 
FROM ews_users u 
JOIN ews_branches b ON u.username = 'bm_' || lower(replace(b.name, ' ', '_'))
WHERE u.role_id = (SELECT id FROM ews_roles WHERE name='branch');

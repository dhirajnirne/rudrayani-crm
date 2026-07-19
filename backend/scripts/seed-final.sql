-- Test data seed - matches actual schema
BEGIN;

-- Create branches
INSERT INTO branches (agency_id, name, created_at)
SELECT id, 'Mumbai Branch', NOW() FROM agencies LIMIT 1;

INSERT INTO branches (agency_id, name, created_at)
SELECT id, 'Pune Branch', NOW() FROM agencies LIMIT 1;

-- Create teams
INSERT INTO teams (branch_id, name, created_at)
SELECT id, 'Collections Team A', NOW() FROM branches WHERE name = 'Mumbai Branch';

INSERT INTO teams (branch_id, name, created_at)
SELECT id, 'Collections Team B', NOW() FROM branches WHERE name = 'Pune Branch';

-- Create companies
INSERT INTO companies (agency_id, name, created_at)
SELECT id, 'HDFC Bank', NOW() FROM agencies LIMIT 1;

INSERT INTO companies (agency_id, name, created_at)
SELECT id, 'ICICI Bank', NOW() FROM agencies LIMIT 1;

-- Create buckets (per company)
INSERT INTO buckets (company_id, label, sort_order, category, is_current, created_at)
SELECT id, '0-30 DPD', 1, 'normal', true, NOW() FROM companies WHERE name = 'HDFC Bank';

INSERT INTO buckets (company_id, label, sort_order, category, is_current, created_at)
SELECT id, '31-60 DPD', 2, 'normal', false, NOW() FROM companies WHERE name = 'HDFC Bank';

INSERT INTO buckets (company_id, label, sort_order, category, is_current, created_at)
SELECT id, '0-30 DPD', 1, 'normal', true, NOW() FROM companies WHERE name = 'ICICI Bank';

-- Create products (per company)
INSERT INTO products (company_id, raw_label, canonical_label, created_at)
SELECT id, 'Personal Loan', 'Personal Loan', NOW() FROM companies WHERE name = 'HDFC Bank';

INSERT INTO products (company_id, raw_label, canonical_label, created_at)
SELECT id, 'Home Loan', 'Home Loan', NOW() FROM companies WHERE name = 'HDFC Bank';

INSERT INTO products (company_id, raw_label, canonical_label, created_at)
SELECT id, 'Personal Loan', 'Personal Loan', NOW() FROM companies WHERE name = 'ICICI Bank';

-- Create employees (users)
-- Note: team_leader was removed (Phase 2) -- teams report directly to their
-- branch's branch_manager now. These two become branch managers instead.
-- Branch manager for Mumbai
INSERT INTO users (
  agency_id, full_name, phone, password_hash, is_active, designation, created_at
)
SELECT a.id, 'Priya Sharma', '9876543211',
  '$2b$10$73Xdsap8jBDWBmqvB6ZKweyRvz95IOsXpS2vcbCfq0w1YfWQdmHbG',
  true, 'branch_manager', NOW()
FROM agencies a
LIMIT 1;
UPDATE branches SET branch_manager_id = (SELECT id FROM users WHERE full_name = 'Priya Sharma')
 WHERE name = 'Mumbai Branch';

-- Branch manager for Pune
INSERT INTO users (
  agency_id, full_name, phone, password_hash, is_active, designation, created_at
)
SELECT a.id, 'Rajesh Patel', '9876543212',
  '$2b$10$73Xdsap8jBDWBmqvB6ZKweyRvz95IOsXpS2vcbCfq0w1YfWQdmHbG',
  true, 'branch_manager', NOW()
FROM agencies a
LIMIT 1;
UPDATE branches SET branch_manager_id = (SELECT id FROM users WHERE full_name = 'Rajesh Patel')
 WHERE name = 'Pune Branch';

-- Telecallers
INSERT INTO users (
  agency_id, full_name, phone, password_hash, is_active, branch_id, team_id,
  is_telecaller, created_at
)
SELECT a.id, 'Amit Kumar', '9876543213',
  '$2b$10$73Xdsap8jBDWBmqvB6ZKweyRvz95IOsXpS2vcbCfq0w1YfWQdmHbG',
  true, b.id, t.id, true, NOW()
FROM agencies a, branches b, teams t
WHERE b.name = 'Mumbai Branch' AND t.name = 'Collections Team A'
LIMIT 1;

INSERT INTO users (
  agency_id, full_name, phone, password_hash, is_active, branch_id, team_id,
  is_telecaller, created_at
)
SELECT a.id, 'Neha Singh', '9876543214',
  '$2b$10$73Xdsap8jBDWBmqvB6ZKweyRvz95IOsXpS2vcbCfq0w1YfWQdmHbG',
  true, b.id, t.id, true, NOW()
FROM agencies a, branches b, teams t
WHERE b.name = 'Pune Branch' AND t.name = 'Collections Team B'
LIMIT 1;

-- Field agents
INSERT INTO users (
  agency_id, full_name, phone, password_hash, is_active, branch_id, team_id,
  is_field_agent, created_at
)
SELECT a.id, 'Vikram Desai', '9876543215',
  '$2b$10$73Xdsap8jBDWBmqvB6ZKweyRvz95IOsXpS2vcbCfq0w1YfWQdmHbG',
  true, b.id, t.id, true, NOW()
FROM agencies a, branches b, teams t
WHERE b.name = 'Mumbai Branch' AND t.name = 'Collections Team A'
LIMIT 1;

INSERT INTO users (
  agency_id, full_name, phone, password_hash, is_active, branch_id, team_id,
  is_field_agent, created_at
)
SELECT a.id, 'Zara Khan', '9876543216',
  '$2b$10$73Xdsap8jBDWBmqvB6ZKweyRvz95IOsXpS2vcbCfq0w1YfWQdmHbG',
  true, b.id, t.id, true, NOW()
FROM agencies a, branches b, teams t
WHERE b.name = 'Pune Branch' AND t.name = 'Collections Team B'
LIMIT 1;

-- Create customers (NO agency_id column)
INSERT INTO customers (
  company_id, loan_number, customer_name, mobile_number,
  product, bucket, due_amount, status, created_at
)
SELECT c.id, 'HDFC-001', 'Rohit Verma', '9111111111',
  'Personal Loan', '0-30 DPD', 250000, 'active', NOW()
FROM companies c WHERE c.name = 'HDFC Bank' LIMIT 1;

INSERT INTO customers (
  company_id, loan_number, customer_name, mobile_number,
  product, bucket, due_amount, status, created_at
)
SELECT c.id, 'HDFC-002', 'Sakshi Iyer', '9111111112',
  'Home Loan', '31-60 DPD', 500000, 'active', NOW()
FROM companies c WHERE c.name = 'HDFC Bank' LIMIT 1;

-- Allocated to telecaller (Amit Kumar)
INSERT INTO customers (
  company_id, loan_number, customer_name, mobile_number,
  product, bucket, due_amount, status, assigned_agent_id, assigned_team_id, created_at
)
SELECT c.id, 'HDFC-003', 'Deepak Gupta', '9111111113',
  'Personal Loan', '0-30 DPD', 150000, 'active', u.id, t.id, NOW()
FROM companies c, users u, teams t
WHERE c.name = 'HDFC Bank' AND u.full_name = 'Amit Kumar' AND t.name = 'Collections Team A' LIMIT 1;

-- Allocated to field agent (Vikram Desai)
INSERT INTO customers (
  company_id, loan_number, customer_name, mobile_number,
  product, bucket, due_amount, status, assigned_field_agent_id, created_at
)
SELECT c.id, 'HDFC-004', 'Madhuri Deshmukh', '9111111114',
  'Home Loan', '31-60 DPD', 400000, 'active', u.id, NOW()
FROM companies c, users u
WHERE c.name = 'HDFC Bank' AND u.full_name = 'Vikram Desai' LIMIT 1;

-- Unallocated customer for dual-assignment testing
INSERT INTO customers (
  company_id, loan_number, customer_name, mobile_number,
  product, bucket, due_amount, status, created_at
)
SELECT c.id, 'ICICI-001', 'Priya Nair', '9111111115',
  'Personal Loan', '0-30 DPD', 300000, 'active', NOW()
FROM companies c
WHERE c.name = 'ICICI Bank' LIMIT 1;

COMMIT;

SELECT '✓ Test data seeded' AS result;
SELECT COUNT(*) AS customer_count FROM customers;
SELECT COUNT(*) AS user_count FROM users;

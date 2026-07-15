-- Add customer_branch field to field catalog (Track 3, Phase 3.4)
-- Allows Excel imports to map a branch name/code column to customers.branch_id

INSERT INTO system_field_definitions (agency_id, field_key, label, storage_column, field_type, is_core, sort_order)
SELECT a.id, 'customer_branch', 'Customer Branch', 'branch_id', 'resolver', false, 11
  FROM agencies a
ON CONFLICT (agency_id, field_key) DO NOTHING;

-- Add to company field settings as disabled by default (opt-in per company)
INSERT INTO company_field_settings (company_id, field_key, is_enabled, is_required, sort_order)
SELECT c.id, 'customer_branch', false, false, 11
  FROM companies c
ON CONFLICT (company_id, field_key) DO NOTHING;

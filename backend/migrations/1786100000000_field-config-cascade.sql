-- Up Migration

-- Follow-up to 1785800000000_field-config.sql: that migration had already
-- run (creating the FK constraints without ON DELETE CASCADE) by the time
-- this gap was found -- every existing test file's afterAll() does a plain
-- `DELETE FROM agencies/companies WHERE id = $1` without knowing these new
-- tables exist, exactly like buckets-master.sql / targets.sql anticipated
-- for their own tables via CASCADE. Rather than edit an already-applied
-- migration file (which node-pg-migrate won't re-run), this is a small
-- additive ALTER matching what 1785800000000's source now specifies.
ALTER TABLE system_field_definitions DROP CONSTRAINT system_field_definitions_agency_id_fkey;
ALTER TABLE system_field_definitions
  ADD CONSTRAINT system_field_definitions_agency_id_fkey
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE;

ALTER TABLE company_field_settings DROP CONSTRAINT company_field_settings_company_id_fkey;
ALTER TABLE company_field_settings
  ADD CONSTRAINT company_field_settings_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- Down Migration
ALTER TABLE company_field_settings DROP CONSTRAINT company_field_settings_company_id_fkey;
ALTER TABLE company_field_settings
  ADD CONSTRAINT company_field_settings_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE system_field_definitions DROP CONSTRAINT system_field_definitions_agency_id_fkey;
ALTER TABLE system_field_definitions
  ADD CONSTRAINT system_field_definitions_agency_id_fkey
  FOREIGN KEY (agency_id) REFERENCES agencies(id);

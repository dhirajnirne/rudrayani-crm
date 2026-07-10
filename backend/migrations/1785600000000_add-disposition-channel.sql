-- Up Migration

-- Owner feedback round, Phase 6: agents currently see one flat list of ~70
-- disposition codes regardless of whether they're logging a phone call (OC)
-- or a field visit (FV). Trail_Codes.xlsx tags most rows with a channel
-- already ("OC", "FV", "LG" call-forward, "PIOC"/"PIFV" part-payment variants)
-- but 24 rows are marked "OC/FV" -- usable from either channel with identical
-- wording. Add `channel` so the mobile/web pickers can filter to the
-- channel the agent is actually working in.
ALTER TABLE disposition_codes ADD COLUMN channel TEXT CHECK (channel IN ('FV', 'OC'));

-- Backfill from action_code prefix. Custom agency-added codes that don't
-- match any known prefix are left NULL -- the admin UI surfaces these as a
-- banner so an admin can assign a channel by hand (see dispositions.ts).
UPDATE disposition_codes
   SET channel = 'FV'
 WHERE action_code ILIKE 'FV%' OR action_code = 'PIFV';

UPDATE disposition_codes
   SET channel = 'OC'
 WHERE (action_code ILIKE 'OC%' AND action_code <> 'OC/FV')
    OR action_code ILIKE 'LG%'
    OR action_code = 'PIOC';

-- Ambiguous "OC/FV" codes (24 seeded rows): usable from either channel with
-- identical label/description/remark template, so clone each into an FV row
-- and an OC row rather than guessing a single channel, then retire the
-- original via the existing is_active mechanism so it drops out of the
-- active picker without losing history (call_logs.disposition_code_id still
-- points at it for past entries).
INSERT INTO disposition_codes
    (agency_id, action_code, category, result_code, description, remark_template,
     needs_amount, needs_date, needs_time, needs_mode, needs_reason, needs_name_relation,
     is_active, channel)
SELECT agency_id, action_code, category, result_code, description, remark_template,
       needs_amount, needs_date, needs_time, needs_mode, needs_reason, needs_name_relation,
       is_active, 'FV'
  FROM disposition_codes
 WHERE action_code = 'OC/FV' AND channel IS NULL;

INSERT INTO disposition_codes
    (agency_id, action_code, category, result_code, description, remark_template,
     needs_amount, needs_date, needs_time, needs_mode, needs_reason, needs_name_relation,
     is_active, channel)
SELECT agency_id, action_code, category, result_code, description, remark_template,
       needs_amount, needs_date, needs_time, needs_mode, needs_reason, needs_name_relation,
       is_active, 'OC'
  FROM disposition_codes
 WHERE action_code = 'OC/FV' AND channel IS NULL;

UPDATE disposition_codes
   SET is_active = false
 WHERE action_code = 'OC/FV' AND channel IS NULL;

-- Down Migration
-- Data reversal is best-effort only: re-activating retired OC/FV originals
-- and removing every clone is not safely distinguishable from clones an
-- admin has since edited, so this only restores the retired originals and
-- drops the column. Any FV/OC clones remain as harmless extra rows.
UPDATE disposition_codes SET is_active = true WHERE action_code = 'OC/FV' AND is_active = false;
ALTER TABLE disposition_codes DROP COLUMN IF EXISTS channel;

-- Up Migration

-- MVP hardening: a repeat allocation-mode import previously applied
-- due_amount/bucket/etc. changes to already-active customers immediately
-- and silently, even when that customer already has calls/payments/PTPs
-- logged against the old numbers. Route these through the same
-- import_review_items queue additions/reactivations/removals already use,
-- instead of applying blind. First-time imports for a month are untouched
-- (nothing to protect yet).
ALTER TABLE import_review_items DROP CONSTRAINT import_review_items_item_type_check;
ALTER TABLE import_review_items ADD CONSTRAINT import_review_items_item_type_check
  CHECK (item_type IN ('addition', 'removal', 'reactivation', 'update'));

-- Down Migration
ALTER TABLE import_review_items DROP CONSTRAINT import_review_items_item_type_check;
ALTER TABLE import_review_items ADD CONSTRAINT import_review_items_item_type_check
  CHECK (item_type IN ('addition', 'removal', 'reactivation'));

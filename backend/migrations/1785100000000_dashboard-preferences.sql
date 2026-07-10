-- Up Migration

-- Per-user dashboard customization (show/hide + reorder metric widgets).
-- One row per user today (is_default always true), but the shape leaves
-- room for named multi-preset support later without another migration.
CREATE TABLE dashboard_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Default',
    layout JSONB NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX dashboard_preferences_one_default_per_user
    ON dashboard_preferences (user_id) WHERE is_default;
CREATE INDEX dashboard_preferences_user_id_idx ON dashboard_preferences (user_id);

-- Down Migration
DROP TABLE IF EXISTS dashboard_preferences;

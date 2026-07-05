-- Up Migration
-- Baseline: adopts the original scaffold schema (src/migrations/001_init.sql,
-- kept frozen for reference) into node-pg-migrate. Every statement is
-- idempotent (IF NOT EXISTS) so this applies cleanly both on fresh databases
-- and on the Phase-0 dev database where 001_init.sql was already run manually.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

CREATE TABLE IF NOT EXISTS agencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES agencies(id),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES branches(id),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES agencies(id),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Users with a capability model instead of a fixed role column.
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES agencies(id),
    branch_id UUID REFERENCES branches(id),
    team_id UUID REFERENCES teams(id),
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    email TEXT,
    password_hash TEXT NOT NULL,

    is_agency_admin BOOLEAN NOT NULL DEFAULT false,
    is_operations_manager BOOLEAN NOT NULL DEFAULT false,
    is_team_leader BOOLEAN NOT NULL DEFAULT false,
    is_telecaller BOOLEAN NOT NULL DEFAULT false,
    is_field_agent BOOLEAN NOT NULL DEFAULT false,

    active_device_id TEXT, -- enforces single active device/session
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Import Template Configuration: per-company Excel column mapping (Section 4).
CREATE TABLE IF NOT EXISTS import_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    name TEXT NOT NULL,
    column_mapping JSONB NOT NULL, -- e.g. {"Loan Number": "loan_number", "Due Amt": "due_amount"}
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    loan_number TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    mobile_number TEXT,
    product TEXT,       -- derived from import (Section 4)
    bucket TEXT,         -- pulled directly from Excel column (confirmed)
    due_amount NUMERIC,
    emi NUMERIC,
    assigned_team_id UUID REFERENCES teams(id),
    assigned_agent_id UUID REFERENCES users(id),
    custom_fields JSONB DEFAULT '{}'::jsonb, -- unmapped columns, no data loss
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Disposition Code Master, seeded from Trail_Codes.xlsx (Section 7).
CREATE TABLE IF NOT EXISTS disposition_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES agencies(id),
    action_code TEXT NOT NULL,      -- OC, FV, LG, PIOC, PIFV, OC/FV
    category TEXT,                   -- e.g. PROMISE TO PAY, DISPUTE
    result_code TEXT,                -- e.g. PTP, BP, RTP
    description TEXT,
    remark_template TEXT,
    needs_amount BOOLEAN DEFAULT false,
    needs_date BOOLEAN DEFAULT false,
    needs_time BOOLEAN DEFAULT false,
    needs_mode BOOLEAN DEFAULT false,
    needs_reason BOOLEAN DEFAULT false,
    needs_name_relation BOOLEAN DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    agent_id UUID NOT NULL REFERENCES users(id),
    disposition_code_id UUID REFERENCES disposition_codes(id),
    remark TEXT,
    call_duration_seconds INTEGER, -- optional, per Section 8
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    collected_by_user_id UUID NOT NULL REFERENCES users(id),
    amount NUMERIC NOT NULL,
    mode TEXT,
    photo_proof_url TEXT, -- camera capture or gallery upload
    paid_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Location pings for real-time tracking + route replay (Section 9).
CREATE TABLE IF NOT EXISTS location_pings (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    accuracy_meters NUMERIC
);
CREATE INDEX IF NOT EXISTS idx_location_pings_user_time ON location_pings (user_id, recorded_at);

CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    punch_in_at TIMESTAMPTZ,
    punch_out_at TIMESTAMPTZ,
    punch_in_location GEOGRAPHY(POINT, 4326),
    punch_out_location GEOGRAPHY(POINT, 4326)
);

-- Down Migration
DROP TABLE IF EXISTS attendance;
DROP TABLE IF EXISTS location_pings;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS call_logs;
DROP TABLE IF EXISTS disposition_codes;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS import_templates;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS companies;
DROP TABLE IF EXISTS teams;
DROP TABLE IF EXISTS branches;
DROP TABLE IF EXISTS agencies;

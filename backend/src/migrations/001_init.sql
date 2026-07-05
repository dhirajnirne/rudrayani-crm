-- 001_init.sql
-- Core schema: tenancy, hierarchy/capabilities, companies, disposition master.
-- Run this after the postgres container is up. See SETUP_GUIDE.md.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

CREATE TABLE agencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES agencies(id),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES branches(id),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES agencies(id),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Users with a capability model instead of a fixed role column.
CREATE TABLE users (
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
CREATE TABLE import_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    name TEXT NOT NULL,
    column_mapping JSONB NOT NULL, -- e.g. {"Loan Number": "loan_number", "Due Amt": "due_amount"}
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customers (
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
CREATE TABLE disposition_codes (
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

CREATE TABLE call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    agent_id UUID NOT NULL REFERENCES users(id),
    disposition_code_id UUID REFERENCES disposition_codes(id),
    remark TEXT,
    call_duration_seconds INTEGER, -- optional, per Section 8
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    collected_by_user_id UUID NOT NULL REFERENCES users(id),
    amount NUMERIC NOT NULL,
    mode TEXT,
    photo_proof_url TEXT, -- camera capture or gallery upload
    paid_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Location pings for real-time tracking + route replay (Section 9).
CREATE TABLE location_pings (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    accuracy_meters NUMERIC
);
CREATE INDEX idx_location_pings_user_time ON location_pings (user_id, recorded_at);

CREATE TABLE attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    punch_in_at TIMESTAMPTZ,
    punch_out_at TIMESTAMPTZ,
    punch_in_location GEOGRAPHY(POINT, 4326),
    punch_out_location GEOGRAPHY(POINT, 4326)
);

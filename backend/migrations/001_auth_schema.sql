-- AI Data Guardian 3.0
-- Migration 001: Authentication schema
--
-- IMPORTANT:
-- This migration must be reviewed before execution.
-- Run with an authorized database migration account.
-- Do not run using the application reader account.
--
-- This file contains no passwords or credentials.

BEGIN;

CREATE SCHEMA IF NOT EXISTS guardian_auth;

CREATE TABLE IF NOT EXISTS guardian_auth.guardian_users (
    user_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    username VARCHAR(100) NOT NULL UNIQUE,

    password_hash TEXT NOT NULL,

    role VARCHAR(20) NOT NULL
        CHECK (role IN ('reader', 'operator', 'admin')),

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guardian_auth.guardian_sessions (
    session_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    user_id BIGINT NOT NULL
        REFERENCES guardian_auth.guardian_users(user_id)
        ON DELETE CASCADE,

    session_hash CHAR(64) NOT NULL UNIQUE,

    csrf_hash CHAR(64) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    expires_at TIMESTAMPTZ NOT NULL,

    revoked_at TIMESTAMPTZ,

    CONSTRAINT guardian_session_expiry_check
        CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS
    idx_guardian_sessions_user
ON guardian_auth.guardian_sessions (user_id);

CREATE INDEX IF NOT EXISTS
    idx_guardian_sessions_expiry
ON guardian_auth.guardian_sessions (expires_at);

CREATE INDEX IF NOT EXISTS
    idx_guardian_sessions_active
ON guardian_auth.guardian_sessions (user_id, expires_at)
WHERE revoked_at IS NULL;

COMMIT;

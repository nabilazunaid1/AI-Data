-- AI Data Guardian 3.0
-- Migration 002: Authentication application privileges
--
-- Prerequisites:
-- 1. guardian_auth_app role exists.
-- 2. 001_auth_schema.sql has been applied.
-- 3. Execute using an authorized migration role.
--
-- No passwords or credentials are stored here.

BEGIN;

-- Allow authentication schema access.
GRANT USAGE ON SCHEMA guardian_auth
TO guardian_auth_app;

-- Allow the authentication application to manage
-- its own user and session records.
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE
    guardian_auth.guardian_users,
    guardian_auth.guardian_sessions
TO guardian_auth_app;

-- Allow identity columns to generate IDs.
GRANT USAGE
ON ALL SEQUENCES IN SCHEMA guardian_auth
TO guardian_auth_app;

-- Do not grant CREATE on the authentication schema.
-- Do not grant access to existing public data tables.

COMMIT;

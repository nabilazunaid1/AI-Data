-- AI Data Guardian 3.0
-- Migration 002: Restricted authentication permissions
--
-- Prerequisites:
-- 1. guardian_auth_app role exists.
-- 2. Migration 001 has completed successfully.
-- 3. Execute using an authorized migration account.
--
-- Security design:
-- - Application can read user accounts for authentication.
-- - Application cannot create, update, or delete users.
-- - Application can manage browser sessions.
-- - Account administration requires a separate privileged process.
--
-- No credentials are stored in this migration.

BEGIN;

GRANT USAGE ON SCHEMA guardian_auth
TO guardian_auth_app;

-- Authentication lookup only.
REVOKE INSERT, UPDATE, DELETE
ON TABLE guardian_auth.guardian_users
FROM guardian_auth_app;

GRANT SELECT
ON TABLE guardian_auth.guardian_users
TO guardian_auth_app;

-- Browser session lifecycle.
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE guardian_auth.guardian_sessions
TO guardian_auth_app;

-- Session identity column.
GRANT USAGE
ON SEQUENCE guardian_auth.guardian_sessions_session_id_seq
TO guardian_auth_app;

-- No user-account sequence permission is granted.
-- No schema CREATE permission is granted.
-- No permissions on existing public tables are granted.

COMMIT;

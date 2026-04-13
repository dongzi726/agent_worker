-- ============================================================
-- Migration 001: Iteration 3 — Commercial Infrastructure
-- ============================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) UNIQUE NOT NULL,
    username      VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    status        VARCHAR(20) DEFAULT 'pending',  -- pending/active/banned
    role          VARCHAR(20) DEFAULT 'user',      -- user/admin
    quota_tokens  BIGINT DEFAULT 0,
    used_tokens   BIGINT DEFAULT 0,
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW()
);

-- API Keys table (user-facing API keys)
CREATE TABLE IF NOT EXISTS api_keys (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
    key_hash      VARCHAR(128) UNIQUE NOT NULL,    -- SHA-256 hash
    key_prefix    VARCHAR(20) NOT NULL,            -- First 16 chars for display
    label         VARCHAR(100),
    status        VARCHAR(20) DEFAULT 'pending',   -- pending/active/disabled/expired
    quota_tokens  BIGINT DEFAULT 0,
    used_tokens   BIGINT DEFAULT 0,
    expires_at    TIMESTAMP,
    last_used_at  TIMESTAMP,
    approved_by   INTEGER REFERENCES users(id),
    approved_at   TIMESTAMP,
    reject_reason TEXT,
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW()
);

-- API call logs
CREATE TABLE IF NOT EXISTS api_calls (
    id                BIGSERIAL PRIMARY KEY,
    api_key_id        INTEGER REFERENCES api_keys(id) ON DELETE SET NULL,
    user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
    model_id          VARCHAR(100),
    vendor_id         VARCHAR(100),
    key_used          VARCHAR(100),
    prompt_tokens     INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens      INTEGER DEFAULT 0,
    status            VARCHAR(20),                   -- success/error/timeout
    latency_ms        INTEGER,
    error_code        VARCHAR(50),
    error_message     TEXT,
    created_at        TIMESTAMP DEFAULT NOW()
);

-- Refresh tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(128) UNIQUE NOT NULL,
    expires_at  TIMESTAMP NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action      VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),
    target_id   INTEGER,
    detail      JSONB,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_api_calls_user_time ON api_calls(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_calls_key_time ON api_calls(api_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_calls_time ON api_calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_calls_model_time ON api_calls(model_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);
CREATE INDEX IF NOT EXISTS idx_api_calls_user_status_time ON api_calls(user_id, status, created_at DESC);

-- ============================================================
-- Create default admin user (password: Admin@123456, should be changed on first login)
-- ============================================================
-- Inserted via seed script, not here for security

-- ============================================================
-- Trigger to auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_keys_updated_at
    BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

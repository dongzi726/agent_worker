-- ============================================================
-- Migration 001: Initial schema for iteration 3 (commercialization)
-- Tables: users, api_keys, api_calls, refresh_tokens, audit_logs
-- ============================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    username        VARCHAR(50)  NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(20)  NOT NULL DEFAULT 'user',       -- 'user' | 'admin'
    status          VARCHAR(20)  NOT NULL DEFAULT 'pending',     -- 'pending' | 'active' | 'banned'
    quota_tokens    BIGINT       NOT NULL DEFAULT 0,
    used_tokens     BIGINT       NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- API Keys table (user-created keys for accessing the chat API)
CREATE TABLE IF NOT EXISTS api_keys (
    key_id          VARCHAR(64)  PRIMARY KEY,
    user_id         INT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash        VARCHAR(64)  NOT NULL UNIQUE,               -- SHA-256 hash of the full key value
    key_prefix      VARCHAR(20)  NOT NULL,                      -- First 16 chars for display
    label           VARCHAR(100) NOT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'pending',    -- 'pending' | 'active' | 'disabled' | 'expired'
    quota_tokens    BIGINT       NOT NULL DEFAULT 0,
    used_tokens     BIGINT       NOT NULL DEFAULT 0,
    expires_at      TIMESTAMPTZ  DEFAULT NULL,
    last_used_at    TIMESTAMPTZ  DEFAULT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);

-- API Calls table (usage tracking)
CREATE TABLE IF NOT EXISTS api_calls (
    id              BIGSERIAL    PRIMARY KEY,
    key_id          VARCHAR(64)  NOT NULL REFERENCES api_keys(key_id) ON DELETE CASCADE,
    user_id         INT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    model_id        VARCHAR(100) NOT NULL,
    vendor_id       VARCHAR(50)  NOT NULL,
    prompt_tokens   INT          NOT NULL DEFAULT 0,
    completion_tokens INT        NOT NULL DEFAULT 0,
    total_tokens    INT          NOT NULL DEFAULT 0,
    status_code     INT          NOT NULL DEFAULT 200,
    latency_ms      INT          NOT NULL DEFAULT 0,
    error_message   TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_calls_key_id ON api_calls(key_id);
CREATE INDEX IF NOT EXISTS idx_api_calls_user_id ON api_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_api_calls_created_at ON api_calls(created_at);
CREATE INDEX IF NOT EXISTS idx_api_calls_model_id ON api_calls(model_id);

-- Refresh Tokens table
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id              SERIAL       PRIMARY KEY,
    user_id         INT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(64)  NOT NULL UNIQUE,               -- SHA-256 hash of the refresh token
    expires_at      TIMESTAMPTZ  NOT NULL,
    revoked         BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- Audit Logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id              BIGSERIAL    PRIMARY KEY,
    user_id         INT          REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(100) NOT NULL,
    resource_type   VARCHAR(50),
    resource_id     VARCHAR(100),
    detail          JSONB,
    ip_address      VARCHAR(45),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

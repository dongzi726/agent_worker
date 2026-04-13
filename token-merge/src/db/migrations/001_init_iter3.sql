-- ============================================================
-- Migration 001: Iteration 3 schema — users, user_api_keys, usage_logs
-- ============================================================

-- users
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) NOT NULL,
  username      VARCHAR(30)  NOT NULL,
  password_hash TEXT         NOT NULL,
  role          VARCHAR(16)  NOT NULL DEFAULT 'user',
  status        VARCHAR(16)  NOT NULL DEFAULT 'pending',
  quota_tokens  BIGINT       NOT NULL DEFAULT 0,
  used_tokens   BIGINT       NOT NULL DEFAULT 0,
  last_login_at TIMESTAMP,
  created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq     ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_uq   ON users(username);
CREATE         INDEX IF NOT EXISTS users_status_idx   ON users(status);

-- user_api_keys
CREATE TABLE IF NOT EXISTS user_api_keys (
  id              SERIAL PRIMARY KEY,
  key_id          UUID         NOT NULL DEFAULT gen_random_uuid(),
  user_id         INTEGER      NOT NULL REFERENCES users(id),
  key_hash        VARCHAR(64)  NOT NULL,
  key_prefix      VARCHAR(16)  NOT NULL,
  label           VARCHAR(50)  NOT NULL,
  status          VARCHAR(16)  NOT NULL DEFAULT 'pending',
  quota_tokens    BIGINT       NOT NULL DEFAULT 0,
  used_tokens     BIGINT       NOT NULL DEFAULT 0,
  expires_at      TIMESTAMP,
  last_used_at    TIMESTAMP,
  regenerated_at  TIMESTAMP,
  created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uak_key_id_uq    ON user_api_keys(key_id);
CREATE UNIQUE INDEX IF NOT EXISTS uak_key_hash_uq  ON user_api_keys(key_hash);
CREATE         INDEX IF NOT EXISTS uak_user_id_idx ON user_api_keys(user_id);
CREATE         INDEX IF NOT EXISTS uak_status_idx  ON user_api_keys(status);

-- usage_logs
CREATE TABLE IF NOT EXISTS usage_logs (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER      NOT NULL REFERENCES users(id),
  key_id            UUID,
  model_id          VARCHAR(64)  NOT NULL,
  status_code       SMALLINT     NOT NULL,
  prompt_tokens     INTEGER      NOT NULL DEFAULT 0,
  completion_tokens INTEGER      NOT NULL DEFAULT 0,
  total_tokens      INTEGER      NOT NULL DEFAULT 0,
  latency_ms        INTEGER      NOT NULL DEFAULT 0,
  error_message     TEXT,
  created_at        TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ul_user_id_idx       ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS ul_key_id_idx        ON usage_logs(key_id);
CREATE INDEX IF NOT EXISTS ul_model_id_idx      ON usage_logs(model_id);
CREATE INDEX IF NOT EXISTS ul_created_at_idx    ON usage_logs(created_at);
CREATE INDEX IF NOT EXISTS ul_user_created_idx  ON usage_logs(user_id, created_at);

-- refresh_tokens (required by auth routes)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash      VARCHAR(64)  NOT NULL,
  expires_at      TIMESTAMP    NOT NULL,
  revoked         BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rt_user_id_idx    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS rt_token_hash_idx ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS rt_expires_idx    ON refresh_tokens(expires_at);

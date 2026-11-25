CREATE TABLE IF NOT EXISTS telegram_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dedup_key TEXT NOT NULL UNIQUE,
  chat_id TEXT NOT NULL,
  text TEXT NOT NULL,
  reply_markup JSONB,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  message_id BIGINT,
  last_error TEXT,
  created_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE INDEX IF NOT EXISTS telegram_outbox_pending ON telegram_outbox(next_attempt_at) WHERE status='pending';
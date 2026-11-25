-- 0008_fix_missing_columns.sql
-- Adds columns that the application code expects but the initial schema missed.
-- Run AFTER 0001_init.sql through 0007_fix_wallets_unique.sql

-- wallet_addresses needs 'kind' column (deposit/withdraw)
ALTER TABLE wallet_addresses ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'deposit';
ALTER TABLE wallet_addresses ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- open_positions needs user_id for per-user position queries
ALTER TABLE open_positions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- closed_positions needs user_id for per-user closed position queries
ALTER TABLE closed_positions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- wallet_transactions needs user_id (code queries by it)
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- notifications needs user_id (code queries by it)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- vip_contracts needs user_id (code queries by it)
ALTER TABLE vip_contracts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Fundamental news used by the dashboard and admin panel.
CREATE TABLE IF NOT EXISTS fundamental_news (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title_fa TEXT NOT NULL DEFAULT '',
    title_en TEXT NOT NULL DEFAULT '',
    summary_fa TEXT NOT NULL DEFAULT '',
    summary_en TEXT NOT NULL DEFAULT '',
    sentiment TEXT NOT NULL DEFAULT 'neutral',
    impact TEXT NOT NULL DEFAULT 'medium',
    category TEXT NOT NULL DEFAULT 'macro',
    symbol TEXT,
    source TEXT NOT NULL DEFAULT 'admin',
    image_url TEXT,
    sent_tg_fa_at BIGINT,
    sent_tg_en_at BIGINT,
    created_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE INDEX IF NOT EXISTS idx_fundamental_news_time ON fundamental_news(created_at DESC);

-- Add missing indexes
CREATE INDEX IF NOT EXISTS idx_wallet_addresses_user_id ON wallet_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_addresses_kind ON wallet_addresses(kind);
CREATE INDEX IF NOT EXISTS idx_open_positions_user_id ON open_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_closed_positions_user_id ON closed_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_vip_contracts_user_id ON vip_contracts(user_id);

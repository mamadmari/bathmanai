-- Trading Wolf AI -- Add missing tables for production fixes
-- Idempotent: safe to run on existing database

CREATE TABLE IF NOT EXISTS market_news (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title_fa TEXT NOT NULL DEFAULT '',
    title_en TEXT NOT NULL DEFAULT '',
    summary_fa TEXT,
    summary_en TEXT,
    content_fa TEXT,
    content_en TEXT,
    source TEXT DEFAULT 'admin',
    category TEXT DEFAULT 'general',
    severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    pinned BOOLEAN NOT NULL DEFAULT false,
    published BOOLEAN NOT NULL DEFAULT false,
    image TEXT,
    created_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE INDEX IF NOT EXISTS idx_market_news_published ON market_news (published, created_at DESC);

-- Fix wallets table - add frozen column if missing
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS frozen NUMERIC(24,8) NOT NULL DEFAULT 0;

-- Fix wallet_addresses - add kind column if missing
ALTER TABLE wallet_addresses ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'deposit';

-- Fix user admin stats: add last_login and total stats columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_deposits NUMERIC(24,8) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_withdrawals NUMERIC(24,8) NOT NULL DEFAULT 0;

-- Fix swapwallet table
CREATE TABLE IF NOT EXISTS swapwallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    amount NUMERIC(24,8) NOT NULL,
    fee NUMERIC(24,8) NOT NULL DEFAULT 0,
    from_asset TEXT,
    to_asset TEXT,
    rate NUMERIC(24,8),
    tx_hash TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);

-- Add USDT price tracking if not exists
CREATE TABLE IF NOT EXISTS price_feeds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol TEXT NOT NULL UNIQUE,
    price NUMERIC(24,8) NOT NULL,
    source TEXT DEFAULT 'coingecko',
    updated_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);

-- Add vip_reset_history table for reset performance
CREATE TABLE IF NOT EXISTS vip_reset_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    details TEXT,
    created_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);

-- Enable forex on existing data
UPDATE markets SET enabled = true WHERE market = 'forex';


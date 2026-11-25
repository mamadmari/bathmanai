-- Auditable allocation of frozen user capital to engine positions.
-- Existing positions are intentionally left untouched.
CREATE TABLE IF NOT EXISTS position_capital_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    position_id UUID NOT NULL REFERENCES open_positions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    principal NUMERIC(24,8) NOT NULL CHECK (principal >= 0),
    share_pct NUMERIC(12,8) NOT NULL CHECK (share_pct >= 0),
    platform_fee_pct NUMERIC(8,4) NOT NULL DEFAULT 0 CHECK (platform_fee_pct >= 0 AND platform_fee_pct <= 100),
    gross_pnl NUMERIC(24,8),
    platform_fee NUMERIC(24,8),
    net_pnl NUMERIC(24,8),
    created_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
    settled_at BIGINT,
    UNIQUE(position_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_position_capital_allocations_position
  ON position_capital_allocations(position_id);
CREATE INDEX IF NOT EXISTS idx_position_capital_allocations_user
  ON position_capital_allocations(user_id, created_at DESC);

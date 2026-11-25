-- 0002_real_costs.sql — every closed trade keeps the gross result next to the net one.
-- `pnl` / `profit` are NET (fees + position fee + renewal + pool share removed),
-- `fee` holds the total cost and `gross_pnl` the number before costs.
ALTER TABLE closed_positions ADD COLUMN IF NOT EXISTS gross_pnl numeric;
CREATE INDEX IF NOT EXISTS closed_positions_close_time_idx ON closed_positions (close_time DESC);

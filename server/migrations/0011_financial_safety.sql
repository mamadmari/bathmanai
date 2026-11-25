-- Apply only after a verified backup and a staging migration dry-run.
-- Old rows with a negative balance remain visible for reconciliation; new
-- updates must obey the non-negative balance/frozen invariants.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallets_balance_nonnegative') THEN
    ALTER TABLE wallets ADD CONSTRAINT wallets_balance_nonnegative CHECK (balance >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallets_frozen_nonnegative') THEN
    ALTER TABLE wallets ADD CONSTRAINT wallets_frozen_nonnegative CHECK (frozen >= 0) NOT VALID;
  END IF;
END $$;

ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS withdraw_tg_verified_at BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE position_capital_allocations
  ADD COLUMN IF NOT EXISTS platform_deficit NUMERIC(24,8) NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS wallet_withdrawal_idempotency
  ON wallet_transactions (user_id, idempotency_key)
  WHERE type = 'withdrawal' AND idempotency_key IS NOT NULL;

-- Positions are removed from open_positions on close. Their allocation record
-- is financial evidence and must survive the deletion of the open row.
ALTER TABLE position_capital_allocations
  DROP CONSTRAINT IF EXISTS position_capital_allocations_position_id_fkey;

-- No accidental cascade deletion of financial evidence through wallet/user.
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_wallet_id_fkey;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_wallet_id_fkey
  FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_user_id_fkey;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE position_capital_allocations DROP CONSTRAINT IF EXISTS position_capital_allocations_user_id_fkey;
ALTER TABLE position_capital_allocations ADD CONSTRAINT position_capital_allocations_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT NOT VALID;

CREATE OR REPLACE FUNCTION deny_wallet_transaction_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'wallet_transactions are append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS wallet_transactions_prevent_delete ON wallet_transactions;
CREATE TRIGGER wallet_transactions_prevent_delete
  BEFORE DELETE ON wallet_transactions FOR EACH ROW EXECUTE FUNCTION deny_wallet_transaction_delete();

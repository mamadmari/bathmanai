-- Merge duplicate user wallets without deleting their transaction history.
-- Designed to run after 0003, which creates wallets.frozen.
BEGIN;

ALTER TABLE wallets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TEMP TABLE wallet_merge_map ON COMMIT DROP AS
SELECT id AS old_id,
       FIRST_VALUE(id) OVER (
         PARTITION BY user_id, asset, COALESCE(network, 'mainnet')
         ORDER BY created_at, id
       ) AS kept_id
FROM wallets
WHERE user_id IS NOT NULL;
DELETE FROM wallet_merge_map WHERE old_id = kept_id;

WITH totals AS (
  SELECT kept_id, SUM(w.balance) AS balance, SUM(w.frozen) AS frozen,
         MIN(w.frozen_since) AS frozen_since
  FROM (
    SELECT old_id AS id, kept_id FROM wallet_merge_map
    UNION ALL
    SELECT kept_id, kept_id FROM wallet_merge_map GROUP BY kept_id
  ) members
  JOIN wallets w ON w.id = members.id
  GROUP BY kept_id
)
UPDATE wallets w SET balance = totals.balance, frozen = totals.frozen,
  frozen_since = totals.frozen_since, updated_at = NOW()
FROM totals WHERE w.id = totals.kept_id;

UPDATE wallet_transactions t SET wallet_id = m.kept_id
FROM wallet_merge_map m WHERE t.wallet_id = m.old_id;

DELETE FROM wallets w USING wallet_merge_map m WHERE w.id = m.old_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_unique_user_asset_network
    ON wallets (user_id, asset, COALESCE(network, 'mainnet'));

COMMIT;

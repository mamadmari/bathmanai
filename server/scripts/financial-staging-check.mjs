import pg from "pg";

const database = process.env.FINANCIAL_STAGING_DB;
if (!/^wolf_release_staging_[0-9]{8}$/.test(database ?? "")) {
  throw new Error("Refusing to run outside an isolated release staging database");
}

const pool = new pg.Pool({
  host: "/var/run/postgresql", user: "postgres", database, max: 25,
});
const amount = "3.00000000";
const runId = `${Date.now()}${Math.floor(Math.random() * 1000000)}`;

try {
  const user = (await pool.query(
    "INSERT INTO users (username) VALUES ($1) RETURNING id",
    [`staging-finance-${runId}`]
  )).rows[0];
  const wallet = (await pool.query(
    `INSERT INTO wallets (user_id, owner, asset, network, balance)
     VALUES ($1, $2, 'USDT', 'TRC20', 100) RETURNING id`, [user.id, user.id]
  )).rows[0];

  async function request(index) {
    const key = `staging-withdrawal-${runId}-${index}`;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM wallets WHERE id = $1 FOR UPDATE", [wallet.id]);
      const previous = await client.query(
        "SELECT id FROM wallet_transactions WHERE user_id = $1 AND idempotency_key = $2", [user.id, key]
      );
      if (previous.rowCount) {
        await client.query("COMMIT");
        return "replayed";
      }
      const debited = await client.query(
        `UPDATE wallets SET balance = balance - $1::numeric
         WHERE id = $2 AND balance >= $1::numeric RETURNING id`, [amount, wallet.id]
      );
      if (!debited.rowCount) {
        await client.query("ROLLBACK");
        return "rejected";
      }
      await client.query(
        `INSERT INTO wallet_transactions (wallet_id, user_id, type, asset, amount, network, status, note, idempotency_key)
         VALUES ($1, $2, 'withdrawal', 'USDT', -$3::numeric, 'TRC20', 'pending', 'staging', $4)`,
        [wallet.id, user.id, amount, key]
      );
      await client.query("COMMIT");
      return "accepted";
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  const results = await Promise.all(Array.from({ length: 100 }, (_, i) => request(i)));
  const replay = await request(0);
  const snapshot = (await pool.query(
    `SELECT w.balance::text, (SELECT count(*)::int FROM wallet_transactions
       WHERE wallet_id = w.id AND type = 'withdrawal') AS ledger_count,
       (SELECT COALESCE(SUM(amount),0)::text FROM wallet_transactions
       WHERE wallet_id = w.id AND type = 'withdrawal') AS ledger_total
     FROM wallets w WHERE w.id = $1`, [wallet.id]
  )).rows[0];
  const accepted = results.filter((r) => r === "accepted").length;
  const rejected = results.filter((r) => r === "rejected").length;
  if (accepted !== 33 || rejected !== 67 || replay !== "replayed" ||
      Number(snapshot.balance) !== 1 || snapshot.ledger_count !== 33 || Number(snapshot.ledger_total) !== -99) {
    throw new Error(`Financial concurrency mismatch: ${JSON.stringify({ accepted, rejected, replay, snapshot })}`);
  }
  console.log(JSON.stringify({ ok: true, accepted, rejected, replay, balance: snapshot.balance,
    ledgerCount: snapshot.ledger_count, ledgerTotal: snapshot.ledger_total }));
} finally {
  await pool.end();
}

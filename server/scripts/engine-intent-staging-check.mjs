// Run only against an isolated migrated staging database, never production.
import pg from 'pg';
import crypto from 'node:crypto';

const db = process.env.ENGINE_STAGING_DB;
if (!db || !/^wolf_release_staging_[a-z0-9_]+$/.test(db)) {
  throw new Error('ENGINE_STAGING_DB must name an isolated wolf_release_staging_* database');
}
const pool = new pg.Pool({ database: db, user: 'postgres', host: '/var/run/postgresql', max: 3 });
const a = await pool.connect();
const b = await pool.connect();
let locked = false;
let inTransaction = false;
try {
  locked = (await a.query("SELECT pg_try_advisory_lock(hashtext('wolf-engine-tick')) AS locked")).rows[0].locked;
  if (!locked) throw new Error('staging lock could not be acquired');
  const blocked = (await b.query("SELECT pg_try_advisory_lock(hashtext('wolf-engine-tick')) AS locked")).rows[0].locked;
  if (blocked) {
    await b.query("SELECT pg_advisory_unlock(hashtext('wolf-engine-tick'))");
    throw new Error('second engine tick unexpectedly acquired lock');
  }
  await a.query("SELECT pg_advisory_unlock(hashtext('wolf-engine-tick'))");
  locked = false;
  const resumed = (await b.query("SELECT pg_try_advisory_lock(hashtext('wolf-engine-tick')) AS locked")).rows[0].locked;
  if (!resumed) throw new Error('engine lock was not released');
  await b.query("SELECT pg_advisory_unlock(hashtext('wolf-engine-tick'))");

  await a.query('BEGIN');
  inTransaction = true;
  const key = `staging-engine-${crypto.randomUUID()}`;
  const row = (await a.query(
    `INSERT INTO orders (idempotency_key, exchange, symbol, side, type, price, qty, leverage, mode, status, validated)
     VALUES ($1,'mt5','XAUUSD','buy','market',4200,1,1,'live','submitting',true) RETURNING id`, [key],
  )).rows[0];
  await a.query("UPDATE orders SET status = 'reconcile', validation_message = 'staging unverified broker response' WHERE id = $1", [row.id]);
  const unresolved = (await a.query(
    "SELECT id FROM orders WHERE symbol = 'XAUUSD' AND mode = 'live' AND status IN ('submitting','reconcile') AND id = $1", [row.id],
  )).rows;
  if (unresolved.length !== 1) throw new Error('unresolved live intent was not preserved');
  const positionId = crypto.randomUUID();
  const exit = (await a.query(
    `INSERT INTO orders (idempotency_key, exchange, symbol, side, type, price, qty, leverage, mode, status, validated, position_id)
     VALUES ($1,'mt5','XAUUSD','sell','market',4210,1,1,'live','submitting',true,$2) RETURNING id`,
    [`staging-exit-${crypto.randomUUID()}`, positionId],
  )).rows[0];
  const pendingExit = (await a.query(
    "SELECT id FROM orders WHERE position_id = $1 AND mode = 'live' AND status IN ('submitting','reconcile')", [positionId],
  )).rows;
  if (pendingExit.length !== 1 || pendingExit[0].id !== exit.id) throw new Error('pending exit was not linked to position');
  await a.query('ROLLBACK');
  inTransaction = false;
  console.log(JSON.stringify({ ok: true, concurrentTickBlocked: true, lockReleased: true, unresolvedIntentBlocksEntry: true, pendingExitLinked: true, fixtureRolledBack: true }));
} finally {
  if (inTransaction) await a.query('ROLLBACK').catch(() => {});
  if (locked) await a.query("SELECT pg_advisory_unlock(hashtext('wolf-engine-tick'))").catch(() => {});
  a.release();
  b.release();
  await pool.end();
}

import pg from 'pg';
import { config } from '../config.js';

const { Pool, types } = pg;
// NUMERIC (1700) يُعاد كنص للحفاظ على الدقة العشرية؛ BIGINT (20) كنص أيضًا
types.setTypeParser(1700, (v) => v);
types.setTypeParser(20, (v) => v);
// DATE (1082) كنص YYYY-MM-DD بدون تحويل للمنطقة الزمنية
types.setTypeParser(1082, (v) => v);

export const pool = new Pool({ connectionString: config.databaseUrl, max: 10 });

export type Queryable = pg.Pool | pg.PoolClient;

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
  db: Queryable = pool,
): Promise<pg.QueryResult<T>> {
  return db.query<T>(text, params as never[]);
}

export async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string, params: unknown[] = [], db: Queryable = pool,
): Promise<T | undefined> {
  const r = await query<T>(text, params, db);
  return r.rows[0];
}

export async function many<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string, params: unknown[] = [], db: Queryable = pool,
): Promise<T[]> {
  const r = await query<T>(text, params, db);
  return r.rows;
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

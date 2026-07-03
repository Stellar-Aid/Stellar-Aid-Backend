/**
 * Knex connection singleton backed by better-sqlite3.
 *
 * i128 on-chain amounts are stored as TEXT to preserve full precision — never
 * as JS numbers/floats. See migrations for the schema.
 */
import knex, { Knex } from 'knex';

const DB_FILE = process.env.DB_FILE ?? './stellaraid.db';

export const knexConfig: Knex.Config = {
  client: 'better-sqlite3',
  connection: {
    filename: DB_FILE,
  },
  // better-sqlite3 does not support inserting `undefined`; nulls must be explicit.
  useNullAsDefault: true,
  pool: {
    // Enforce foreign keys on every connection.
    afterCreate: (conn: { pragma?: (s: string) => void }, done: (err?: Error) => void) => {
      try {
        conn.pragma?.('foreign_keys = ON');
        done();
      } catch (err) {
        done(err as Error);
      }
    },
  },
};

/** Shared singleton knex instance for the whole process. */
export const db: Knex = knex(knexConfig);

/** Gracefully close the DB pool (used in tests / shutdown). */
export async function closeDb(): Promise<void> {
  await db.destroy();
}

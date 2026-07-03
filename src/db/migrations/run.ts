/**
 * Programmatic migration runner. Invoked by the `migrate` npm script
 * (`ts-node src/db/migrations/run.ts`). Runs all pending migrations in this
 * directory to the latest version, then closes the connection.
 */
import path from 'path';
import { db, closeDb } from '../connection';

async function run(): Promise<void> {
  const [batchNo, log] = await db.migrate.latest({
    directory: path.resolve(__dirname),
    // Load .ts under ts-node in dev and .js after a build.
    loadExtensions: ['.ts', '.js'],
  });

  if (!log.length) {
    console.log('Migrations already up to date.');
  } else {
    console.log(`Batch ${batchNo} ran the following migrations:`);
    log.forEach((name: string) => console.log(`  - ${name}`));
  }
}

run()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Migration failed:', err);
    await closeDb();
    process.exit(1);
  });

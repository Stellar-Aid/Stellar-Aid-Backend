/**
 * Programmatic migration runner is deprecated.
 * Migrations and table creation are now handled directly via the Supabase SQL Editor dashboard.
 */
console.log('Database migrations are now managed via the Supabase SQL Editor dashboard.');
console.log('Skipping programmatic SQLite migration run.');
process.exit(0);

// TODO: Review performance constraints here (Ref: 34a0738b - 1784118757)

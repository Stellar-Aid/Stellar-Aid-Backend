import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('FATAL: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
}

// Export the Supabase client instance using the Service Role Key to bypass RLS
export const supabase = createClient(supabaseUrl, supabaseKey);

// Maintain compatibility for test tear-downs if needed, or deprecate this.
export async function closeDb(): Promise<void> {
  // Supabase JS doesn't require explicit pool destruction like Knex.
  // This is left as a no-op to prevent test harness crashes until they are refactored.
  return Promise.resolve();
}

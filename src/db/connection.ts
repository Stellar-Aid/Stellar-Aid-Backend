import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('FATAL: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
}

// Export the Supabase client instance
export const supabase = createClient(supabaseUrl, supabaseKey);
// TODO: Review performance constraints here (Ref: de2fd609 - 1784118726)

import 'dotenv/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Test database connection
async function testConnection(): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .limit(1);

    if (error) {
      throw error;
    }

    return { success: true, message: 'Database connection successful' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export {
  supabase,
  testConnection
};

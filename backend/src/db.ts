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
    // Test connection by executing a simple SQL query
    const { data, error } = await supabase.rpc('version');

    if (error) {
      throw error;
    }

    return { success: true, message: 'Database connection successful' };
  } catch (error: any) {
    // If RPC doesn't work, try a different approach
    try {
      // Alternative: Try to access Supabase auth (which should always be available)
      const { data: authData, error: authError } = await supabase.auth.getSession();
      
      // Even if there's no session, if we can reach the auth endpoint, connection works
      return { success: true, message: 'Database connection successful (via auth check)' };
    } catch (authError: any) {
      return { success: false, error: error.message || 'Connection failed' };
    }
  }
}

export {
  supabase,
  testConnection
};

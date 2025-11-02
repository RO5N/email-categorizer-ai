import { supabase } from '../src/db';

async function checkTables() {
  console.log('🔍 Checking if required tables exist...');
  
  try {
    // Check if users table exists
    const { data: usersData, error: usersError } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    if (usersError) {
      console.log('❌ Users table:', usersError.message);
    } else {
      console.log('✅ Users table exists');
    }

    // Check if emails table exists
    const { data: emailsData, error: emailsError } = await supabase
      .from('emails')
      .select('count')
      .limit(1);
    
    if (emailsError) {
      console.log('❌ Emails table:', emailsError.message);
    } else {
      console.log('✅ Emails table exists');
    }

    // Check if gmail_accounts table exists
    const { data: gmailData, error: gmailError } = await supabase
      .from('gmail_accounts')
      .select('count')
      .limit(1);
    
    if (gmailError) {
      console.log('❌ Gmail accounts table:', gmailError.message);
    } else {
      console.log('✅ Gmail accounts table exists');
    }

    // List all tables
    console.log('\n📋 Attempting to list all tables...');
    const { data: tablesData, error: tablesError } = await supabase
      .rpc('get_tables');
    
    if (tablesError) {
      console.log('❌ Could not list tables:', tablesError.message);
    } else {
      console.log('📋 Available tables:', tablesData);
    }

  } catch (error) {
    console.error('💥 Error checking tables:', error);
  }
}

checkTables();

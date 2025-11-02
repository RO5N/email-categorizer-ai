import { supabase } from '../src/db';

async function checkEmailsSchema() {
  console.log('🔍 Checking emails table schema...');
  
  try {
    // Try to insert a test record to see what columns are expected
    const testEmail = {
      user_id: '00000000-0000-0000-0000-000000000000', // Fake UUID for testing
      gmail_message_id: 'test-message-id',
      gmail_thread_id: 'test-thread-id',
      subject: 'Test Subject',
      sender_email: 'test@example.com',
      recipient_email: 'user@example.com',
      body_text: 'Test body',
      received_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('emails')
      .insert(testEmail)
      .select();

    if (error) {
      console.log('❌ Insert test failed:', error.message);
      console.log('Error details:', error);
      
      // Check what columns actually exist by trying a simple select
      console.log('\n🔍 Checking existing columns...');
      const { data: existingData, error: selectError } = await supabase
        .from('emails')
        .select('*')
        .limit(1);
      
      if (selectError) {
        console.log('❌ Select failed:', selectError.message);
      } else {
        console.log('✅ Select successful, sample data structure:', existingData);
      }
    } else {
      console.log('✅ Test insert successful:', data);
      
      // Clean up test record
      await supabase
        .from('emails')
        .delete()
        .eq('gmail_message_id', 'test-message-id');
      console.log('🧹 Cleaned up test record');
    }

  } catch (error) {
    console.error('💥 Error checking schema:', error);
  }
}

checkEmailsSchema();

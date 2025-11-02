import { EmailDbService } from '../src/services/emailDbService';

async function testEmailInsert() {
  console.log('🧪 Testing email insertion...');
  
  const emailDbService = new EmailDbService();
  
  // Test data
  const userId = '00000000-0000-0000-0000-000000000000'; // This will fail, but let's see the error
  const emailData = {
    gmail_message_id: 'test-message-123',
    gmail_thread_id: 'test-thread-123',
    subject: 'Test Email Subject',
    sender_email: 'sender@example.com',
    sender_name: 'Test Sender',
    recipient_email: 'recipient@example.com',
    body_text: 'This is a test email body',
    body_html: '<p>This is a test email body</p>',
    has_attachments: false,
    labels: ['INBOX', 'UNREAD'],
    is_read: false,
    received_at: new Date().toISOString()
  };

  try {
    console.log('Attempting to insert email...');
    const result = await emailDbService.insertEmail(userId, emailData);
    console.log('✅ Insert result:', result);
  } catch (error) {
    console.error('❌ Insert failed:', error);
    
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
  }
}

testEmailInsert();

import { testConnection } from '../src/db';

async function runConnectionTest(): Promise<void> {
  console.log('🧪 Testing database connection...');
  
  // Check environment variables
  console.log('\n📋 Environment Check:');
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Set' : '❌ Missing');
  console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing');
  
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('\n❌ Missing required environment variables');
    console.log('Please check your .env file');
    process.exit(1);
  }
  
  // Test connection
  console.log('\n🔌 Testing connection...');
  const result = await testConnection();
  
  if (result.success) {
    console.log('✅ Database connection successful!');
    console.log('📝 Message:', result.message);
    process.exit(0);
  } else {
    console.log('❌ Database connection failed!');
    console.log('📝 Error:', result.error);
    process.exit(1);
  }
}

// Run the test
runConnectionTest().catch((error: Error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
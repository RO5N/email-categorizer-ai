"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("../src/db");
async function runConnectionTest() {
    console.log('🧪 Testing database connection...');
    console.log('\n📋 Environment Check:');
    console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Set' : '❌ Missing');
    console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing');
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.log('\n❌ Missing required environment variables');
        console.log('Please check your .env file');
        process.exit(1);
    }
    console.log('\n🔌 Testing connection...');
    const result = await (0, db_1.testConnection)();
    if (result.success) {
        console.log('✅ Database connection successful!');
        console.log('📝 Message:', result.message);
        process.exit(0);
    }
    else {
        console.log('❌ Database connection failed!');
        console.log('📝 Error:', result.error);
        process.exit(1);
    }
}
runConnectionTest().catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
});
//# sourceMappingURL=db-connection.test.js.map
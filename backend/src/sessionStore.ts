/**
 * PostgreSQL Session Store for express-session
 * Uses Supabase PostgreSQL database via connect-pg-simple
 */

import session from 'express-session';
import ConnectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';

// Supabase provides a direct PostgreSQL connection string
// Get it from: Supabase Dashboard > Project Settings > Database > Connection String > URI
// Format: postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
// Or use the connection pooler URL from your Supabase dashboard

// Support both DATABASE_URL (common) and SUPABASE_DB_CONNECTION_STRING
const supabaseDbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_CONNECTION_STRING;

if (!supabaseDbUrl) {
  const errorMessage = `
❌ Database connection string is required for session store.

Please set either DATABASE_URL or SUPABASE_DB_CONNECTION_STRING in your .env file.

To get your connection string:
1. Go to Supabase Dashboard: https://app.supabase.com
2. Select your project
3. Go to: Project Settings > Database
4. Scroll to "Connection string" section
5. Select "URI" tab
6. Copy the connection string (starts with postgresql://)
7. Add it to your .env file as: DATABASE_URL=postgresql://...

Example format:
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
`;
  console.error(errorMessage);
  throw new Error('DATABASE_URL or SUPABASE_DB_CONNECTION_STRING environment variable is required. See error above for setup instructions.');
}

// Create PostgreSQL connection pool for session store
const pool = new Pool({
  connectionString: supabaseDbUrl,
  // Connection pool settings
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: {
    rejectUnauthorized: false // Supabase requires SSL
  }
});

// Initialize connect-pg-simple
const PgSession = ConnectPgSimple(session);

// Create and configure session store
const sessionStore = new PgSession({
  pool: pool,
  tableName: 'session', // Table name in database
  createTableIfMissing: true, // Auto-create table if it doesn't exist
});

export default sessionStore;


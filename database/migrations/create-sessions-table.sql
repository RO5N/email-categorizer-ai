-- Sessions table for express-session with connect-pg-simple
-- This table stores user sessions in PostgreSQL instead of memory

CREATE TABLE IF NOT EXISTS "session" (
  "sid" VARCHAR NOT NULL COLLATE "default",
  "sess" JSON NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
) WITH (OIDS=FALSE);

-- Index for faster expiration lookups
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- Grant necessary permissions (adjust based on your Supabase setup)
-- Note: Supabase uses service role for backend access, so this may not be needed
-- But included for completeness

COMMENT ON TABLE "session" IS 'Stores express-session data for user authentication';


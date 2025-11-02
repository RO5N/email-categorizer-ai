-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    google_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    picture TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Gmail accounts table (for multiple account support)
CREATE TABLE gmail_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    is_primary BOOLEAN DEFAULT FALSE,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, email)
);

-- Categories table
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    color VARCHAR(7) DEFAULT '#3B82F6', -- Hex color code
    is_active BOOLEAN DEFAULT TRUE,
    email_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, name)
);

-- Emails table
CREATE TABLE emails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gmail_account_id UUID NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    gmail_message_id VARCHAR(255) NOT NULL,
    gmail_thread_id VARCHAR(255),
    subject TEXT NOT NULL,
    sender_email VARCHAR(255) NOT NULL,
    sender_name VARCHAR(255),
    recipient_email VARCHAR(255) NOT NULL,
    body_text TEXT,
    body_html TEXT,
    ai_summary TEXT,
    ai_category_confidence DECIMAL(3,2), -- 0.00 to 1.00
    has_unsubscribe_link BOOLEAN DEFAULT FALSE,
    unsubscribe_links TEXT[], -- Array of unsubscribe URLs
    is_archived BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    received_at TIMESTAMP WITH TIME ZONE NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(gmail_account_id, gmail_message_id)
);

-- Email attachments table
CREATE TABLE email_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100),
    size_bytes INTEGER,
    attachment_id VARCHAR(255), -- Gmail attachment ID
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User settings table
CREATE TABLE user_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    auto_categorize BOOLEAN DEFAULT TRUE,
    auto_archive BOOLEAN DEFAULT TRUE,
    sync_frequency_minutes INTEGER DEFAULT 15,
    ai_model VARCHAR(50) DEFAULT 'gpt-3.5-turbo',
    notification_preferences JSONB DEFAULT '{"email_processed": true, "category_full": false}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Unsubscribe attempts table
CREATE TABLE unsubscribe_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    unsubscribe_url TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- pending, success, failed, manual_required
    error_message TEXT,
    attempted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_users_google_id ON users(google_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_gmail_accounts_user_id ON gmail_accounts(user_id);
CREATE INDEX idx_gmail_accounts_email ON gmail_accounts(email);
CREATE INDEX idx_categories_user_id ON categories(user_id);
CREATE INDEX idx_emails_user_id ON emails(user_id);
CREATE INDEX idx_emails_category_id ON emails(category_id);
CREATE INDEX idx_emails_gmail_account_id ON emails(gmail_account_id);
CREATE INDEX idx_emails_gmail_message_id ON emails(gmail_message_id);
CREATE INDEX idx_emails_received_at ON emails(received_at DESC);
CREATE INDEX idx_emails_processed_at ON emails(processed_at DESC);
CREATE INDEX idx_email_attachments_email_id ON email_attachments(email_id);
CREATE INDEX idx_unsubscribe_attempts_email_id ON unsubscribe_attempts(email_id);
CREATE INDEX idx_unsubscribe_attempts_status ON unsubscribe_attempts(status);

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_gmail_accounts_updated_at BEFORE UPDATE ON gmail_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_emails_updated_at BEFORE UPDATE ON emails
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update category email count
CREATE OR REPLACE FUNCTION update_category_email_count()
RETURNS TRIGGER AS $$
BEGIN
    -- Update count for old category (if exists)
    IF OLD.category_id IS NOT NULL THEN
        UPDATE categories 
        SET email_count = (
            SELECT COUNT(*) 
            FROM emails 
            WHERE category_id = OLD.category_id 
            AND is_deleted = FALSE
        )
        WHERE id = OLD.category_id;
    END IF;
    
    -- Update count for new category (if exists)
    IF NEW.category_id IS NOT NULL THEN
        UPDATE categories 
        SET email_count = (
            SELECT COUNT(*) 
            FROM emails 
            WHERE category_id = NEW.category_id 
            AND is_deleted = FALSE
        )
        WHERE id = NEW.category_id;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_category_count_on_email_change 
    AFTER UPDATE OF category_id, is_deleted ON emails
    FOR EACH ROW EXECUTE FUNCTION update_category_email_count();

CREATE TRIGGER update_category_count_on_email_insert 
    AFTER INSERT ON emails
    FOR EACH ROW EXECUTE FUNCTION update_category_email_count();

-- Row Level Security (RLS) policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE unsubscribe_attempts ENABLE ROW LEVEL SECURITY;

-- RLS Policies (these will be configured based on your Supabase auth setup)
-- Users can only see their own data
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid()::text = id::text);

-- Similar policies for other tables...
CREATE POLICY "Users can manage own gmail accounts" ON gmail_accounts
    FOR ALL USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can manage own categories" ON categories
    FOR ALL USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can manage own emails" ON emails
    FOR ALL USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can manage own email attachments" ON email_attachments
    FOR ALL USING (auth.uid()::text IN (
        SELECT user_id::text FROM emails WHERE id = email_attachments.email_id
    ));

CREATE POLICY "Users can manage own settings" ON user_settings
    FOR ALL USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can manage own unsubscribe attempts" ON unsubscribe_attempts
    FOR ALL USING (auth.uid()::text = user_id::text);

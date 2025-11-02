import { supabase } from '../db';
import { EmailSummary } from './aiService';

interface EmailRecord {
  id?: string;
  user_id: string;
  gmail_account_id?: string;
  category_id?: string;
  gmail_message_id: string;
  gmail_thread_id: string;
  subject: string;
  sender_email: string;
  sender_name?: string;
  recipient_email: string;
  body_text?: string;
  body_html?: string;
  ai_summary?: string;
  ai_category_confidence?: number; // This matches the schema
  has_unsubscribe_link?: boolean;
  unsubscribe_links?: string[];
  is_archived?: boolean;
  is_deleted?: boolean;
  received_at: string;
  processed_at?: string;
  created_at?: string;
  updated_at?: string;
}

interface EmailInsertData {
  gmail_message_id: string;
  gmail_thread_id: string;
  subject: string;
  sender_email: string;
  sender_name?: string;
  recipient_email: string;
  body_text?: string;
  body_html?: string;
  ai_summary?: EmailSummary;
  has_attachments?: boolean;
  labels?: string[];
  is_read?: boolean;
  received_at: string;
}

class EmailDbService {
  /**
   * Check if email already exists in database
   */
  async emailExists(userId: string, gmailMessageId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('emails')
        .select('id')
        .eq('user_id', userId)
        .eq('gmail_message_id', gmailMessageId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        throw error;
      }

      return !!data;
    } catch (error) {
      console.error('Error checking email existence:', error);
      return false;
    }
  }

  /**
   * Insert new email into database
   */
  async insertEmail(userId: string, emailData: EmailInsertData): Promise<string | null> {
    try {
      console.log(`Inserting email ${emailData.gmail_message_id} for user ${userId}`);
      
      // Check if email already exists
      const exists = await this.emailExists(userId, emailData.gmail_message_id);
      if (exists) {
        console.log(`Email ${emailData.gmail_message_id} already exists, skipping insert`);
        return null;
      }

      // Get or create gmail account (for now, use primary account)
      console.log(`Getting Gmail account for recipient: ${emailData.recipient_email}`);
      const gmailAccountId = await this.getOrCreateGmailAccount(userId, emailData.recipient_email);

      // Prepare email record (matching actual database schema)
      const emailRecord: Partial<EmailRecord> = {
        user_id: userId,
        gmail_account_id: gmailAccountId,
        gmail_message_id: emailData.gmail_message_id,
        gmail_thread_id: emailData.gmail_thread_id,
        subject: emailData.subject,
        sender_email: emailData.sender_email,
        sender_name: emailData.sender_name,
        recipient_email: emailData.recipient_email,
        body_text: emailData.body_text,
        body_html: emailData.body_html,
        // Note: has_attachments column doesn't exist in schema, using separate attachments table
        // labels: emailData.labels || [], // Labels column doesn't exist in schema
        // is_read: emailData.is_read || false, // is_read column doesn't exist in schema
        is_archived: true, // We archive emails after importing
        received_at: emailData.received_at,
        processed_at: new Date().toISOString()
      };

      // Add AI summary data if available (matching schema columns)
      if (emailData.ai_summary) {
        emailRecord.ai_summary = emailData.ai_summary.summary;
        emailRecord.ai_category_confidence = emailData.ai_summary.confidence;
        // Note: Other AI fields like keyPoints, sentiment, category, actionRequired 
        // don't have corresponding columns in the current schema
      }

      console.log('Inserting email record:', JSON.stringify(emailRecord, null, 2));
      
      const { data, error } = await supabase
        .from('emails')
        .insert(emailRecord)
        .select('id')
        .single();

      if (error) {
        console.error('❌ Database insert error for email:', emailData.gmail_message_id);
        console.error('❌ Error details:', JSON.stringify(error, null, 2));
        console.error('❌ Error code:', error.code);
        console.error('❌ Error message:', error.message);
        console.error('❌ Error details:', error.details);
        console.error('❌ Error hint:', error.hint);
        console.error('❌ Attempted record:', JSON.stringify(emailRecord, null, 2));
        throw error;
      }

      if (!data || !data.id) {
        console.error('❌ Database insert returned no data for email:', emailData.gmail_message_id);
        throw new Error('Database insert returned no data');
      }

      console.log(`✅ Successfully inserted email ${emailData.gmail_message_id} with ID ${data.id}`);
      return data.id;

    } catch (error) {
      console.error('❌ Error inserting email:', emailData.gmail_message_id);
      console.error('❌ Error type:', error instanceof Error ? error.constructor.name : typeof error);
      console.error('❌ Error message:', error instanceof Error ? error.message : String(error));
      console.error('❌ Full error:', error);
      throw error;
    }
  }

  /**
   * Batch insert multiple emails
   */
  async insertEmails(userId: string, emails: EmailInsertData[]): Promise<{ inserted: number; skipped: number; errors: number }> {
    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    for (const email of emails) {
      try {
        const emailId = await this.insertEmail(userId, email);
        if (emailId) {
          inserted++;
        } else {
          skipped++;
        }
      } catch (error) {
        console.error(`Failed to insert email ${email.gmail_message_id}:`, error);
        errors++;
      }
    }

    return { inserted, skipped, errors };
  }

  /**
   * Get or create Gmail account record
   */
  private async getOrCreateGmailAccount(userId: string, email: string): Promise<string> {
    try {
      console.log(`Getting/creating Gmail account for user ${userId}, email ${email}`);
      
      // First, try to find existing account
      const { data: existingAccount, error: fetchError } = await supabase
        .from('gmail_accounts')
        .select('id')
        .eq('user_id', userId)
        .eq('email', email)
        .single();

      if (existingAccount) {
        console.log(`Found existing Gmail account: ${existingAccount.id}`);
        return existingAccount.id;
      }

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('Error fetching Gmail account:', fetchError);
        throw fetchError;
      }

      console.log('Creating new Gmail account record...');
      
      // Create new Gmail account record
      const { data: newAccount, error: insertError } = await supabase
        .from('gmail_accounts')
        .insert({
          user_id: userId,
          email: email,
          access_token: 'inherited', // Will inherit from user's tokens
          refresh_token: 'inherited',
          is_primary: true, // For now, mark as primary
          last_sync_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('Error creating Gmail account:', insertError);
        throw insertError;
      }

      console.log(`Created new Gmail account: ${newAccount.id}`);
      return newAccount.id;

    } catch (error) {
      console.error('Error getting/creating Gmail account:', error);
      throw error;
    }
  }

  /**
   * Get user's emails with pagination
   */
  async getUserEmails(userId: string, limit: number = 50, offset: number = 0) {
    try {
      const { data, error } = await supabase
        .from('emails')
        .select(`
          *,
          categories(name, color)
        `)
        .eq('user_id', userId)
        .eq('is_deleted', false)
        .order('received_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error fetching user emails:', error);
      throw error;
    }
  }

  /**
   * Get emails by category
   */
  async getEmailsByCategory(userId: string, categoryId: string, limit: number = 50) {
    try {
      const { data, error } = await supabase
        .from('emails')
        .select('*')
        .eq('user_id', userId)
        .eq('category_id', categoryId)
        .eq('is_deleted', false)
        .order('received_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error fetching emails by category:', error);
      throw error;
    }
  }

  /**
   * Update email archive status
   */
  async updateEmailArchiveStatus(userId: string, gmailMessageId: string, isArchived: boolean): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('emails')
        .update({ is_archived: isArchived })
        .eq('user_id', userId)
        .eq('gmail_message_id', gmailMessageId);

      if (error) {
        throw error;
      }

      return true;
    } catch (error) {
      console.error('Error updating email archive status:', error);
      return false;
    }
  }

  /**
   * Get import statistics for user
   */
  async getImportStats(userId: string) {
    try {
      const { data, error } = await supabase
        .from('emails')
        .select('id, is_archived, ai_category, received_at')
        .eq('user_id', userId)
        .eq('is_deleted', false);

      if (error) {
        throw error;
      }

      const stats = {
        totalEmails: data.length,
        archivedEmails: data.filter(e => e.is_archived).length,
        recentImports: data.filter(e => {
          const receivedDate = new Date(e.received_at);
          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          return receivedDate > weekAgo;
        }).length,
        categoryCounts: {} as Record<string, number>
      };

      // Count by AI category
      data.forEach(email => {
        if (email.ai_category) {
          stats.categoryCounts[email.ai_category] = (stats.categoryCounts[email.ai_category] || 0) + 1;
        }
      });

      return stats;
    } catch (error) {
      console.error('Error fetching import stats:', error);
      throw error;
    }
  }
}

export { EmailDbService, EmailRecord, EmailInsertData };

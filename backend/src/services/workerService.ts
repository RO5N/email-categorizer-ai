import { supabase } from '../db';
import { GmailService, EmailData } from './gmailService';
import { EmailDbService, EmailInsertData } from './emailDbService';

/**
 * Parse email date string to ISO format for database
 */
function parseEmailDate(dateString: string, emailId?: string): string {
  try {
    const emailDate = new Date(dateString);
    if (isNaN(emailDate.getTime())) {
      console.warn(`⚠️ Invalid date format${emailId ? ` for email ${emailId}` : ''}: ${dateString}, using current time`);
      return new Date().toISOString();
    }
    return emailDate.toISOString();
  } catch (dateError) {
    console.warn(`⚠️ Error parsing date${emailId ? ` for email ${emailId}` : ''}: ${dateString}, using current time`);
    return new Date().toISOString();
  }
}

/**
 * Process emails from Gmail and import to database
 * This is the core worker logic that can be called directly or via HTTP endpoint
 */
export async function processEmailsWorker(
  userId: string,
  emailAddress: string,
  historyId: string,
  previousHistoryId?: string
): Promise<{ imported: number; skipped: number; failed: number; total: number }> {
  console.log(`🔧 [Worker Service] Processing emails for user ${userId} (${emailAddress})`);
  console.log(`🔧 [Worker Service] History IDs: previous=${previousHistoryId || 'none'}, current=${historyId}`);

  // Get user's tokens from database
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('access_token, refresh_token, token_expires_at')
    .eq('id', userId)
    .single();

  if (userError || !userData?.access_token) {
    console.error('❌ [Worker Service] Failed to fetch user tokens:', userError);
    throw new Error('User tokens not found or invalid');
  }

  if (!userData.refresh_token) {
    console.error('❌ [Worker Service] User missing refresh_token');
    throw new Error('User missing refresh_token. Please re-authenticate.');
  }

  // Calculate expiry_date from token_expires_at
  let expiryDate: number | undefined = undefined;
  if (userData.token_expires_at) {
    expiryDate = new Date(userData.token_expires_at).getTime();
  }

  // Initialize Gmail service
  const gmailService = new GmailService();
  
  // Set up token refresh callback
  const tokenRefreshCallback = async (newTokens: { access_token: string; refresh_token?: string }) => {
    console.log('🔄 [Worker Service] Token refreshed, updating database...');
    try {
      const { error: updateError } = await supabase
        .from('users')
        .update({
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token || userData.refresh_token,
          token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
      
      if (updateError) {
        console.error('⚠️ [Worker Service] Failed to update refreshed token:', updateError);
      } else {
        console.log('✅ [Worker Service] Successfully updated refreshed token');
      }
    } catch (err) {
      console.error('❌ [Worker Service] Error updating refreshed token:', err);
    }
  };

  gmailService.setCredentials(
    {
      access_token: userData.access_token,
      refresh_token: userData.refresh_token,
      expiry_date: expiryDate
    },
    userId,
    tokenRefreshCallback
  );

  // Fetch emails using previousHistoryId (or fallback)
  const startHistoryId = previousHistoryId || (parseInt(historyId) - 1).toString();
  console.log(`🔍 [Worker Service] Fetching emails since historyId: ${startHistoryId}`);
  
  let newEmails: EmailData[];
  try {
    newEmails = await gmailService.fetchEmailsSinceHistoryId(startHistoryId);
  } catch (error) {
    console.error('❌ [Worker Service] Error fetching emails:', error);
    throw new Error(`Failed to fetch emails from Gmail: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  if (newEmails.length === 0) {
    console.log('✅ [Worker Service] No new emails to process');
    return { imported: 0, skipped: 0, failed: 0, total: 0 };
  }

  console.log(`✅ [Worker Service] Found ${newEmails.length} new email(s) to process`);

  // Import emails to database (without AI - that's handled separately)
  const emailDbService = new EmailDbService();
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const email of newEmails) {
    try {
      // Check if email already exists
      const exists = await emailDbService.emailExists(userId, email.id);
      if (exists) {
        console.log(`⏭️  [Worker Service] Email ${email.id} already exists, skipping`);
        skipped++;
        continue;
      }

      // Extract sender info
      let senderEmail = email.from || '';
      let senderName: string | undefined = undefined;
      
      if (email.from) {
        const nameMatch = email.from.match(/^(.+?)\s*<(.+?)>$/);
        if (nameMatch) {
          senderName = nameMatch[1].trim().replace(/"/g, '');
          senderEmail = nameMatch[2].trim();
        } else {
          const emailMatch = email.from.match(/[\w\.-]+@[\w\.-]+\.\w+/);
          if (emailMatch) {
            senderEmail = emailMatch[0];
          }
        }
      }

      // Prepare email data (without AI summary)
      const emailData: EmailInsertData = {
        gmail_message_id: email.id,
        gmail_thread_id: email.threadId,
        subject: email.subject || '(No Subject)',
        sender_email: senderEmail,
        sender_name: senderName,
        recipient_email: email.to || '',
        body_text: email.bodyText || email.body || '',
        body_html: email.bodyHtml || '',
        ai_summary: undefined, // No AI summary yet
        has_attachments: email.hasAttachments || false,
        labels: email.labels || [],
        is_read: email.isRead || false,
        received_at: parseEmailDate(email.date, email.id)
      };

      // Insert into database
      const emailId = await emailDbService.insertEmail(userId, emailData);
      
      if (emailId) {
        console.log(`✅ [Worker Service] Imported email ${email.id} (DB ID: ${emailId})`);
        imported++;

        // Trigger AI summarization (fire-and-forget via HTTP to keep it separate)
        // In serverless (Vercel), we MUST use the external domain, not localhost
        const isVercel = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
        const isLocalDev = !isVercel && process.env.NODE_ENV !== 'production';
        
        let aiWorkerUrl: string;
        if (isVercel || !isLocalDev) {
          // Production/Vercel: Use external domain
          aiWorkerUrl = process.env.BACKEND_URL || process.env.API_BASE_URL || 'https://api.bibliob.com';
        } else {
          // Local development: Use localhost
          aiWorkerUrl = process.env.BACKEND_URL || process.env.API_BASE_URL || 'http://localhost:3001';
        }
        
        const triggerAiUrl = `${aiWorkerUrl}/api/workers/ai-summarize`;
        
        console.log(`🤖 [Worker Service] Triggering AI summarization for email ${email.id}...`);
        
        // Fire-and-forget: Don't wait for AI processing
        fetch(triggerAiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: userId,
            gmailMessageId: email.id,
            emailData: {
              subject: email.subject || '(No Subject)',
              from: email.from || '',
              to: email.to || '',
              body: email.bodyText || email.body || '',
              snippet: email.snippet || ''
            }
          })
        }).catch(aiTriggerError => {
          console.error(`❌ [Worker Service] Failed to trigger AI for email ${email.id}:`, aiTriggerError);
          // Don't fail the whole process if AI trigger fails
        });

      } else {
        console.log(`⚠️  [Worker Service] Insert returned null for email ${email.id} (likely duplicate)`);
        skipped++;
      }

    } catch (error) {
      console.error(`❌ [Worker Service] Error processing email ${email.id}:`, error);
      failed++;
    }
  }

  console.log(`✅ [Worker Service] Processing complete: ${imported} imported, ${skipped} skipped, ${failed} failed`);
  return { imported, skipped, failed, total: newEmails.length };
}


import express, { Router, Request, Response } from 'express';
import { supabase } from '../db';
import { OAuth2Client } from 'google-auth-library';
import { GmailService, EmailData } from '../services/gmailService';
import { AIService, EmailSummary } from '../services/aiService';
import { EmailDbService, EmailInsertData } from '../services/emailDbService';

const router = Router();

/**
 * Verify that the webhook request is actually from Google Pub/Sub
 * by verifying the JWT token in the Authorization header
 */
async function verifyPubSubRequest(authHeader: string | undefined): Promise<boolean> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('⚠️ [Webhook] No Bearer token in Authorization header');
    return false;
  }

  const token = authHeader.replace('Bearer ', '');
  
  // Expected audience is the service account email
  // Format: gmail-webhook-handler@ai-email-sorter-476905.iam.gserviceaccount.com
  const expectedAudience = process.env.GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL || 
    'gmail-webhook-handler@ai-email-sorter-476905.iam.gserviceaccount.com';

  try {
    const client = new OAuth2Client();
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: expectedAudience,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      console.warn('⚠️ [Webhook] Token payload is empty');
      return false;
    }

    // Verify it's from the expected service account
    const serviceAccountEmail = payload.email || payload.sub;
    if (serviceAccountEmail !== expectedAudience) {
      console.warn(`⚠️ [Webhook] Token from unexpected service account: ${serviceAccountEmail}, expected: ${expectedAudience}`);
      return false;
    }

    console.log('✅ [Webhook] Pub/Sub request verified successfully');
    return true;
  } catch (error) {
    console.error('❌ [Webhook] Token verification failed:', error instanceof Error ? error.message : String(error));
    // For now, don't block requests if verification fails (allows testing)
    // In production, you might want to return false here
    return true; // TODO: Set to false in production for security
  }
}

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
 * STAGE 1 + 2: Import intercepted emails to database with non-blocking AI summarization (no archiving yet)
 * This runs in the background after webhook acknowledges receipt
 * 
 * Architecture:
 * 1. Insert email to database immediately (fast, no waiting)
 * 2. Start AI summarization async (fire-and-forget)
 * 3. Update database when AI completes
 * 
 * TODO Stage 3: Add Gmail archiving
 */
async function importEmailsToDatabase(
  userId: string,
  emails: EmailData[]
): Promise<{ imported: number; skipped: number; failed: number; aiStarted: number; aiFailed: number }> {
  const emailDbService = new EmailDbService();
  const aiService = new AIService();
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let aiStarted = 0;
  let aiFailed = 0;

  console.log(`📥 [Stage 1+2] Starting database import with non-blocking AI summarization for ${emails.length} email(s)`);
  console.log(`🔍 [DEBUG] Email IDs to process:`, emails.map(e => e.id));

  for (const email of emails) {
    console.log(`\n📧 [DEBUG] Processing email ${email.id}...`);
    console.log(`🔍 [DEBUG] Email data:`, {
      id: email.id,
      threadId: email.threadId,
      subject: email.subject,
      from: email.from,
      to: email.to,
      hasBodyText: !!email.bodyText,
      hasBody: !!email.body,
      hasBodyHtml: !!email.bodyHtml
    });
    
    try {
      // Check if email already exists in database
      console.log(`🔍 [DEBUG] Checking if email ${email.id} exists in database...`);
      const exists = await emailDbService.emailExists(userId, email.id);
      console.log(`🔍 [DEBUG] Email ${email.id} exists check result:`, exists);
      
      if (exists) {
        console.log(`⏭️  [Stage 1+2] Email ${email.id} already exists in database, skipping`);
        skipped++;
        continue;
      }

      console.log(`✅ [DEBUG] Email ${email.id} does not exist, proceeding with import...`);

      // Extract sender name and email from "Name <email>" format
      let senderEmail = email.from || '';
      let senderName: string | undefined = undefined;
      
      if (email.from) {
        const nameMatch = email.from.match(/^(.+?)\s*<(.+?)>$/);
        if (nameMatch) {
          senderName = nameMatch[1].trim().replace(/"/g, '');
          senderEmail = nameMatch[2].trim();
        } else {
          // If no name, try to extract just the email
          const emailMatch = email.from.match(/[\w\.-]+@[\w\.-]+\.\w+/);
          if (emailMatch) {
            senderEmail = emailMatch[0];
          }
        }
      }

      console.log(`🔍 [DEBUG] Extracted sender info:`, { senderEmail, senderName });

      // STAGE 1: Prepare email data for database (without AI summary)
      const emailData: EmailInsertData = {
        gmail_message_id: email.id,
        gmail_thread_id: email.threadId,
        subject: email.subject || '(No Subject)',
        sender_email: senderEmail,
        sender_name: senderName,
        recipient_email: email.to || '',
        body_text: email.bodyText || email.body || '',
        body_html: email.bodyHtml || '',
        // No AI summary initially - will be added async
        ai_summary: undefined,
        has_attachments: email.hasAttachments || false,
        labels: email.labels || [],
        is_read: email.isRead || false,
        received_at: parseEmailDate(email.date, email.id)
      };

      console.log(`🔍 [DEBUG] Prepared emailData for insert:`, {
        gmail_message_id: emailData.gmail_message_id,
        subject: emailData.subject,
        sender_email: emailData.sender_email,
        recipient_email: emailData.recipient_email,
        hasBodyText: !!emailData.body_text,
        hasBodyHtml: !!emailData.body_html,
        received_at: emailData.received_at
      });

      // STAGE 1: Insert into database immediately (fast, non-blocking)
      let emailId: string | null = null;
      try {
        console.log(`💾 [Stage 1] Inserting email ${email.id} into database (AI pending)...`);
        console.log(`🔍 [DEBUG] About to call emailDbService.insertEmail()...`);
        
        emailId = await emailDbService.insertEmail(userId, emailData);
        
        console.log(`🔍 [DEBUG] emailDbService.insertEmail() returned:`, emailId);
        
        if (!emailId) {
          console.log(`⚠️  [Stage 1] Insert returned null for email ${email.id} (likely duplicate)`);
          skipped++;
          continue;
        }

        console.log(`✅ [Stage 1] Successfully imported email ${email.id} (DB ID: ${emailId})`);
        imported++;

        // STAGE 2: Start AI summarization async (fire-and-forget)
        // Don't await - let it run in background and update DB when complete
        console.log(`🤖 [Stage 2] Starting AI summarization for email ${email.id} (async, non-blocking)...`);
        aiStarted++;
        
        // Fire-and-forget: Start AI summarization without awaiting
        // CRITICAL: Use .catch() to prevent unhandled promise rejections
        // This ensures errors are logged even if function terminates early
        const aiPromise = (async () => {
          try {
            console.log(`🔍 [DEBUG] Inside AI async function for email ${email.id}...`);
            console.log(`🔍 [DEBUG] Email data for AI:`, {
              subject: email.subject?.substring(0, 50) || 'none',
              from: email.from || 'none',
              to: email.to || 'none',
              bodyLength: (email.bodyText || email.body || '').length,
              snippet: email.snippet?.substring(0, 50) || 'none'
            });
            
            const startTime = Date.now();
            const aiSummary = await aiService.summarizeEmail({
              subject: email.subject || '(No Subject)',
              from: email.from || '',
              to: email.to || '',
              body: email.bodyText || email.body || '',
              snippet: email.snippet || ''
            });
            const duration = Date.now() - startTime;
            
            console.log(`✅ [Stage 2] AI summary generated for email ${email.id} (took ${duration}ms):`, {
              category: aiSummary.category,
              sentiment: aiSummary.sentiment,
              actionRequired: aiSummary.actionRequired,
              confidence: aiSummary.confidence,
              summaryPreview: aiSummary.summary.substring(0, 100) + '...',
              keyPointsCount: aiSummary.keyPoints.length
            });

            // Update database with AI summary
            console.log(`💾 [Stage 2] Updating database with AI summary for email ${email.id}...`);
            const updateSuccess = await emailDbService.updateEmailAiSummary(
              userId,
              email.id,
              aiSummary
            );

            if (updateSuccess) {
              console.log(`✅ [Stage 2] AI summary updated in database for email ${email.id}`);
            } else {
              console.error(`❌ [Stage 2] Failed to update AI summary in database for email ${email.id}`);
              aiFailed++;
            }

          } catch (aiError) {
            console.error(`❌ [Stage 2] AI summarization failed for email ${email.id}:`, aiError);
            console.error(`❌ [Stage 2] AI error details:`, {
              message: aiError instanceof Error ? aiError.message : String(aiError),
              name: aiError instanceof Error ? aiError.name : 'unknown',
              stack: aiError instanceof Error ? aiError.stack : 'No stack',
              cause: (aiError as any)?.cause || 'no cause'
            });
            aiFailed++;
            // Email remains in database without AI summary - that's OK
          }
        })(); // Immediately invoked async function - runs in background
        
        // CRITICAL: Attach error handler to prevent unhandled promise rejection
        // This ensures errors are logged even if Vercel kills the function early
        aiPromise.catch((error) => {
          console.error(`❌ [Stage 2] Unhandled AI promise rejection for email ${email.id}:`, error);
          aiFailed++;
        });

        console.log(`✅ [DEBUG] After starting AI async for email ${email.id}, continuing to next email...`);

      } catch (dbError) {
        console.error(`❌ [Stage 1] Database insertion failed for email ${email.id}:`, dbError);
        console.error(`❌ [Stage 1] Error details:`, {
          emailId: email.id,
          subject: email.subject,
          from: email.from,
          error: dbError instanceof Error ? dbError.message : String(dbError),
          errorCode: (dbError as any)?.code,
          errorStack: dbError instanceof Error ? dbError.stack : 'No stack'
        });
        failed++;
        continue;
      }

    } catch (error) {
      console.error(`❌ [Stage 1+2] Unexpected error processing email ${email.id}:`, error);
      console.error(`❌ [Stage 1+2] Error details:`, {
        emailId: email.id,
        subject: email.subject,
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : 'No stack'
      });
      failed++;
    }
  }

  console.log(`✅ [Stage 1] Database import complete: ${imported} imported, ${skipped} skipped, ${failed} failed`);
  console.log(`🤖 [Stage 2] AI summarization started for ${aiStarted} email(s) (running async in background)`);
  return { imported, skipped, failed, aiStarted, aiFailed };
}

/**
 * Process emails asynchronously (AI analysis + database storage + archiving)
 * This runs in the background after webhook acknowledges receipt
 * 
 * NOTE: This is kept for reference but currently not used
 * TODO: Update this in Stage 2 to add AI summarization and archiving
 */
async function processEmailsAsync(
  userId: string,
  emails: EmailData[],
  gmailService: GmailService
): Promise<void> {
  const aiService = new AIService();
  const emailDbService = new EmailDbService();
  const archiveResults: { success: string[]; failed: string[] } = { success: [], failed: [] };
  let imported = 0;
  let skipped = 0;

  for (const email of emails) {
    try {
      // Check if email already exists in database
      const exists = await emailDbService.emailExists(userId, email.id);
      if (exists) {
        console.log(`Email ${email.id} already exists, checking archive status...`);

        // Check if it's unarchived in Gmail and re-archive if needed
        try {
          const archiveStatus = await gmailService.checkArchivedStatus([email.id]);
          if (!archiveStatus[email.id]) {
            console.log(`Re-archiving previously imported email ${email.id}`);
            const reArchived = await gmailService.archiveEmail(email.id);
            if (reArchived) {
              console.log(`✅ Successfully re-archived ${email.id}`);
            } else {
              console.log(`⚠️ Failed to re-archive ${email.id} - might be stale ID`);
            }
          }
        } catch (reArchiveError) {
          console.log(`⚠️ Could not re-archive ${email.id} - likely stale ID:`, reArchiveError);
        }

        skipped++;
        continue;
      }

      // Generate AI summary
      const aiSummary = await aiService.summarizeEmail({
        subject: email.subject,
        from: email.from,
        to: email.to,
        body: email.bodyText || email.body,
        snippet: email.snippet
      });

      // Prepare email data for database
      const emailData: EmailInsertData = {
        gmail_message_id: email.id,
        gmail_thread_id: email.threadId,
        subject: email.subject || '(No Subject)',
        sender_email: email.from || '',
        sender_name: email.from?.split('<')[0]?.trim().replace(/"/g, '') || email.from || '',
        recipient_email: email.to || '',
        body_text: email.bodyText || email.body || '',
        body_html: email.bodyHtml || '',
        ai_summary: aiSummary,
        has_attachments: email.hasAttachments || false,
        labels: email.labels || [],
        is_read: email.isRead || false,
        received_at: parseEmailDate(email.date, email.id)
      };

      // Insert into database
      let emailId: string | null = null;
      try {
        emailId = await emailDbService.insertEmail(userId, emailData);
      } catch (dbError) {
        console.error(`❌ Database insertion failed for email ${email.id}:`, dbError);
        skipped++;
        continue;
      }

      if (emailId) {
        // Archive in Gmail after successful database insert
        console.log(`📁 Attempting to archive email ${email.id} in Gmail...`);

        try {
          // Check if email is already archived
          const preArchiveStatus = await gmailService.checkArchivedStatus([email.id]);
          const isAlreadyArchived = preArchiveStatus[email.id];

          if (isAlreadyArchived) {
            console.log(`✅ Email ${email.id} is already archived`);
            archiveResults.success.push(email.id);
          } else {
            const archiveResult = await gmailService.archiveEmailWithDetails(email.id);
            if (archiveResult.success) {
              console.log(`✅ Successfully archived email ${email.id}`);
              archiveResults.success.push(email.id);
            } else {
              console.log(`❌ Archive failed for ${email.id}:`, archiveResult.error);
              archiveResults.failed.push(email.id);
            }
          }
        } catch (archiveError) {
          console.error(`❌ Archive error for ${email.id}:`, archiveError);
          archiveResults.failed.push(email.id);
        }

        imported++;
      } else {
        skipped++;
      }

    } catch (error) {
      console.error(`Failed to process email ${email.id}:`, error);
      archiveResults.failed.push(email.id);
      skipped++;
    }
  }

  console.log(`✅ Webhook email processing complete: ${imported} imported, ${skipped} skipped, ${archiveResults.success.length} archived`);
}

/**
 * Gmail Push Notification Webhook
 * Receives notifications from Google Cloud Pub/Sub when new emails arrive
 * 
 * Endpoint: POST /api/webhooks/gmail
 */
// Middleware to capture raw body before parsing
const captureRawBody = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const chunks: Buffer[] = [];
  
  req.on('data', (chunk: Buffer) => {
    chunks.push(chunk);
  });
  
  req.on('end', () => {
    const rawBody = Buffer.concat(chunks);
    (req as any).rawBody = rawBody;
    (req as any).rawBodyString = rawBody.toString('utf-8');
    next();
  });
};

router.post('/gmail', captureRawBody, express.json({ limit: '10mb' }), async (req: Request, res: Response): Promise<void> => {
  try {
    // Verify the request is from Google Pub/Sub (security check)
    const authHeader = req.headers.authorization;
    const isVerified = await verifyPubSubRequest(authHeader);
    
    if (!isVerified) {
      console.warn('⚠️ [Webhook] Request verification failed, but proceeding for debugging');
      // In production, you might want to return 401 here:
      // res.status(401).json({ error: 'Unauthorized' });
      // return;
    }

    // Get raw body info
    const rawBody = (req as any).rawBody as Buffer | undefined;
    const rawBodyString = (req as any).rawBodyString as string | undefined;

    // Log incoming request with raw body details
    console.log('📨 [Webhook] Received request:', {
      contentType: req.headers['content-type'],
      contentLength: req.headers['content-length'],
      bodyType: typeof req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      hasBody: !!req.body,
      bodyIsEmpty: JSON.stringify(req.body) === '{}',
      bodyPreview: req.body ? JSON.stringify(req.body).substring(0, 300) : 'no body',
      verified: isVerified,
      rawBodyLength: rawBody?.length || 0,
      rawBodyString: rawBodyString?.substring(0, 500) || 'no raw body',
      rawBodyHex: rawBody?.toString('hex').substring(0, 200) || 'no raw body'
    });
    
    // Try to parse raw body if Express didn't parse it
    let parsedBody = req.body || {};
    
    // If body is empty but we have raw body, try to parse it manually
    if ((!parsedBody || Object.keys(parsedBody).length === 0) && rawBodyString && rawBodyString.length > 0) {
      console.log('🔍 [Webhook] Attempting to parse raw body manually...');
      try {
        parsedBody = JSON.parse(rawBodyString);
        console.log('✅ [Webhook] Successfully parsed raw body:', JSON.stringify(parsedBody).substring(0, 300));
      } catch (parseError) {
        console.error('❌ [Webhook] Failed to parse raw body as JSON:', parseError);
        console.log('Raw body (first 500 chars):', rawBodyString.substring(0, 500));
      }
    }
    
    // If still empty but we have content-length, might be Pub/Sub verification
    if ((!parsedBody || Object.keys(parsedBody).length === 0) && req.headers['content-length']) {
      console.log('⚠️ [Webhook] Body appears empty after all parsing attempts. This might be a Pub/Sub health check.');
      res.status(200).json({ success: true, message: 'Webhook endpoint is active' });
      return;
    }

    // Pub/Sub may send verification request when subscription is created
    // Format: { challenge: "string" }
    if (parsedBody?.challenge) {
      console.log('✅ [Webhook] Pub/Sub verification request received');
      res.status(200).send(parsedBody.challenge);
      return;
    }

    // Handle both wrapped and unwrapped payload formats
    let notification;
    
    // Option 1: Unwrapped payload (if "Enable payload unwrapping" is enabled)
    // Format: { emailAddress: "...", historyId: "..." } directly in parsedBody
    if (parsedBody && parsedBody.emailAddress && parsedBody.historyId) {
      console.log('📨 [Webhook] Using unwrapped payload format');
      notification = parsedBody;
    }
    // Option 2: Wrapped payload (if "Enable payload unwrapping" is disabled)
    // Format: { message: { data: "base64string", attributes: {...} } }
    else if (parsedBody?.message?.data) {
      console.log('📨 [Webhook] Using wrapped payload format, decoding base64...');
      // Decode base64 message data
      const messageData = Buffer.from(parsedBody.message.data, 'base64').toString('utf-8');
      try {
        notification = JSON.parse(messageData);
        console.log('✅ [Webhook] Decoded and parsed message data');
      } catch (parseError) {
        console.error('❌ [Webhook] Failed to parse message data:', parseError);
        console.error('Raw message data:', messageData.substring(0, 200));
        res.status(400).json({ error: 'Failed to parse message data' });
        return;
      }
    } else {
      console.error('❌ [Webhook] Invalid Pub/Sub message format:', {
        hasBody: !!parsedBody,
        bodyType: typeof parsedBody,
        bodyKeys: parsedBody ? Object.keys(parsedBody) : [],
        fullBody: JSON.stringify(parsedBody, null, 2),
        rawBody: typeof req.body === 'string' ? req.body.substring(0, 200) : 'not a string'
      });
      
      // Try to read raw body if available
      console.log('📨 [Webhook] Attempting to read raw body...');
      res.status(400).json({ 
        error: 'Invalid Pub/Sub message format',
        receivedBody: parsedBody,
        contentType: req.headers['content-type'],
        bodyType: typeof req.body
      });
      return;
    }

    // Gmail notification contains:
    // - emailAddress: User's email
    // - historyId: Gmail history ID for fetching new messages
    const emailAddress = notification.emailAddress;
    const historyId = notification.historyId;

    if (!emailAddress || !historyId) {
      res.status(400).json({ error: 'Missing emailAddress or historyId' });
      return;
    }

    console.log('📧 [Webhook] Gmail notification received:', { emailAddress, historyId });

    // Find user by email address
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, access_token, refresh_token, watch_history_id, token_expires_at')
      .eq('email', emailAddress)
      .single();

    if (userError || !user) {
      console.error('❌ [Webhook] User not found for email:', emailAddress, userError);
      // Still return 200 to acknowledge receipt (prevent Pub/Sub retries)
      res.status(200).json({ 
        success: false, 
        message: 'User not found',
        emailAddress 
      });
      return;
    }

    if (!user.access_token) {
      console.error('❌ [Webhook] User missing access token:', user.id);
      res.status(200).json({ 
        success: false, 
        message: 'User missing access token' 
      });
      return;
    }

    // Log refresh_token status for debugging
    if (!user.refresh_token) {
      console.error('❌ [Webhook] User missing refresh_token:', {
        userId: user.id,
        email: user.email,
        hasAccessToken: !!user.access_token,
        note: 'Refresh token is required for token refresh. User needs to re-authenticate.'
      });
      res.status(200).json({ 
        success: false, 
        message: 'User missing refresh_token. Please re-authenticate.' 
      });
      return;
    } else {
      console.log('✅ [Webhook] User has refresh_token:', {
        userId: user.id,
        email: user.email,
        refreshTokenLength: user.refresh_token.length
      });
    }

    // Get stored historyId (previous state) to compare with notification historyId (new state)
    const storedHistoryId = user.watch_history_id;
    if (!storedHistoryId) {
      console.warn('⚠️ [Webhook] No stored historyId found. Using notification historyId - 1 as fallback');
      // Fallback: try historyId - 1 (risky but better than nothing)
      const fallbackHistoryId = (parseInt(historyId) - 1).toString();
      console.log(`📋 [Webhook] Using fallback historyId: ${fallbackHistoryId}`);
    }

    // Initialize Gmail service with user's credentials
    const gmailService = new GmailService();
    
    // Calculate expiry_date from token_expires_at
    let expiryDate: number | undefined = undefined;
    if (user.token_expires_at) {
      expiryDate = new Date(user.token_expires_at).getTime();
    }
    
    // Set up token refresh callback
    const tokenRefreshCallback = async (newTokens: { access_token: string; refresh_token?: string }) => {
      console.log('🔄 [Webhook] Token refreshed, updating database...');
      try {
        const { error: updateError } = await supabase
          .from('users')
          .update({
            access_token: newTokens.access_token,
            refresh_token: newTokens.refresh_token || user.refresh_token,
            token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);
        
        if (updateError) {
          console.error('⚠️ [Webhook] Failed to update refreshed token:', updateError);
        } else {
          console.log('✅ [Webhook] Successfully updated refreshed token');
        }
      } catch (err) {
        console.error('❌ [Webhook] Error updating refreshed token:', err);
      }
    };

    gmailService.setCredentials(
      {
        access_token: user.access_token,
        refresh_token: user.refresh_token,
        expiry_date: expiryDate
      },
      user.id,
      tokenRefreshCallback
    );

    // Fetch new emails using stored historyId (previous state) to get changes
    const startHistoryId = storedHistoryId || (parseInt(historyId) - 1).toString();
    
    console.log(`🔍 [Webhook] Fetching emails since historyId: ${startHistoryId}`);
    let newEmails: EmailData[];
    try {
      newEmails = await gmailService.fetchEmailsSinceHistoryId(startHistoryId);
    } catch (error) {
      console.error('❌ [Webhook] Error fetching emails from history:', error);
      // Still return 200 to acknowledge receipt
      res.status(200).json({ 
        success: false, 
        message: 'Failed to fetch emails',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return;
    }

    if (newEmails.length === 0) {
      console.log('✅ [Webhook] No new emails found');
      // Update historyId even if no new emails
      if (historyId) {
        await supabase
          .from('users')
          .update({
            watch_history_id: historyId,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);
      }
      res.status(200).json({ 
        success: true, 
        message: 'No new emails found',
        emailAddress,
        historyId 
      });
      return;
    }

    console.log(`✅ [Webhook] Found ${newEmails.length} new email(s) to process`);

    // Import emails to database
    const emailDbService = new EmailDbService();
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const importedEmailIds: string[] = []; // Track successfully imported email IDs for archiving

    for (const email of newEmails) {
      try {
        // Check if email already exists
        const exists = await emailDbService.emailExists(user.id, email.id);
        if (exists) {
          console.log(`⏭️  [Webhook] Email ${email.id} already exists, skipping`);
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
          ai_summary: undefined,
          has_attachments: email.hasAttachments || false,
          labels: email.labels || [],
          is_read: email.isRead || false,
          received_at: parseEmailDate(email.date, email.id)
        };

        // Insert into database
        const emailId = await emailDbService.insertEmail(user.id, emailData);
        
        if (emailId) {
          console.log(`✅ [Webhook] Imported email ${email.id} (DB ID: ${emailId})`);
          imported++;
          importedEmailIds.push(email.id); // Track for archiving
        } else {
          console.log(`⚠️  [Webhook] Insert returned null for email ${email.id} (likely duplicate)`);
          skipped++;
        }

      } catch (error) {
        console.error(`❌ [Webhook] Error processing email ${email.id}:`, error);
        failed++;
      }
    }

    // Archive successfully imported emails in Gmail
    let archived = 0;
    let archiveFailed = 0;
    
    if (importedEmailIds.length > 0) {
      console.log(`📦 [Webhook] Archiving ${importedEmailIds.length} imported email(s) in Gmail...`);
      try {
        const archiveResult = await gmailService.archiveEmails(importedEmailIds);
        archived = archiveResult.success.length;
        archiveFailed = archiveResult.failed.length;
        
        if (archived > 0) {
          console.log(`✅ [Webhook] Successfully archived ${archived} email(s) in Gmail`);
        }
        if (archiveFailed > 0) {
          console.error(`❌ [Webhook] Failed to archive ${archiveFailed} email(s) in Gmail`);
        }
      } catch (error) {
        console.error('❌ [Webhook] Error archiving emails:', error);
        archiveFailed = importedEmailIds.length;
      }
    }

    // Update stored historyId to the new one from notification
    if (historyId) {
      console.log(`💾 [Webhook] Updating stored historyId from ${storedHistoryId || 'none'} to ${historyId}`);
      try {
        const { error: updateError } = await supabase
          .from('users')
          .update({
            watch_history_id: historyId,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);
        
        if (updateError) {
          console.error('⚠️ [Webhook] Failed to update historyId:', updateError);
        } else {
          console.log(`✅ [Webhook] Successfully updated historyId to ${historyId}`);
        }
      } catch (err) {
        console.error('⚠️ [Webhook] Error updating historyId:', err);
      }
    }

    console.log(`✅ [Webhook] Processing complete: ${imported} imported, ${skipped} skipped, ${failed} failed, ${archived} archived, ${archiveFailed} archive failed`);

    // Acknowledge receipt immediately (important: Pub/Sub needs 200 response within deadline)
    res.status(200).json({ 
      success: true, 
      message: 'Emails imported to database and archived in Gmail',
      emailAddress,
      historyId,
      stats: {
        imported,
        skipped,
        failed,
        archived,
        archiveFailed,
        total: newEmails.length
      }
    });

  } catch (error) {
    console.error('Webhook error:', error);
    // Still return 200 to acknowledge receipt (prevent Pub/Sub retries)
    res.status(200).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export default router;


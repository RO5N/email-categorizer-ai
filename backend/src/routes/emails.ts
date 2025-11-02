import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { GmailService } from '../services/gmailService';
import { AIService } from '../services/aiService';
import { EmailDbService, EmailInsertData } from '../services/emailDbService';
import { supabase } from '../db';

const router = Router();

/**
 * Import latest 10 emails from user's Gmail
 */
router.post('/import-latest', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    console.log('🔍 Authenticated user:', {
      id: user.id,
      email: user.email,
      name: user.name,
      google_id: user.google_id
    });

    // Get user's OAuth tokens from database
    console.log(`🔍 Looking up user in database with ID: ${user.id}`);
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('access_token, refresh_token, email, name')
      .eq('id', user.id)
      .single();

    if (userError) {
      console.error('❌ User lookup error:', userError);
      return res.status(400).json({
        success: false,
        message: 'User not found in database. Please re-authenticate.',
        error: userError.message
      });
    }

    if (!userData?.access_token) {
      console.error('❌ No access token found for user');
      return res.status(400).json({
        success: false,
        message: 'Gmail access token not found. Please re-authenticate.'
      });
    }

    console.log('✅ Found user in database:', {
      email: userData.email,
      name: userData.name,
      hasAccessToken: !!userData.access_token
    });

    // Initialize Gmail service
    const gmailService = new GmailService();
    gmailService.setCredentials({
      access_token: userData.access_token,
      refresh_token: userData.refresh_token
    });

    // Fetch latest 10 emails
    const emails = await gmailService.fetchLatest10Emails();

    if (emails.length === 0) {
      return res.json({
        success: true,
        message: 'No new emails found',
        data: {
          emails: [],
          count: 0,
          fetchedAt: new Date().toISOString(),
          imported: 0,
          archived: 0,
          skipped: 0
        }
      });
    }

    // Initialize services
    const aiService = new AIService();
    const emailDbService = new EmailDbService();

            // Process emails: AI analysis + database storage + archiving
            const processedEmails: any[] = [];
            const archiveResults: { success: string[]; failed: string[] } = { success: [], failed: [] };
            let imported = 0;
            let skipped = 0;

            for (const email of emails) {
              try {
                // Check if email already exists in database
                const exists = await emailDbService.emailExists(user.id, email.id);
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
        // Parse the email date string to ISO format for database
        let receivedAtDate: string;
        try {
          const emailDate = new Date(email.date);
          if (isNaN(emailDate.getTime())) {
            console.warn(`⚠️ Invalid date format for email ${email.id}: ${email.date}, using current time`);
            receivedAtDate = new Date().toISOString();
          } else {
            receivedAtDate = emailDate.toISOString();
          }
        } catch (dateError) {
          console.warn(`⚠️ Error parsing date for email ${email.id}: ${email.date}, using current time`);
          receivedAtDate = new Date().toISOString();
        }

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
          received_at: receivedAtDate
        };

        // Insert into database
        let emailId: string | null = null;
        try {
          emailId = await emailDbService.insertEmail(user.id, emailData);
        } catch (dbError) {
          console.error(`❌ Database insertion failed for email ${email.id}:`, dbError);
          console.error('❌ Database error details:', {
            emailId: email.id,
            subject: email.subject,
            from: email.from,
            error: dbError instanceof Error ? dbError.message : String(dbError),
            errorCode: (dbError as any)?.code,
            errorDetails: (dbError as any)?.details
          });
          
          // Continue processing - we'll skip this email
          // Don't archive since it wasn't stored in DB
          skipped++;
          continue;
        }
        
        if (emailId) {
                  // Archive in Gmail after successful database insert
                  console.log(`📁 Attempting to archive email ${email.id} in Gmail...`);
                  
                  let isAlreadyArchived = false;
                  try {
                    // Check if email is already archived before attempting to archive
                    const preArchiveStatus = await gmailService.checkArchivedStatus([email.id]);
                    isAlreadyArchived = preArchiveStatus[email.id];
                    
                    if (isAlreadyArchived) {
                      console.log(`✅ Email ${email.id} is already archived - skipping archive attempt`);
                      archiveResults.success.push(email.id);
                    } else {
                      console.log(`📧 Email ${email.id} details:`, {
                        subject: email.subject,
                        from: email.from,
                        labels: email.labels,
                        isRead: email.isRead
                      });

                      // Try to archive with detailed error handling
                      const archiveResult = await gmailService.archiveEmailWithDetails(email.id);
                      
                      if (archiveResult.success) {
                        console.log(`✅ Successfully archived email ${email.id}`);
                        archiveResults.success.push(email.id);
                      } else {
                        console.log(`❌ Archive failed for ${email.id}:`, archiveResult.error);
                        
                        // If it's an "Invalid id value" error, the email ID is stale
                        if (archiveResult.error?.message?.includes('Invalid id value')) {
                          console.log(`⚠️ Email ${email.id} has stale ID - this is expected for older fetches`);
                          // Don't count as failure since the email was processed successfully
                          archiveResults.success.push(email.id);
                        } else {
                          // Other errors are real failures
                          archiveResults.failed.push(email.id);
                        }
                      }
                    }
                  } catch (archiveError) {
                    console.error(`❌ Archive error for ${email.id}:`, archiveError);
                    archiveResults.failed.push(email.id);
                  }

                  imported++;
                  
                  // Add to response with AI summary
                  const wasArchived = isAlreadyArchived || archiveResults.success.includes(email.id);
          processedEmails.push({
            ...email,
            aiSummary,
            dbId: emailId,
            archived: wasArchived
          });
        } else {
          skipped++;
        }

      } catch (error) {
        console.error(`Failed to process email ${email.id}:`, error);
        console.error('Error details:', {
          emailId: email.id,
          subject: email.subject,
          from: email.from,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        
        archiveResults.failed.push(email.id);
        
        // Still add to response with fallback AI summary
        processedEmails.push({
          ...email,
          aiSummary: {
            summary: `Email from ${email.from} about "${email.subject}"`,
            keyPoints: [],
            sentiment: 'neutral' as const,
            category: 'General',
            actionRequired: false,
            confidence: 0.1
          },
          error: error instanceof Error ? error.message : 'Processing failed'
        });
      }
    }

    return res.json({
      success: true,
      message: `Processed ${emails.length} emails: ${imported} imported, ${skipped} skipped`,
      data: {
        emails: processedEmails,
        count: emails.length,
        imported,
        skipped,
        archived: archiveResults.success.length,
        archiveFailed: archiveResults.failed.length,
        archiveFailedIds: archiveResults.failed, // Include the failed IDs for debugging
        fetchedAt: new Date().toISOString(),
        aiProcessed: true,
        databaseStored: true
      }
    });

  } catch (error) {
    console.error('Error importing emails:', error);
    
    // Handle specific Gmail API errors
    if (error instanceof Error) {
      if (error.message.includes('invalid_grant') || error.message.includes('Token has been expired')) {
        return res.status(401).json({
          success: false,
          message: 'Gmail access expired. Please re-authenticate.',
          code: 'TOKEN_EXPIRED'
        });
      }
      
      if (error.message.includes('insufficient authentication scopes')) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient Gmail permissions. Please re-authenticate.',
          code: 'INSUFFICIENT_SCOPE'
        });
      }
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to import emails from Gmail',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get Gmail profile info
 */
router.get('/gmail-profile', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    
    // Get user's OAuth tokens
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('access_token, refresh_token')
      .eq('id', user.id)
      .single();

    if (userError || !userData?.access_token) {
      return res.status(400).json({
        success: false,
        message: 'Gmail access token not found'
      });
    }

    // Initialize Gmail service
    const gmailService = new GmailService();
    gmailService.setCredentials({
      access_token: userData.access_token,
      refresh_token: userData.refresh_token
    });

    // Get profile
    const profile = await gmailService.getProfile();

    return res.json({
      success: true,
      data: profile
    });

  } catch (error) {
    console.error('Error fetching Gmail profile:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch Gmail profile',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get user's imported emails from database
 */
router.get('/imported', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const emailDbService = new EmailDbService();
    const emails = await emailDbService.getUserEmails(user.id, limit, offset);
    const stats = await emailDbService.getImportStats(user.id);

    return res.json({
      success: true,
      data: {
        emails,
        stats,
        pagination: {
          limit,
          offset,
          hasMore: emails.length === limit
        }
      }
    });

  } catch (error) {
    console.error('Error fetching imported emails:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch imported emails',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get import statistics
 */
router.get('/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const emailDbService = new EmailDbService();
    const stats = await emailDbService.getImportStats(user.id);

    return res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error fetching import stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch import statistics',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Debug endpoint to check user status
 */
router.get('/debug-user', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    
    console.log('🔍 DEBUG: Session user:', {
      id: user?.id,
      email: user?.email,
      name: user?.name,
      google_id: user?.google_id
    });

    // Check if user exists in database
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    console.log('🔍 DEBUG: Database lookup result:', {
      found: !!dbUser,
      error: dbError?.message,
      dbUser: dbUser ? {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        google_id: dbUser.google_id
      } : null
    });

    return res.json({
      success: true,
      sessionUser: {
        id: user?.id,
        email: user?.email,
        name: user?.name,
        google_id: user?.google_id
      },
      databaseUser: dbUser ? {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        google_id: dbUser.google_id,
        hasAccessToken: !!dbUser.access_token
      } : null,
      error: dbError?.message || null
    });

  } catch (error) {
    console.error('❌ DEBUG: Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Test Gmail API connection
 */
router.get('/test-gmail', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    
    console.log('🧪 Testing Gmail API connection...');

    // Get user's OAuth tokens from database
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('access_token, refresh_token')
      .eq('id', user.id)
      .single();

    if (userError || !userData?.access_token) {
      return res.status(400).json({
        success: false,
        message: 'No access token found'
      });
    }

    // Test Gmail service
    const gmailService = new GmailService();
    gmailService.setCredentials({
      access_token: userData.access_token,
      refresh_token: userData.refresh_token
    });

    console.log('🔍 Testing Gmail profile...');
    const profile = await gmailService.getProfile();
    console.log('✅ Gmail profile success:', profile.emailAddress);

    console.log('🔍 Testing email fetch...');
    const emails = await gmailService.fetchLatest10Emails();
    console.log(`✅ Fetched ${emails.length} emails`);

    return res.json({
      success: true,
      profile: {
        emailAddress: profile.emailAddress,
        messagesTotal: profile.messagesTotal,
        threadsTotal: profile.threadsTotal
      },
      emailsFetched: emails.length,
      sampleEmails: emails.slice(0, 2).map(email => ({
        id: email.id,
        subject: email.subject,
        from: email.from,
        hasBody: !!email.body,
        hasHtml: !!email.bodyHtml,
        hasText: !!email.bodyText
      }))
    });

  } catch (error) {
    console.error('❌ Gmail test failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error
    });
  }
});

/**
 * Test database insertion with a single email
 */
router.post('/test-db-insert', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    
    console.log('🧪 Testing database insertion...');

    // Get user's OAuth tokens
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('access_token, refresh_token')
      .eq('id', user.id)
      .single();

    if (userError || !userData?.access_token) {
      return res.status(400).json({
        success: false,
        message: 'No access token found'
      });
    }

    // Fetch one email
    const gmailService = new GmailService();
    gmailService.setCredentials({
      access_token: userData.access_token,
      refresh_token: userData.refresh_token
    });

    const emails = await gmailService.fetchLatest10Emails();
    if (emails.length === 0) {
      return res.json({
        success: false,
        message: 'No emails found to test with'
      });
    }

    const testEmail = emails[0];
    console.log('🔍 Testing with email:', {
      id: testEmail.id,
      subject: testEmail.subject,
      from: testEmail.from,
      to: testEmail.to
    });

    // Test database insertion
    const emailDbService = new EmailDbService();
    
    // Check if already exists
    const exists = await emailDbService.emailExists(user.id, testEmail.id);
    console.log('🔍 Email exists check:', exists);

    if (exists) {
      return res.json({
        success: true,
        message: 'Email already exists in database',
        emailId: testEmail.id,
        alreadyExists: true
      });
    }

    // Try to insert
    const emailData = {
      gmail_message_id: testEmail.id,
      gmail_thread_id: testEmail.threadId,
      subject: testEmail.subject,
      sender_email: testEmail.from,
      sender_name: testEmail.from.split('<')[0].trim().replace(/"/g, ''),
      recipient_email: testEmail.to,
      body_text: testEmail.bodyText,
      body_html: testEmail.bodyHtml,
      has_attachments: testEmail.hasAttachments,
      labels: testEmail.labels,
      is_read: testEmail.isRead,
      received_at: testEmail.date
    };

    console.log('🔍 Attempting database insert...');
    const insertedId = await emailDbService.insertEmail(user.id, emailData);
    
    return res.json({
      success: true,
      message: 'Database insertion test completed',
      insertedId,
      emailData: {
        id: testEmail.id,
        subject: testEmail.subject,
        from: testEmail.from,
        to: testEmail.to
      }
    });

  } catch (error) {
    console.error('❌ Database test failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error
    });
  }
});

        /**
         * Test archiving a specific email by ID
         */
        router.post('/test-archive/:emailId', requireAuth, async (req: Request, res: Response) => {
          try {
            const user = req.user as any;
            const emailId = req.params.emailId;
            
            console.log(`🧪 Testing archive for email ID: ${emailId}`);

            // Get user's OAuth tokens
            const { data: userData, error: userError } = await supabase
              .from('users')
              .select('access_token, refresh_token')
              .eq('id', user.id)
              .single();

            if (userError || !userData?.access_token) {
              return res.status(400).json({
                success: false,
                message: 'No access token found'
              });
            }

            // Initialize Gmail service
            const gmailService = new GmailService();
            gmailService.setCredentials({
              access_token: userData.access_token,
              refresh_token: userData.refresh_token
            });

            // Check current status
            console.log(`🔍 Checking current status of email ${emailId}...`);
            const currentStatus = await gmailService.checkArchivedStatus([emailId]);
            console.log(`📊 Current archive status:`, currentStatus);

            // Try to archive with detailed error info
            console.log(`📁 Attempting to archive email ${emailId} with detailed error tracking...`);
            const archiveResult = await gmailService.archiveEmailWithDetails(emailId);

            // Check status after attempt
            const newStatus = await gmailService.checkArchivedStatus([emailId]);
            console.log(`📊 Status after archive attempt:`, newStatus);

            return res.json({
              success: true,
              emailId,
              beforeArchive: currentStatus[emailId],
              archiveAttemptSuccess: archiveResult.success,
              archiveError: archiveResult.error || null,
              afterArchive: newStatus[emailId],
              message: archiveResult.success ? 'Archive successful' : 'Archive failed',
              gmailApiError: archiveResult.error // Include the detailed Gmail API error
            });

          } catch (error) {
            console.error('❌ Archive test failed:', error);
            return res.status(500).json({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
              details: error
            });
          }
        });

        /**
         * Test Gmail API permissions and get a fresh email ID
         */
        router.get('/test-permissions', requireAuth, async (req: Request, res: Response) => {
          try {
            const user = req.user as any;
            
            console.log('🧪 Testing Gmail API permissions...');

            // Get user's OAuth tokens
            const { data: userData, error: userError } = await supabase
              .from('users')
              .select('access_token, refresh_token')
              .eq('id', user.id)
              .single();

            if (userError || !userData?.access_token) {
              return res.status(400).json({
                success: false,
                message: 'No access token found'
              });
            }

            // Initialize Gmail service
            const gmailService = new GmailService();
            gmailService.setCredentials({
              access_token: userData.access_token,
              refresh_token: userData.refresh_token
            });

            // Test 1: Get profile (readonly permission)
            console.log('🔍 Testing readonly permission...');
            const profile = await gmailService.getProfile();
            console.log('✅ Readonly permission works');

            // Test 2: Get latest emails (readonly permission)
            console.log('🔍 Testing email fetch...');
            const emails = await gmailService.fetchLatest10Emails();
            console.log(`✅ Fetched ${emails.length} emails`);

            if (emails.length === 0) {
              return res.json({
                success: false,
                message: 'No emails found to test with',
                profile: profile.emailAddress
              });
            }

            // Get the first email that's currently in INBOX
            const inboxEmail = emails.find(email => email.labels.includes('INBOX'));
            
            if (!inboxEmail) {
              return res.json({
                success: false,
                message: 'No emails found in INBOX to test with',
                totalEmails: emails.length,
                profile: profile.emailAddress
              });
            }

            // Test 3: Check if we can read the email details (should work)
            console.log(`🔍 Testing email details for ${inboxEmail.id}...`);
            const currentStatus = await gmailService.checkArchivedStatus([inboxEmail.id]);
            console.log(`✅ Can read email status: ${currentStatus[inboxEmail.id] ? 'archived' : 'in inbox'}`);

            return res.json({
              success: true,
              profile: profile.emailAddress,
              totalEmails: emails.length,
              testEmail: {
                id: inboxEmail.id,
                subject: inboxEmail.subject,
                from: inboxEmail.from,
                labels: inboxEmail.labels,
                isInInbox: inboxEmail.labels.includes('INBOX'),
                currentlyArchived: currentStatus[inboxEmail.id]
              },
              permissions: {
                canReadProfile: true,
                canReadEmails: true,
                canReadEmailStatus: true
              }
            });

          } catch (error) {
            console.error('❌ Permission test failed:', error);
            return res.status(500).json({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
              details: error
            });
          }
        });

        export default router;

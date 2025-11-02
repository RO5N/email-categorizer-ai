import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { GmailService } from '../services/gmailService';
import { AIService } from '../services/aiService';
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

    // Get user's OAuth tokens from database
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('access_token, refresh_token')
      .eq('id', user.id)
      .single();

    if (userError || !userData?.access_token) {
      return res.status(400).json({
        success: false,
        message: 'Gmail access token not found. Please re-authenticate.'
      });
    }

    // Initialize Gmail service
    const gmailService = new GmailService();
    gmailService.setCredentials({
      access_token: userData.access_token,
      refresh_token: userData.refresh_token
    });

    // Fetch latest 10 emails
    const emails = await gmailService.fetchLatest10Emails();

    // Generate AI summaries for emails
    const aiService = new AIService();
    const emailsWithSummaries = await Promise.all(
      emails.map(async (email) => {
        try {
          const aiSummary = await aiService.summarizeEmail({
            subject: email.subject,
            from: email.from,
            to: email.to,
            body: email.bodyText || email.body, // Use text version for AI processing
            snippet: email.snippet
          });

          return {
            ...email,
            aiSummary
          };
        } catch (error) {
          console.error(`Failed to generate AI summary for email ${email.id}:`, error);
          return {
            ...email,
            aiSummary: {
              summary: `Email from ${email.from} about "${email.subject}"`,
              keyPoints: [],
              sentiment: 'neutral' as const,
              category: 'General',
              actionRequired: false,
              confidence: 0.1
            }
          };
        }
      })
    );

    return res.json({
      success: true,
      message: `Successfully fetched and analyzed ${emails.length} emails`,
      data: {
        emails: emailsWithSummaries,
        count: emails.length,
        fetchedAt: new Date().toISOString(),
        aiProcessed: true
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

export default router;

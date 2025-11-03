import { Router, Request, Response } from 'express';
import { supabase } from '../db';
import { AIService } from '../services/aiService';
import { EmailDbService } from '../services/emailDbService';
import { processEmailsWorker } from '../services/workerService';

const router = Router();

/**
 * Worker endpoint: Process emails from webhook notification
 * This endpoint can take up to 5 minutes
 * 
 * POST /api/workers/process-emails
 * 
 * Body:
 * {
 *   "userId": "user-id",
 *   "emailAddress": "user@example.com",
 *   "historyId": "214743",
 *   "previousHistoryId": "214662"
 * }
 */
router.post('/process-emails', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, emailAddress, historyId, previousHistoryId } = req.body;

    if (!userId || !emailAddress || !historyId) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, emailAddress, historyId'
      });
      return;
    }

    // Call the worker service function directly
    const stats = await processEmailsWorker(userId, emailAddress, historyId, previousHistoryId);

    res.json({
      success: true,
      message: 'Email processing complete',
      stats
    });

  } catch (error) {
    console.error('❌ [Worker] Error in process-emails:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * AI Worker endpoint: Generate AI summary for an email
 * This endpoint can take up to 5 minutes for AI processing
 * 
 * POST /api/workers/ai-summarize
 * 
 * Body:
 * {
 *   "userId": "user-id",
 *   "gmailMessageId": "gmail-message-id",
 *   "emailData": {
 *     "subject": "...",
 *     "from": "...",
 *     "to": "...",
 *     "body": "...",
 *     "snippet": "..."
 *   }
 * }
 */
router.post('/ai-summarize', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, gmailMessageId, emailData } = req.body;

    if (!userId || !gmailMessageId || !emailData) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, gmailMessageId, emailData'
      });
      return;
    }

    console.log(`🤖 [AI Worker] Generating summary for email ${gmailMessageId} (user ${userId})`);

    // Initialize services
    const aiService = new AIService();
    const emailDbService = new EmailDbService();

    // Generate AI summary
    const startTime = Date.now();
    console.log(`🤖 [AI Worker] Calling OpenAI API...`);
    
    const aiSummary = await aiService.summarizeEmail({
      subject: emailData.subject || '(No Subject)',
      from: emailData.from || '',
      to: emailData.to || '',
      body: emailData.body || '',
      snippet: emailData.snippet || ''
    });

    const duration = Date.now() - startTime;
    console.log(`✅ [AI Worker] AI summary generated in ${duration}ms:`, {
      category: aiSummary.category,
      sentiment: aiSummary.sentiment,
      actionRequired: aiSummary.actionRequired,
      confidence: aiSummary.confidence
    });

    // Update database with AI summary
    const updateSuccess = await emailDbService.updateEmailAiSummary(
      userId,
      gmailMessageId,
      aiSummary
    );

    if (updateSuccess) {
      console.log(`✅ [AI Worker] AI summary updated in database for email ${gmailMessageId}`);
      res.json({
        success: true,
        message: 'AI summary generated and saved',
        summary: aiSummary,
        processingTime: `${duration}ms`
      });
    } else {
      console.error(`❌ [AI Worker] Failed to update AI summary in database for email ${gmailMessageId}`);
      res.status(500).json({
        success: false,
        error: 'Failed to update database with AI summary'
      });
    }

  } catch (error) {
    console.error('❌ [AI Worker] Error in ai-summarize:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate AI summary',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;


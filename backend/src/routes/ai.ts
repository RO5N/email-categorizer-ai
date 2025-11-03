import { Router, Request, Response } from 'express';
import { AIService } from '../services/aiService';

const router = Router();

/**
 * Test endpoint for AI email summarization
 * POST /api/ai/test-summarize
 * 
 * Body (JSON):
 * {
 *   "subject": "Email subject",
 *   "from": "sender@example.com",
 *   "to": "recipient@example.com",
 *   "body": "Email body content here...",
 *   "snippet": "Email snippet/preview (optional)"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "summary": {
 *     "summary": "AI-generated summary",
 *     "keyPoints": ["point1", "point2"],
 *     "sentiment": "positive|neutral|negative",
 *     "category": "Work|Personal|Marketing|etc",
 *     "actionRequired": true/false,
 *     "confidence": 0.0-1.0
 *   },
 *   "timestamp": "2025-11-03T..."
 * }
 */
router.post('/test-summarize', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🤖 [AI Test] Received test summarization request');
    
    // Validate request body
    const { subject, from, to, body, snippet } = req.body;
    
    if (!subject || !from || !body) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields',
        required: ['subject', 'from', 'body'],
        received: {
          hasSubject: !!subject,
          hasFrom: !!from,
          hasTo: !!to,
          hasBody: !!body,
          hasSnippet: !!snippet
        }
      });
      return;
    }
    
    console.log('🤖 [AI Test] Request data:', {
      subject: subject.substring(0, 50),
      from,
      to: to || 'not provided',
      bodyLength: body.length,
      snippetLength: snippet?.length || 0
    });
    
    // Initialize AI service
    let aiService: AIService;
    try {
      aiService = new AIService();
      console.log('✅ [AI Test] AIService initialized successfully');
    } catch (error) {
      console.error('❌ [AI Test] Failed to initialize AIService:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to initialize AI service',
        message: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Check OPENAI_API_KEY environment variable'
      });
      return;
    }
    
    // Test OpenAI connection first
    console.log('🔍 [AI Test] Testing OpenAI connection...');
    const connectionTest = await aiService.testConnection();
    
    if (!connectionTest) {
      console.error('❌ [AI Test] OpenAI connection test failed');
      res.status(500).json({
        success: false,
        error: 'OpenAI connection test failed',
        message: 'Unable to connect to OpenAI API. Check your API key and network connection.'
      });
      return;
    }
    
    console.log('✅ [AI Test] OpenAI connection test passed');
    
    // Generate summary
    console.log('🤖 [AI Test] Generating email summary...');
    const startTime = Date.now();
    
    const summary = await aiService.summarizeEmail({
      subject: subject,
      from: from,
      to: to || 'unknown',
      body: body,
      snippet: snippet || ''
    });
    
    const duration = Date.now() - startTime;
    
    console.log('✅ [AI Test] Summary generated successfully:', {
      category: summary.category,
      sentiment: summary.sentiment,
      actionRequired: summary.actionRequired,
      confidence: summary.confidence,
      keyPointsCount: summary.keyPoints.length,
      duration: `${duration}ms`
    });
    
    // Return success response
    res.json({
      success: true,
      summary: summary,
      metadata: {
        processingTime: `${duration}ms`,
        timestamp: new Date().toISOString(),
        model: 'gpt-3.5-turbo'
      }
    });
    
  } catch (error) {
    console.error('❌ [AI Test] Error processing request:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to generate summary',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
  }
});

/**
 * Test OpenAI connection endpoint
 * GET /api/ai/test-connection
 * 
 * Response:
 * {
 *   "success": true,
 *   "connected": true/false,
 *   "message": "...",
 *   "timestamp": "..."
 * }
 */
router.get('/test-connection', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🔍 [AI Test] Testing OpenAI connection...');
    
    let aiService: AIService;
    try {
      aiService = new AIService();
    } catch (error) {
      res.status(500).json({
        success: false,
        connected: false,
        error: 'Failed to initialize AI service',
        message: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Check OPENAI_API_KEY environment variable'
      });
      return;
    }
    
    const startTime = Date.now();
    const connected = await aiService.testConnection();
    const duration = Date.now() - startTime;
    
    if (connected) {
      res.json({
        success: true,
        connected: true,
        message: 'Successfully connected to OpenAI API',
        responseTime: `${duration}ms`,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        connected: false,
        message: 'Failed to connect to OpenAI API',
        responseTime: `${duration}ms`,
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('❌ [AI Test] Connection test error:', error);
    
    res.status(500).json({
      success: false,
      connected: false,
      error: 'Connection test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;


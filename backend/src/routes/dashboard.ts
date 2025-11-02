import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Protected route - requires authentication
router.get('/user-data', requireAuth, (req: Request, res: Response) => {
  const user = req.user as any;
  
  res.json({
    success: true,
    message: 'Authentication successful! Here is your protected data.',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      picture: user.picture,
      google_id: user.google_id
    },
    dummyData: {
      categories: [
        {
          id: 1,
          name: 'Work Emails',
          description: 'Professional emails and work-related communications',
          emailCount: 42,
          lastUpdated: new Date().toISOString()
        },
        {
          id: 2,
          name: 'Newsletters',
          description: 'Subscriptions and promotional emails',
          emailCount: 128,
          lastUpdated: new Date().toISOString()
        },
        {
          id: 3,
          name: 'Personal',
          description: 'Personal communications from friends and family',
          emailCount: 23,
          lastUpdated: new Date().toISOString()
        }
      ],
      recentEmails: [
        {
          id: 'email_1',
          subject: 'Welcome to Email Categorizer AI',
          from: 'noreply@emailcategorizer.com',
          category: 'Work Emails',
          summary: 'Welcome email explaining the features of the email categorization system.',
          receivedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
        },
        {
          id: 'email_2',
          subject: 'Weekly Newsletter - Tech Updates',
          from: 'newsletter@techblog.com',
          category: 'Newsletters',
          summary: 'Latest technology trends and updates in the software development world.',
          receivedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString() // 5 hours ago
        },
        {
          id: 'email_3',
          subject: 'Dinner plans for this weekend',
          from: 'friend@example.com',
          category: 'Personal',
          summary: 'Friend asking about weekend dinner plans and restaurant suggestions.',
          receivedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // 1 day ago
        }
      ],
      stats: {
        totalEmails: 193,
        categorizedToday: 15,
        unreadCount: 7,
        lastSync: new Date().toISOString()
      }
    },
    timestamp: new Date().toISOString()
  });
});

// Get user profile
router.get('/profile', requireAuth, (req: Request, res: Response) => {
  const user = req.user as any;
  
  res.json({
    success: true,
    profile: {
      id: user.id,
      name: user.name,
      email: user.email,
      picture: user.picture,
      joinedAt: user.created_at,
      lastLogin: new Date().toISOString()
    }
  });
});

// Test endpoint that doesn't require auth
router.get('/public', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'This is a public endpoint - no authentication required',
    timestamp: new Date().toISOString()
  });
});

export default router;

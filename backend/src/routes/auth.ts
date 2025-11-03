import { Router, Request, Response } from 'express';
import passport from '../auth/passport';
import { supabase } from '../db';
import { GmailService } from '../services/gmailService';

const router = Router();

// Initiate Google OAuth
// We manually redirect to Google OAuth with access_type=offline and prompt=consent
// to ensure refresh tokens are requested
router.get('/google', (req: Request, res: Response) => {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: 'code',
    scope: [
      'profile',
      'email',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify'
    ].join(' '),
    access_type: 'offline', // Request refresh token
    prompt: 'consent' // Force consent screen to get refresh token
  });
  
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  res.redirect(authUrl);
});

// Google OAuth callback
router.get('/google/callback', 
  passport.authenticate('google', { failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/?error=auth_failed` }),
  async (req: Request, res: Response) => {
    try {
      console.log('🔐 [OAuth Callback] Authentication successful');
      
      // Successful authentication
      const user = req.user as any;
      
      console.log('🔐 [OAuth Callback] User object:', {
        hasUser: !!user,
        userId: user?.id,
        userEmail: user?.email,
        userKeys: user ? Object.keys(user) : []
      });
      
      if (user && user.id) {
        console.log(`🔐 [OAuth Callback] Starting Gmail Watch subscription for user ${user.id}`);
        // Auto-subscribe to Gmail Watch for push notifications
        // This runs asynchronously so we don't delay the redirect
        subscribeToGmailWatch(user.id).catch(error => {
          console.error('❌ [OAuth Callback] Error subscribing to Gmail Watch:', error);
          // Don't fail the login if watch subscription fails
        });
      } else {
        console.warn('⚠️ [OAuth Callback] User or user.id missing, skipping watch subscription');
      }

      // Redirect to frontend immediately (don't wait for watch subscription)
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      console.log(`🔐 [OAuth Callback] Redirecting to frontend: ${frontendUrl}`);
      res.redirect(`${frontendUrl}/?auth=success`);
    } catch (error) {
      console.error('❌ [OAuth Callback] Error in OAuth callback:', error);
      // Still redirect on success, even if watch subscription fails
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/?auth=success`);
    }
  }
);

/**
 * Subscribe user to Gmail Watch for push notifications
 * This is called automatically after successful OAuth login
 */
async function subscribeToGmailWatch(userId: string): Promise<void> {
  console.log(`🔍 [Gmail Watch] Starting subscription for user ${userId}`);
  
  try {
    const topicName = process.env.GMAIL_PUBSUB_TOPIC;
    
    console.log(`🔍 [Gmail Watch] Topic name: ${topicName || 'NOT SET'}`);
    
    if (!topicName) {
      console.warn('⚠️ [Gmail Watch] GMAIL_PUBSUB_TOPIC not set, skipping Gmail Watch subscription');
      return;
    }

    // Get user's access token from database
    console.log(`🔍 [Gmail Watch] Fetching user data for ${userId}...`);
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('access_token, refresh_token')
      .eq('id', userId)
      .single();

    if (userError) {
      console.error('❌ [Gmail Watch] Error fetching user:', userError);
      return;
    }

    if (!userData?.access_token) {
      console.error('❌ [Gmail Watch] User missing access token:', {
        userId,
        hasData: !!userData,
        hasAccessToken: !!userData?.access_token
      });
      return;
    }

    console.log(`✅ [Gmail Watch] User data fetched, access token exists`);

    // Initialize Gmail service
    const gmailService = new GmailService();
    gmailService.setCredentials({
      access_token: userData.access_token,
      refresh_token: userData.refresh_token
    });

    // Subscribe to Gmail Watch
    console.log(`📡 [Gmail Watch] Calling Gmail API to subscribe to watch...`);
    const watchResult = await gmailService.subscribeToWatch(topicName);
    
    console.log(`✅ [Gmail Watch] Gmail API response:`, {
      expiration: watchResult.expiration,
      historyId: watchResult.historyId
    });

    // Convert expiration timestamp (milliseconds) to ISO string for database
    const expirationDate = new Date(parseInt(watchResult.expiration));
    const expirationISO = expirationDate.toISOString();

    console.log(`💾 [Gmail Watch] Updating database with watch info...`);

    // Update user record with watch subscription info
    const { error: updateError } = await supabase
      .from('users')
      .update({
        watch_history_id: watchResult.historyId,
        watch_expiration: expirationISO,
        watch_enabled: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      console.error('❌ [Gmail Watch] Error updating database:', updateError);
      throw updateError;
    }

    console.log(`✅ [Gmail Watch] Successfully subscribed user ${userId} to Gmail Watch. Expires: ${expirationISO}`);
  } catch (error) {
    console.error(`❌ [Gmail Watch] Failed to subscribe user ${userId} to Gmail Watch:`, error);
    console.error(`❌ [Gmail Watch] Error details:`, {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    });
    
    // Mark watch as disabled in database if subscription failed
    try {
      console.log(`🔄 [Gmail Watch] Marking watch_enabled as false in database...`);
      const { error: updateError } = await supabase
        .from('users')
        .update({
          watch_enabled: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
        
      if (updateError) {
        console.error('❌ [Gmail Watch] Error updating watch_enabled to false:', updateError);
      } else {
        console.log(`✅ [Gmail Watch] Marked watch_enabled as false`);
      }
    } catch (err) {
      console.error('❌ [Gmail Watch] Error updating watch_enabled to false:', err);
    }
  }
}

// Get current user
router.get('/me', (req: Request, res: Response) => {
  if (req.isAuthenticated()) {
    res.json({
      success: true,
      user: req.user
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Not authenticated'
    });
  }
});

// Logout
router.post('/logout', (req: Request, res: Response): void => {
  req.logout((err): void => {
    if (err) {
      res.status(500).json({
        success: false,
        message: 'Error logging out'
      });
      return;
    }
    
    req.session.destroy((err): void => {
      if (err) {
        res.status(500).json({
          success: false,
          message: 'Error destroying session'
        });
        return;
      }
      
      res.clearCookie('connect.sid');
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    });
  });
});

// Check authentication status
router.get('/status', (req: Request, res: Response) => {
  res.json({
    authenticated: req.isAuthenticated(),
    user: req.isAuthenticated() ? req.user : null
  });
});

export default router;

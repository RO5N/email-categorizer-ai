import { Router, Request, Response } from 'express';
import { supabase } from '../db';
import { GmailService } from '../services/gmailService';
import { requireAuth } from '../middleware/auth';

const router = Router();

/**
 * Renew Gmail Watch subscriptions that are about to expire
 * This endpoint should be called periodically (e.g., daily via cron job)
 * Gmail Watch expires after 7 days, so we should renew subscriptions that expire within 1 day
 * 
 * Endpoint: POST /api/watch/renew-expiring
 * 
 * Can be called:
 * - By authenticated users (with requireAuth)
 * - By cron jobs with API key authentication (for production)
 */
router.post('/renew-expiring', async (req: Request, res: Response): Promise<void> => {
  try {
    const topicName = process.env.GMAIL_PUBSUB_TOPIC;
    
    if (!topicName) {
      res.status(500).json({
        success: false,
        message: 'GMAIL_PUBSUB_TOPIC not configured'
      });
      return;
    }

    // Find users with watch subscriptions expiring within 24 hours
    const oneDayFromNow = new Date();
    oneDayFromNow.setHours(oneDayFromNow.getHours() + 24);

    const { data: expiringUsers, error: fetchError } = await supabase
      .from('users')
      .select('id, email, access_token, refresh_token, watch_expiration, watch_history_id')
      .eq('watch_enabled', true)
      .not('watch_expiration', 'is', null)
      .lte('watch_expiration', oneDayFromNow.toISOString());

    if (fetchError) {
      console.error('Error fetching expiring watch subscriptions:', fetchError);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch expiring subscriptions',
        error: fetchError.message
      });
      return;
    }

    if (!expiringUsers || expiringUsers.length === 0) {
      res.json({
        success: true,
        message: 'No expiring subscriptions found',
        renewed: 0,
        failed: 0
      });
      return;
    }

    console.log(`Found ${expiringUsers.length} user(s) with expiring watch subscriptions`);

    let renewed = 0;
    let failed = 0;
    const errors: Array<{ userId: string; email: string; error: string }> = [];

    // Renew subscriptions for each user
    for (const user of expiringUsers) {
      try {
        if (!user.access_token) {
          console.warn(`User ${user.id} missing access token, skipping renewal`);
          failed++;
          errors.push({
            userId: user.id,
            email: user.email,
            error: 'Missing access token'
          });
          continue;
        }

        // Initialize Gmail service
        const gmailService = new GmailService();
        gmailService.setCredentials({
          access_token: user.access_token,
          refresh_token: user.refresh_token || undefined
        });

        // Subscribe to watch (renewal)
        console.log(`Renewing watch subscription for user ${user.id} (${user.email})...`);
        const watchResult = await gmailService.subscribeToWatch(topicName);

        // Convert expiration timestamp to ISO string
        const expirationDate = new Date(parseInt(watchResult.expiration));
        const expirationISO = expirationDate.toISOString();

        // Update user record with new watch subscription info
        const { error: updateError } = await supabase
          .from('users')
          .update({
            watch_history_id: watchResult.historyId,
            watch_expiration: expirationISO,
            watch_enabled: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);

        if (updateError) {
          throw updateError;
        }

        console.log(`✅ Successfully renewed watch subscription for user ${user.id}. New expiration: ${expirationISO}`);
        renewed++;

      } catch (error) {
        console.error(`Failed to renew watch subscription for user ${user.id}:`, error);
        failed++;
        errors.push({
          userId: user.id,
          email: user.email,
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        // Mark watch as disabled if renewal failed
        try {
          await supabase
            .from('users')
            .update({
              watch_enabled: false,
              updated_at: new Date().toISOString()
            })
            .eq('id', user.id);
        } catch (err) {
          console.error(`Error updating watch_enabled for user ${user.id}:`, err);
        }
      }
    }

    res.json({
      success: true,
      message: `Renewed ${renewed} subscription(s), ${failed} failed`,
      renewed,
      failed,
      total: expiringUsers.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Error renewing watch subscriptions:', error);
    res.status(500).json({
      success: false,
      message: 'Error renewing watch subscriptions',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get watch subscription status for current user
 * Requires authentication
 */
router.get('/status', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user as any;

    if (!user || !user.id) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    const { data: userData, error } = await supabase
      .from('users')
      .select('watch_enabled, watch_expiration, watch_history_id')
      .eq('id', user.id)
      .single();

    if (error || !userData) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch watch status',
        error: error?.message
      });
      return;
    }

    const isActive = userData.watch_enabled === true;
    const expiration = userData.watch_expiration ? new Date(userData.watch_expiration) : null;
    const isExpired = expiration ? expiration < new Date() : false;
    const expiresInHours = expiration && !isExpired 
      ? Math.round((expiration.getTime() - Date.now()) / (1000 * 60 * 60))
      : null;

    res.json({
      success: true,
      watch: {
        enabled: isActive && !isExpired,
        expiration: expiration?.toISOString(),
        historyId: userData.watch_history_id,
        expiresInHours,
        status: isActive && !isExpired ? 'active' : isExpired ? 'expired' : 'disabled'
      }
    });

  } catch (error) {
    console.error('Error fetching watch status:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching watch status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Manually renew watch subscription for current user
 * Requires authentication
 */
router.post('/renew', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user as any;

    if (!user || !user.id) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    const topicName = process.env.GMAIL_PUBSUB_TOPIC;
    
    if (!topicName) {
      res.status(500).json({
        success: false,
        message: 'GMAIL_PUBSUB_TOPIC not configured'
      });
      return;
    }

    // Get user's access token
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('access_token, refresh_token')
      .eq('id', user.id)
      .single();

    if (userError || !userData?.access_token) {
      res.status(401).json({
        success: false,
        message: 'Access token not found. Please re-authenticate.'
      });
      return;
    }

    // Initialize Gmail service
    const gmailService = new GmailService();
    gmailService.setCredentials({
      access_token: userData.access_token,
      refresh_token: userData.refresh_token || undefined
    });

    // Subscribe to watch
    const watchResult = await gmailService.subscribeToWatch(topicName);

    // Convert expiration timestamp to ISO string
    const expirationDate = new Date(parseInt(watchResult.expiration));
    const expirationISO = expirationDate.toISOString();

    // Update user record
    const { error: updateError } = await supabase
      .from('users')
      .update({
        watch_history_id: watchResult.historyId,
        watch_expiration: expirationISO,
        watch_enabled: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      throw updateError;
    }

    res.json({
      success: true,
      message: 'Watch subscription renewed successfully',
      expiration: expirationISO,
      historyId: watchResult.historyId
    });

  } catch (error) {
    console.error('Error renewing watch subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to renew watch subscription',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;


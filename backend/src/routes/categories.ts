import { Router, Request, Response } from 'express';
import { supabase } from '../db';
import { requireAuth } from '../middleware/auth';
import { AIService } from '../services/aiService';
import { EmailDbService } from '../services/emailDbService';

const router = Router();

// Predefined color palette for categories
const CATEGORY_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#8B5CF6', // Purple
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
];

/**
 * Get random color from palette
 */
function getRandomColor(): string {
  return CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)];
}

/**
 * Get all categories for the authenticated user, plus uncategorized email count
 * GET /api/categories
 */
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user as any;

    if (!user || !user.id) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    // Fetch user's categories
    const { data: categories, error: categoriesError } = await supabase
      .from('categories')
      .select('id, name, description, color, email_count, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true }); // Custom categories first

    if (categoriesError) {
      console.error('Error fetching categories:', categoriesError);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch categories',
        error: categoriesError.message
      });
      return;
    }

    // Count uncategorized emails (category_id IS NULL)
    const { count: uncategorizedCount, error: countError } = await supabase
      .from('emails')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('category_id', null)
      .eq('is_deleted', false);

    if (countError) {
      console.error('Error counting uncategorized emails:', countError);
      // Don't fail the request, just set count to 0
      console.warn('⚠️ Could not count uncategorized emails, defaulting to 0');
    }

    res.json({
      success: true,
      categories: categories || [],
      uncategorizedCount: uncategorizedCount || 0
    });

  } catch (error) {
    console.error('Error in GET /api/categories:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Create a new category
 * POST /api/categories
 * Body: { name: string, description: string, color?: string }
 */
router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user as any;

    if (!user || !user.id) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    const { name, description, color } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({
        success: false,
        message: 'Category name is required'
      });
      return;
    }

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      res.status(400).json({
        success: false,
        message: 'Category description is required'
      });
      return;
    }

    // Validate name length (VARCHAR(255) in schema)
    if (name.length > 255) {
      res.status(400).json({
        success: false,
        message: 'Category name must be 255 characters or less'
      });
      return;
    }

    // Validate color if provided (must be valid hex color)
    let categoryColor = color || getRandomColor();
    if (color && !/^#[0-9A-F]{6}$/i.test(color)) {
      res.status(400).json({
        success: false,
        message: 'Invalid color format. Must be a hex color (e.g., #3B82F6)'
      });
      return;
    }

    // Check if category name already exists for this user
    const { data: existingCategory } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', user.id)
      .eq('name', name.trim())
      .eq('is_active', true)
      .single();

    if (existingCategory) {
      res.status(400).json({
        success: false,
        message: 'A category with this name already exists'
      });
      return;
    }

    // Create category
    const { data: newCategory, error: createError } = await supabase
      .from('categories')
      .insert({
        user_id: user.id,
        name: name.trim(),
        description: description.trim(),
        color: categoryColor,
        is_active: true,
        email_count: 0
      })
      .select('id, name, description, color, email_count, created_at, updated_at')
      .single();

    if (createError) {
      console.error('Error creating category:', createError);
      res.status(500).json({
        success: false,
        message: 'Failed to create category',
        error: createError.message
      });
      return;
    }

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      category: newCategory
    });

  } catch (error) {
    console.error('Error in POST /api/categories:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Recategorize uncategorized emails using AI
 * POST /api/categories/recategorize
 */
router.post('/recategorize', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user as any;

    if (!user || !user.id) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    console.log(`🤖 [Recategorize] Starting AI recategorization for user ${user.id}`);

    // Get user's categories
    const { data: categories, error: categoriesError } = await supabase
      .from('categories')
      .select('id, name, description')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (categoriesError) {
      console.error('Error fetching categories:', categoriesError);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch categories',
        error: categoriesError.message
      });
      return;
    }

    if (!categories || categories.length === 0) {
      res.status(400).json({
        success: false,
        message: 'No categories found. Please create categories first.'
      });
      return;
    }

    console.log(`🤖 [Recategorize] Found ${categories.length} categories`);

    // Get all uncategorized emails (category_id IS NULL)
    // Also get emails without AI summaries
    const { data: uncategorizedEmails, error: emailsError } = await supabase
      .from('emails')
      .select('id, subject, sender_email, recipient_email, body_text, body_html, ai_summary')
      .eq('user_id', user.id)
      .is('category_id', null)
      .eq('is_deleted', false)
      .order('received_at', { ascending: false });

    if (emailsError) {
      console.error('Error fetching uncategorized emails:', emailsError);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch uncategorized emails',
        error: emailsError.message
      });
      return;
    }

    if (!uncategorizedEmails || uncategorizedEmails.length === 0) {
      res.json({
        success: true,
        message: 'No uncategorized emails found',
        stats: {
          processed: 0,
          categorized: 0,
          keptUncategorized: 0,
          failed: 0
        }
      });
      return;
    }

    console.log(`🤖 [Recategorize] Found ${uncategorizedEmails.length} uncategorized emails`);

    // Initialize services
    const aiService = new AIService();
    const emailDbService = new EmailDbService();

    let categorized = 0;
    let keptUncategorized = 0;
    let failed = 0;
    let summariesGenerated = 0;

    // Process emails one by one
    for (const email of uncategorizedEmails) {
      try {
        // Get email body (prefer text, fallback to HTML stripped)
        const emailBody = email.body_text || 
          (email.body_html ? email.body_html.replace(/<[^>]*>/g, '').substring(0, 2000) : '') ||
          email.ai_summary ||
          '';

        // Generate AI summary if missing
        let aiSummary = null;
        if (!email.ai_summary) {
          console.log(`🤖 [Recategorize] Generating AI summary for email ${email.id}`);
          try {
            aiSummary = await aiService.summarizeEmail({
              subject: email.subject || '(No Subject)',
              from: email.sender_email || '',
              to: email.recipient_email || '',
              body: emailBody,
              snippet: email.subject || ''
            });
            summariesGenerated++;
            console.log(`✅ [Recategorize] Generated AI summary for email ${email.id}`);
          } catch (summaryError) {
            console.error(`❌ [Recategorize] Failed to generate summary for email ${email.id}:`, summaryError);
            // Continue with categorization even if summary fails
          }
        }

        // Categorize using AI
        const categorization = await aiService.categorizeEmail(
          {
            subject: email.subject || '(No Subject)',
            from: email.sender_email || '',
            to: email.recipient_email || '',
            body: emailBody,
            snippet: email.ai_summary || aiSummary?.summary || email.subject || ''
          },
          categories
        );

        // Prepare update data
        const updateData: any = {
          updated_at: new Date().toISOString()
        };

        // Add category if matched
        if (categorization.categoryId) {
          updateData.category_id = categorization.categoryId;
        }

        // Add AI summary if generated
        if (aiSummary) {
          updateData.ai_summary = aiSummary.summary;
          updateData.ai_category_confidence = aiSummary.confidence;
        }

        // Update email
        const { error: updateError } = await supabase
          .from('emails')
          .update(updateData)
          .eq('id', email.id)
          .eq('user_id', user.id);

        if (updateError) {
          console.error(`❌ [Recategorize] Failed to update email ${email.id}:`, updateError);
          failed++;
        } else {
          if (categorization.categoryId) {
            console.log(`✅ [Recategorize] Categorized email ${email.id} into category ${categorization.categoryId}`);
            categorized++;
          } else {
            keptUncategorized++;
            console.log(`⏭️  [Recategorize] Email ${email.id} kept uncategorized`);
          }
        }

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        console.error(`❌ [Recategorize] Error processing email ${email.id}:`, error);
        failed++;
      }
    }

    console.log(`✅ [Recategorize] Complete: ${categorized} categorized, ${keptUncategorized} kept uncategorized, ${summariesGenerated} summaries generated, ${failed} failed`);

    res.json({
      success: true,
      message: `Recategorization complete: ${categorized} categorized, ${keptUncategorized} kept uncategorized, ${summariesGenerated} summaries generated`,
      stats: {
        processed: uncategorizedEmails.length,
        categorized,
        keptUncategorized,
        summariesGenerated,
        failed
      }
    });

  } catch (error) {
    console.error('Error in recategorize endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;


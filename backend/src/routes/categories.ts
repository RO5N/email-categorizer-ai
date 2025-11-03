import { Router, Request, Response } from 'express';
import { supabase } from '../db';
import { requireAuth } from '../middleware/auth';

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

export default router;


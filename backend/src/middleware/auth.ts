import { Request, Response, NextFunction } from 'express';

// Middleware to check if user is authenticated
export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  if (req.isAuthenticated()) {
    return next();
  }
  
  res.status(401).json({
    success: false,
    message: 'Authentication required',
    redirectTo: '/api/auth/google'
  });
};

// Middleware to check if user is authenticated (optional - doesn't block)
export const optionalAuth = (req: Request, res: Response, next: NextFunction): void => {
  // Always proceed, but req.user will be available if authenticated
  next();
};

// Middleware to get user from session
export const getCurrentUser = (req: Request, res: Response, next: NextFunction): void => {
  if (req.isAuthenticated() && req.user) {
    // User is available in req.user
    return next();
  }
  
  // No user in session
  next();
};

export default {
  requireAuth,
  optionalAuth,
  getCurrentUser
};

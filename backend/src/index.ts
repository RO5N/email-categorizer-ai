import 'dotenv/config';
import express, { Request, Response } from 'express';
import session from 'express-session';
import cors from 'cors';
import passport from './auth/passport';
import sessionStore from './sessionStore';
import authRoutes from './routes/auth';
import dashboardRoutes from './routes/dashboard';
import emailRoutes from './routes/emails';

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3002', 
    process.env.FRONTEND_URL || 'http://localhost:3000'
  ].filter(Boolean) as string[],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration with PostgreSQL store
app.use(session({
  store: sessionStore, // Use PostgreSQL session store instead of memory
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' // Required for cross-origin in production
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());


// Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/emails', emailRoutes);

// Health check route
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'OK',
    message: 'Backend is running',
    timestamp: new Date().toISOString(),
    authenticated: req.isAuthenticated ? req.isAuthenticated() : false
  });
});

// Root route
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Email Categorizer AI Backend',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: {
        google: '/api/auth/google',
        callback: '/api/auth/google/callback',
        me: '/api/auth/me',
        logout: '/api/auth/logout',
        status: '/api/auth/status'
      },
      dashboard: {
        userData: '/api/dashboard/user-data',
        profile: '/api/dashboard/profile',
        public: '/api/dashboard/public'
      },
      emails: {
        importLatest: '/api/emails/import-latest',
        gmailProfile: '/api/emails/gmail-profile',
        imported: '/api/emails/imported',
        stats: '/api/emails/stats'
      }
    }
  });
});

// Export handler for Vercel serverless functions
// Vercel expects a function that handles (req, res)
export default app;

// Also export as handler function for Vercel compatibility
export const handler = app;

// Start server only in local development
// In production/Vercel, the serverless function will handle requests
// Check if we're running directly (not imported as a module)
const isDevelopment = process.env.NODE_ENV !== 'production';
const isVercel = process.env.VERCEL === '1';

if (isDevelopment && !isVercel) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📋 Health check: http://localhost:${PORT}/health`);
    console.log(`🔐 Google OAuth: http://localhost:${PORT}/api/auth/google`);
  });
}

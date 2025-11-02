# AI Email Categorizer

An intelligent email management application that automatically categorizes and manages your Gmail emails using AI.

## Features

- **Google OAuth Integration**: Secure authentication with Gmail access
- **AI-Powered Categorization**: Automatically categorize emails using OpenAI
- **Email Summarization**: AI-generated summaries for each email
- **Auto-Archive**: Automatically archive categorized emails
- **Bulk Actions**: Delete or unsubscribe from multiple emails at once
- **Smart Unsubscribe**: AI agent that automatically unsubscribes from unwanted emails
- **Multiple Gmail Accounts**: Support for multiple Gmail accounts
- **Real-time Sync**: Automatic email synchronization every 15 minutes

## Tech Stack

### Frontend
- **Next.js 16** with React 19
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **shadcn/ui** for UI components
- **Zustand** for state management
- **React Query** for data fetching

### Backend
- **Node.js** with Express
- **TypeScript** for type safety
- **PostgreSQL** database via Supabase
- **Google Gmail API** for email access
- **OpenAI API** for AI categorization
- **Puppeteer** for web scraping (unsubscribe automation)

### Deployment
- **Vercel** for both frontend and backend
- **Supabase** for PostgreSQL database

## Getting Started

### Prerequisites

1. Node.js 18+ installed
2. A Google Cloud Project with Gmail API enabled
3. A Supabase project
4. An OpenAI API key

### Environment Setup

#### Backend (.env)
```bash
# Database
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/google/callback

# Session & JWT
SESSION_SECRET=your_session_secret_key_here
JWT_SECRET=your_jwt_secret_key_here

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# App Config
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:3000
```

#### Frontend (.env.local)
```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Database Setup

1. Create a new Supabase project
2. Run the SQL schema from `database/schema.sql`
3. Configure Row Level Security policies as needed

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Gmail API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs:
   - `http://localhost:3001/auth/google/callback` (development)
   - `https://your-backend-domain.vercel.app/auth/google/callback` (production)
6. Add test users in OAuth consent screen for development

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd email-categorizer-ai
```

2. Install backend dependencies
```bash
cd backend
npm install
```

3. Install frontend dependencies
```bash
cd ../frontend
npm install
```

### Running the Application

1. Start the backend server
```bash
cd backend
npm run dev
```

2. Start the frontend development server
```bash
cd frontend
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

1. **Sign In**: Click "Continue with Google" to authenticate
2. **Create Categories**: Add custom categories with descriptions
3. **Email Processing**: The system automatically processes new emails every 15 minutes
4. **View Dashboard**: See overview of categorized emails and statistics
5. **Manage Emails**: View, search, and perform bulk actions on emails
6. **Unsubscribe**: Use the AI-powered unsubscribe feature for unwanted emails

## API Endpoints

### Authentication
- `GET /api/auth/google` - Initiate Google OAuth
- `GET /api/auth/google/callback` - OAuth callback
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout user

### Categories
- `GET /api/categories` - List user categories
- `POST /api/categories` - Create new category
- `PUT /api/categories/:id` - Update category
- `DELETE /api/categories/:id` - Delete category

### Emails
- `GET /api/emails` - List emails with filters
- `GET /api/emails/:id` - Get single email
- `PUT /api/emails/:id/category` - Update email category
- `POST /api/emails/bulk-action` - Perform bulk actions
- `POST /api/emails/sync` - Trigger manual sync

### Users
- `GET /api/users/profile` - Get user profile
- `GET /api/users/settings` - Get user settings
- `PUT /api/users/settings` - Update user settings
- `GET /api/users/gmail-accounts` - List Gmail accounts
- `POST /api/users/gmail-accounts` - Add Gmail account

## Testing

### Backend Tests
```bash
cd backend
npm test
```

### Frontend Tests
```bash
cd frontend
npm test
```

## Deployment

### Backend (Vercel)
1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy from the `backend` directory

### Frontend (Vercel)
1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy from the `frontend` directory

### Database (Supabase)
1. Create a Supabase project
2. Run the schema from `database/schema.sql`
3. Configure environment variables with Supabase credentials

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support, please open an issue on GitHub or contact the development team.
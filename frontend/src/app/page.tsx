'use client';

import { useEffect, useState, useTransition } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { getApiUrl } from '../lib/config';

interface AuthStatus {
  authenticated: boolean;
  user: any;
}

interface AuthError extends Error {
  status?: number;
  code?: string;
}

function ErrorFallback({ error, resetErrorBoundary }: { error: AuthError; resetErrorBoundary: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center max-w-md mx-auto p-6">
        <div className="text-red-600 text-6xl mb-4">⚠️</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Something went wrong</h2>
        <p className="text-gray-600 mb-6">
          {error.status === 401 
            ? "Authentication required. Please sign in to continue."
            : error.message || "An unexpected error occurred. Please try again."
          }
        </p>
        <button
          onClick={resetErrorBoundary}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

function AuthChecker() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<AuthError | null>(null);

  const checkAuthStatus = async () => {
    try {
      setError(null);
      
      const response = await fetch(getApiUrl('api/auth/status'), {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const authError = new Error(`Authentication check failed`) as AuthError;
        authError.status = response.status;
        throw authError;
      }

      const data = await response.json();
      setAuthStatus(data);
    } catch (err) {
      const authError = err as AuthError;
      setError(authError);
      setAuthStatus({ authenticated: false, user: null });
    }
  };

  useEffect(() => {
    startTransition(() => {
      checkAuthStatus();
    });
  }, []);

  const handleLogin = () => {
    window.location.href = getApiUrl('api/auth/google');
  };

  const handleLogout = async () => {
    try {
      startTransition(async () => {
        await fetch(getApiUrl('api/auth/logout'), {
          method: 'POST',
          credentials: 'include'
        });
        setAuthStatus({ authenticated: false, user: null });
      });
    } catch (error) {
      setError(error as AuthError);
    }
  };

  if (isPending || !authStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (error && error.status !== 401) {
    throw error; // Let ErrorBoundary handle non-auth errors
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-12 px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Email Categorizer AI
          </h1>
          <p className="text-xl text-gray-600">
            AI-powered email organization and management
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-8">
          {!authStatus?.authenticated ? (
            <div className="text-center">
              <h2 className="text-2xl font-semibold mb-4">Welcome!</h2>
              <p className="text-gray-600 mb-6">
                Please sign in with your Google account to access the dashboard.
              </p>
              <button
                onClick={handleLogin}
                disabled={isPending}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 px-6 rounded-lg transition duration-200 flex items-center mx-auto"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {isPending ? 'Signing in...' : 'Sign in with Google'}
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                  {authStatus.user?.picture && (
                    <img
                      src={authStatus.user.picture}
                      alt="Profile"
                      className="w-12 h-12 rounded-full mr-4"
                    />
                  )}
                  <div>
                    <h2 className="text-2xl font-semibold">
                      Welcome, {authStatus.user?.name}!
                    </h2>
                    <p className="text-gray-600">{authStatus.user?.email}</p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  disabled={isPending}
                  className="bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
                >
                  {isPending ? 'Logging out...' : 'Logout'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 p-6 rounded-lg">
                  <h3 className="text-lg font-semibold mb-4">Authentication Status</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Status:</span>
                      <span className="text-green-600 font-semibold">✅ Authenticated</span>
                    </div>
                    <div className="flex justify-between">
                      <span>User ID:</span>
                      <span className="font-mono text-sm">{authStatus.user?.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Google ID:</span>
                      <span className="font-mono text-sm">{authStatus.user?.google_id}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 p-6 rounded-lg">
                  <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
                  <div className="space-y-3">
                    <a
                      href="/dashboard"
                      className="block w-full bg-blue-600 hover:bg-blue-700 text-white text-center py-2 px-4 rounded-lg transition duration-200"
                    >
                      View Dashboard
                    </a>
                            <button
                              onClick={() => window.open(getApiUrl('api/dashboard/user-data'), '_blank')}
                              className="block w-full bg-green-600 hover:bg-green-700 text-white text-center py-2 px-4 rounded-lg transition duration-200"
                            >
                              Test Protected API
                            </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => window.location.reload()}
    >
      <AuthChecker />
    </ErrorBoundary>
  );
}
'use client';

import { useEffect, useState } from 'react';
import EmailTable from '../../components/EmailTable';

interface UserData {
  success: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    picture: string;
  };
  dummyData: {
    categories: Array<{
      id: number;
      name: string;
      description: string;
      emailCount: number;
      lastUpdated: string;
    }>;
    recentEmails: Array<{
      id: string;
      subject: string;
      from: string;
      category: string;
      summary: string;
      receivedAt: string;
    }>;
    stats: {
      totalEmails: number;
      categorizedToday: number;
      unreadCount: number;
      lastSync: string;
    };
  };
}

interface EmailSummary {
  summary: string;
  keyPoints: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  category: string;
  actionRequired: boolean;
  confidence: number;
}

interface EmailData {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  body: string;
  bodyHtml: string;
  bodyText: string;
  isRead: boolean;
  hasAttachments: boolean;
  labels: string[];
  aiSummary?: EmailSummary;
}

export default function Dashboard() {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emails, setEmails] = useState<EmailData[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importStats, setImportStats] = useState<{
    imported: number;
    skipped: number;
    archived: number;
    archiveFailed: number;
  } | null>(null);

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/dashboard/user-data', {
        credentials: 'include'
      });

      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/';
          return;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setUserData(data);
    } catch (error) {
      console.error('Error fetching user data:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch user data');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Less than an hour ago';
    if (diffInHours === 1) return '1 hour ago';
    if (diffInHours < 24) return `${diffInHours} hours ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return '1 day ago';
    return `${diffInDays} days ago`;
  };

  const importLatestEmails = async () => {
    setImportLoading(true);
    setImportError(null);
    
    try {
      const response = await fetch('http://localhost:3001/api/emails/import-latest', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to import emails');
      }

      const data = await response.json();
      setEmails(data.data.emails);
      
      // Set import statistics
      if (data.data.imported !== undefined) {
        setImportStats({
          imported: data.data.imported,
          skipped: data.data.skipped,
          archived: data.data.archived,
          archiveFailed: data.data.archiveFailed
        });
      }
      
    } catch (error) {
      console.error('Error importing emails:', error);
      setImportError(error instanceof Error ? error.message : 'Failed to import emails');
    } finally {
      setImportLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.href = '/'}
            className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (!userData) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <img
                src={userData.user.picture}
                alt="Profile"
                className="w-16 h-16 rounded-full mr-4"
              />
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  Welcome back, {userData.user.name}!
                </h1>
                <p className="text-gray-600">{userData.user.email}</p>
              </div>
            </div>
            <button
              onClick={() => window.location.href = '/'}
              className="bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-lg"
            >
              ← Back to Home
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">
                {userData.dummyData.stats.totalEmails}
              </div>
              <div className="text-gray-600">Total Emails</div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">
                {userData.dummyData.stats.categorizedToday}
              </div>
              <div className="text-gray-600">Categorized Today</div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-600">
                {userData.dummyData.stats.unreadCount}
              </div>
              <div className="text-gray-600">Unread</div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="text-center">
              <div className="text-sm font-semibold text-gray-600">Last Sync</div>
              <div className="text-sm text-gray-500">
                {formatTimeAgo(userData.dummyData.stats.lastSync)}
              </div>
            </div>
          </div>
        </div>

        {/* Email Import Section */}
        <div className="mb-8">
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">📧 Gmail Import</h2>
              <button
                onClick={importLatestEmails}
                disabled={importLoading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2 px-4 rounded-lg transition duration-200 flex items-center"
              >
                {importLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Importing & Analyzing...
                  </>
                ) : (
                  '🤖 Import & AI Analyze 10 Emails'
                )}
              </button>
            </div>
            
            {importError && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center">
                  <div className="text-red-600 text-xl mr-3">⚠️</div>
                  <div>
                    <h3 className="text-red-800 font-semibold">Import Error</h3>
                    <p className="text-red-700 text-sm">{importError}</p>
                  </div>
                </div>
              </div>
            )}

            {importStats && (
              <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center mb-2">
                  <div className="text-green-600 text-xl mr-3">✅</div>
                  <h3 className="text-green-800 font-semibold">Import Complete</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-700">{importStats.imported}</div>
                    <div className="text-green-600">Imported</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-700">{importStats.archived}</div>
                    <div className="text-blue-600">Archived</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-700">{importStats.skipped}</div>
                    <div className="text-yellow-600">Skipped</div>
                  </div>
                  {importStats.archiveFailed > 0 && (
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-700">{importStats.archiveFailed}</div>
                      <div className="text-red-600">Archive Failed</div>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <EmailTable emails={emails} loading={importLoading} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Categories */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold mb-4">Email Categories</h2>
            <div className="space-y-4">
              {userData.dummyData.categories.map((category) => (
                <div key={category.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-semibold">{category.name}</h3>
                    <span className="bg-blue-100 text-blue-800 text-sm font-medium px-2.5 py-0.5 rounded">
                      {category.emailCount} emails
                    </span>
                  </div>
                  <p className="text-gray-600 text-sm mb-2">{category.description}</p>
                  <p className="text-xs text-gray-500">
                    Updated: {formatTimeAgo(category.lastUpdated)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Emails */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold mb-4">Recent Emails</h2>
            <div className="space-y-4">
              {userData.dummyData.recentEmails.map((email) => (
                <div key={email.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-semibold truncate">{email.subject}</h3>
                    <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded ml-2">
                      {email.category}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-1">From: {email.from}</p>
                  <p className="text-sm text-gray-700 mb-2">{email.summary}</p>
                  <p className="text-xs text-gray-500">
                    {formatTimeAgo(email.receivedAt)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Debug Info */}
        <div className="mt-8 bg-gray-100 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-2">🔧 Debug Information</h3>
          <div className="text-sm text-gray-600 space-y-1">
            <p><strong>User ID:</strong> {userData.user.id}</p>
            <p><strong>Authentication:</strong> ✅ Success</p>
            <p><strong>API Response:</strong> ✅ Protected endpoint accessible</p>
            <p><strong>Timestamp:</strong> {formatDate(new Date().toISOString())}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

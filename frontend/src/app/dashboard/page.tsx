'use client';

import { useEffect, useState } from 'react';
import EmailTable from '../../components/EmailTable';
import { getApiUrl } from '../../lib/config';
import EmailRenderer from '../../components/EmailRenderer';

interface UserData {
  success: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    picture: string;
  };
  dummyData: {
    recentEmails: Array<{
      id: string;
      subject: string;
      from: string;
      category: string;
      summary: string;
      receivedAt: string;
    }>;
  };
}

interface Category {
  id: string;
  name: string;
  description: string;
  color: string;
  email_count: number;
  created_at: string;
  updated_at: string;
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [uncategorizedCount, setUncategorizedCount] = useState<number>(0);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createCategoryName, setCreateCategoryName] = useState('');
  const [createCategoryDescription, setCreateCategoryDescription] = useState('');
  const [createCategoryLoading, setCreateCategoryLoading] = useState(false);
  const [recategorizeLoading, setRecategorizeLoading] = useState(false);

  // All emails table state
  const [allEmails, setAllEmails] = useState<any[]>([]);
  const [allEmailsLoading, setAllEmailsLoading] = useState(false);
  const [allEmailsPage, setAllEmailsPage] = useState<number>(0);
  const [allEmailsTotal, setAllEmailsTotal] = useState<number>(0);
  const [viewingEmail, setViewingEmail] = useState<any | null>(null);
  const [viewingEmailLoading, setViewingEmailLoading] = useState(false);

  useEffect(() => {
    fetchUserData();
    fetchCategories();
    fetchAllEmails();
  }, []);

  useEffect(() => {
    fetchAllEmails();
  }, [allEmailsPage]);

  const fetchUserData = async () => {
    try {
      const response = await fetch(getApiUrl('api/dashboard/user-data'), {
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

  const fetchCategories = async () => {
    try {
      setCategoriesLoading(true);
      const response = await fetch(getApiUrl('api/categories'), {
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
      if (data.success) {
        setCategories(data.categories || []);
        setUncategorizedCount(data.uncategorizedCount || 0);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setCategoriesLoading(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!createCategoryName.trim() || !createCategoryDescription.trim()) {
      return;
    }

    setCreateCategoryLoading(true);
    try {
      const response = await fetch(getApiUrl('api/categories'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: createCategoryName.trim(),
          description: createCategoryDescription.trim()
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create category');
      }

      // Reset form and close modal
      setCreateCategoryName('');
      setCreateCategoryDescription('');
      setShowCreateModal(false);

      // Refresh categories list
      await fetchCategories();
    } catch (error) {
      console.error('Error creating category:', error);
      alert(error instanceof Error ? error.message : 'Failed to create category');
    } finally {
      setCreateCategoryLoading(false);
    }
  };

  const handleRecategorize = async () => {
    if (uncategorizedCount === 0) {
      alert('No uncategorized emails to recategorize.');
      return;
    }

    if (!confirm(`Recategorize ${uncategorizedCount} uncategorized emails using AI?`)) {
      return;
    }

    setRecategorizeLoading(true);
    try {
      const response = await fetch(getApiUrl('api/categories/recategorize'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to recategorize emails');
      }

      const data = await response.json();
      
      if (data.success) {
        alert(`Recategorization complete!\n\n${data.message}\n\nProcessed: ${data.stats.processed}\nCategorized: ${data.stats.categorized}\nKept Uncategorized: ${data.stats.keptUncategorized}\nSummaries Generated: ${data.stats.summariesGenerated || 0}\nFailed: ${data.stats.failed}`);
        
        // Refresh categories (emails will auto-refresh via useEffect)
        await fetchCategories();
      }
    } catch (error) {
      console.error('Error recategorizing emails:', error);
      alert(error instanceof Error ? error.message : 'Failed to recategorize emails');
    } finally {
      setRecategorizeLoading(false);
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

  const fetchAllEmails = async () => {
    try {
      setAllEmailsLoading(true);
      const limit = 10;
      const offset = allEmailsPage * limit;
      
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString()
      });
      // No categoryId filter - get all emails

      const response = await fetch(getApiUrl(`api/emails/imported?${params.toString()}`), {
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
      if (data.success && data.data) {
        const emails = data.data.emails || [];
        // Debug: Log first email to check category structure
        if (emails.length > 0) {
          console.log('Sample email category data:', emails[0].categories, 'Full email:', emails[0]);
        }
        setAllEmails(emails);
        setAllEmailsTotal(data.data.pagination?.total || 0);
      }
    } catch (error) {
      console.error('Error fetching all emails:', error);
    } finally {
      setAllEmailsLoading(false);
    }
  };

  const handleViewEmail = async (emailId: string) => {
    setViewingEmailLoading(true);
    try {
      const response = await fetch(getApiUrl(`api/emails/${emailId}`), {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch email');
      }

      const data = await response.json();
      if (data.success) {
        console.log('Email data received:', data.data);
        setViewingEmail(data.data);
      } else {
        throw new Error(data.message || 'Failed to fetch email');
      }
    } catch (error) {
      console.error('Error fetching email:', error);
      alert('Failed to load email content');
    } finally {
      setViewingEmailLoading(false);
    }
  };

  const importLatestEmails = async () => {
    setImportLoading(true);
    setImportError(null);
    
    try {
      const response = await fetch(getApiUrl('api/emails/import-latest'), {
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

        {/* All Emails Table Section */}
        <div className="mb-8">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold mb-4">All Emails</h2>
            
            {allEmailsLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading emails...</p>
              </div>
            ) : allEmails.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 text-4xl mb-4">📬</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Emails Found</h3>
                <p className="text-gray-600">No emails have been imported yet.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">From</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">AI Summary</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {allEmails.map((email) => (
                        <tr key={email.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{email.sender_name || email.sender_email}</div>
                            <div className="text-sm text-gray-500">{email.sender_email}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-gray-900">{email.subject || '(No Subject)'}</div>
                          </td>
                          <td className="px-6 py-4">
                            {email.ai_summary ? (
                              <div className="group relative">
                                <div className="text-sm text-gray-600 truncate max-w-xs cursor-help">
                                  {email.ai_summary.length > 50 
                                    ? `${email.ai_summary.substring(0, 50)}...` 
                                    : email.ai_summary}
                                </div>
                                <div className="absolute left-0 top-full mt-2 w-96 p-3 bg-gray-900 text-white text-sm rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible z-10 transition-all duration-200">
                                  <div className="font-semibold mb-2">AI Summary:</div>
                                  <div className="whitespace-normal">{email.ai_summary}</div>
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400 italic">No summary</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {email.categories ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
                                style={{
                                  backgroundColor: `${email.categories.color}20`,
                                  color: email.categories.color
                                }}
                              >
                                <div
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: email.categories.color }}
                                ></div>
                                {email.categories.name}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700">
                                <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                                Uncategorized
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(email.received_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <button
                              onClick={() => handleViewEmail(email.id)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Showing {allEmailsPage * 10 + 1} to {Math.min((allEmailsPage + 1) * 10, allEmailsTotal)} of {allEmailsTotal} emails
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAllEmailsPage(Math.max(0, allEmailsPage - 1))}
                      disabled={allEmailsPage === 0}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                        allEmailsPage === 0
                          ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      ← Previous
                    </button>
                    <button
                      onClick={() => setAllEmailsPage(allEmailsPage + 1)}
                      disabled={(allEmailsPage + 1) * 10 >= allEmailsTotal}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                        (allEmailsPage + 1) * 10 >= allEmailsTotal
                          ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              </>
            )}
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
            {categoriesLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading categories...</p>
              </div>
            ) : (
              <div className="space-y-2">
                {categories.map((category) => (
                  <div key={category.id} className="border rounded-lg p-3 hover:bg-gray-50" style={{ height: '60px' }}>
                    <div className="flex justify-between items-center h-full">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div 
                            className="w-3 h-3 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: category.color }}
                          ></div>
                          <h3 className="text-sm font-semibold truncate">{category.name}</h3>
                        </div>
                        <p className="text-xs text-gray-600 truncate">{category.description}</p>
                      </div>
                      <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded ml-2 flex-shrink-0">
                        {category.email_count}
                      </span>
                    </div>
                  </div>
                ))}
                
                {/* Uncategorized Category (virtual - always last) */}
                <div className="border rounded-lg p-3 bg-gray-50 opacity-75">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <svg className="w-3 h-3 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <h3 className="text-sm font-semibold text-gray-700">Uncategorized</h3>
                      </div>
                      <p className="text-xs text-gray-600 truncate">Emails that don't match any of your custom categories</p>
                    </div>
                    <span className="bg-gray-200 text-gray-700 text-xs font-medium px-2 py-1 rounded ml-2 flex-shrink-0">
                      {uncategorizedCount}
                    </span>
                  </div>
                  {uncategorizedCount > 0 && (
                    <button
                      onClick={handleRecategorize}
                      disabled={recategorizeLoading}
                      className="w-full mt-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {recategorizeLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Categorizing...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                          Recategorize with AI
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Create Category Button */}
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="w-full border-2 border-dashed border-gray-300 rounded-lg p-3 hover:border-blue-500 hover:bg-blue-50 transition-colors"
                >
                  <div className="flex items-center justify-center gap-2 text-gray-600 hover:text-blue-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="font-medium">Create Category</span>
                  </div>
                </button>
              </div>
            )}
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

      {/* View Email Modal */}
      {viewingEmail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-2xl font-bold">Email Details</h2>
              <button
                onClick={() => setViewingEmail(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {viewingEmailLoading ? (
              <div className="flex items-center justify-center p-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-3 text-gray-600">Loading email...</span>
              </div>
            ) : (
              <div className="overflow-y-auto p-6 flex-1">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-700">From:</span>
                      <div className="text-gray-600 break-all">{viewingEmail.sender_email}</div>
                      {viewingEmail.sender_name && (
                        <div className="text-gray-500 text-xs">{viewingEmail.sender_name}</div>
                      )}
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">To:</span>
                      <div className="text-gray-600 break-all">{viewingEmail.recipient_email}</div>
                    </div>
                  </div>
                  
                  <div>
                    <span className="font-medium text-gray-700">Subject:</span>
                    <div className="text-gray-900">{viewingEmail.subject || '(No Subject)'}</div>
                  </div>

                  <div>
                    <span className="font-medium text-gray-700">Date:</span>
                    <div className="text-gray-600">{new Date(viewingEmail.received_at).toLocaleString()}</div>
                  </div>

                  {viewingEmail.categories && (
                    <div>
                      <span className="font-medium text-gray-700">Category:</span>
                      <div className="mt-1">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
                          style={{
                            backgroundColor: `${viewingEmail.categories.color}20`,
                            color: viewingEmail.categories.color
                          }}
                        >
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: viewingEmail.categories.color }}
                          ></div>
                          {viewingEmail.categories.name}
                        </span>
                      </div>
                    </div>
                  )}

                  {viewingEmail.ai_summary && (
                    <div>
                      <span className="font-medium text-gray-700">AI Summary:</span>
                      <div className="text-gray-600 mt-1">{viewingEmail.ai_summary}</div>
                    </div>
                  )}

                  <div>
                    <span className="font-medium text-gray-700">Email Content:</span>
                    <div className="mt-2">
                      <EmailRenderer
                        htmlContent={viewingEmail.body_html}
                        textContent={viewingEmail.body_text}
                        fallbackContent={viewingEmail.subject || 'No content available'}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Category Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold mb-4">Create Category</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category Name *
                </label>
                <input
                  type="text"
                  value={createCategoryName}
                  onChange={(e) => setCreateCategoryName(e.target.value)}
                  placeholder="e.g., Work, Personal, Newsletters"
                  maxLength={255}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={createCategoryLoading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description *
                </label>
                <textarea
                  value={createCategoryDescription}
                  onChange={(e) => setCreateCategoryDescription(e.target.value)}
                  placeholder="Describe what types of emails belong in this category..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  disabled={createCategoryLoading}
                />
                <p className="text-xs text-gray-500 mt-1">
                  This description will help AI categorize emails accurately.
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setCreateCategoryName('');
                  setCreateCategoryDescription('');
                }}
                disabled={createCategoryLoading}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCategory}
                disabled={createCategoryLoading || !createCategoryName.trim() || !createCategoryDescription.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {createCategoryLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Creating...
                  </>
                ) : (
                  'Create'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

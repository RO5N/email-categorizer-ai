'use client';

import React, { useState } from 'react';
import EmailRenderer from './EmailRenderer';

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

interface EmailTableProps {
  emails: EmailData[];
  loading?: boolean;
}

export default function EmailTable({ emails, loading = false }: EmailTableProps) {
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [hoveredSummary, setHoveredSummary] = useState<string | null>(null);

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return dateString;
    }
  };

  const formatSender = (from: string) => {
    // Extract name from "Name <email@domain.com>" format
    const match = from.match(/^(.+?)\s*<(.+)>$/);
    if (match) {
      return match[1].replace(/"/g, ''); // Remove quotes
    }
    return from;
  };

  const toggleExpand = (emailId: string) => {
    setExpandedEmail(expandedEmail === emailId ? null : emailId);
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return 'text-green-600 bg-green-50';
      case 'negative': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getSentimentEmoji = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return '😊';
      case 'negative': return '😟';
      default: return '😐';
    }
  };

  const AITooltip = ({ email, children }: { email: EmailData; children: React.ReactNode }) => {
    if (!email.aiSummary) return <>{children}</>;

    return (
      <div className="relative group">
        {children}
        <div className="absolute z-50 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-80 max-w-screen-sm">
          <div className="bg-gray-900 text-white text-sm rounded-lg p-4 shadow-xl">
            <div className="mb-3">
              <div className="font-semibold text-blue-300 mb-1">🤖 AI Analysis</div>
              <div className="text-gray-100">{email.aiSummary.summary}</div>
            </div>
            
            {email.aiSummary.keyPoints.length > 0 && (
              <div className="mb-3">
                <div className="font-semibold text-blue-300 mb-1">Key Points:</div>
                <ul className="list-disc list-inside text-gray-200 space-y-1">
                  {email.aiSummary.keyPoints.slice(0, 3).map((point, index) => (
                    <li key={index} className="text-xs">{point}</li>
                  ))}
                  {email.aiSummary.keyPoints.length > 3 && (
                    <li className="text-xs text-gray-400">+{email.aiSummary.keyPoints.length - 3} more...</li>
                  )}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <span className={`px-2 py-1 rounded-full ${getSentimentColor(email.aiSummary.sentiment)}`}>
                  {getSentimentEmoji(email.aiSummary.sentiment)} {email.aiSummary.sentiment}
                </span>
                {email.aiSummary.actionRequired && (
                  <span className="px-2 py-1 rounded-full bg-orange-200 text-orange-800">
                    ⚡ Action Required
                  </span>
                )}
              </div>
              <div className="text-gray-400">
                {Math.round(email.aiSummary.confidence * 100)}% confidence
              </div>
            </div>
            
            {/* Tooltip arrow */}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded mb-4"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center">
        <div className="text-gray-500 text-lg mb-2">📭</div>
        <h3 className="text-lg font-semibold text-gray-700 mb-2">No Emails Found</h3>
        <p className="text-gray-500">No emails were found in your Gmail inbox.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">
          📧 Latest Emails ({emails.length})
        </h3>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                From
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Subject
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                AI Summary
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {emails.map((email) => (
              <React.Fragment key={email.id}>
                <tr 
                  className={`hover:bg-gray-50 ${!email.isRead ? 'bg-blue-50' : ''}`}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      {!email.isRead && (
                        <div className="w-2 h-2 bg-blue-600 rounded-full" title="Unread"></div>
                      )}
                      {email.hasAttachments && (
                        <div className="text-gray-500" title="Has attachments">📎</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900 truncate max-w-xs">
                      {formatSender(email.from)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className={`text-sm ${!email.isRead ? 'font-semibold text-gray-900' : 'text-gray-700'} truncate max-w-md`}>
                      {email.subject || '(No Subject)'}
                    </div>
                    <div className="text-xs text-gray-500 truncate max-w-md">
                      {email.snippet}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {email.aiSummary ? (
                      <AITooltip email={email}>
                        <div className="max-w-xs cursor-help">
                          <div className="text-sm text-gray-900 truncate mb-1">
                            {email.aiSummary.summary}
                          </div>
                          <div className="flex items-center space-x-1 flex-wrap gap-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getSentimentColor(email.aiSummary.sentiment)}`}>
                              {getSentimentEmoji(email.aiSummary.sentiment)}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {email.aiSummary.category}
                            </span>
                            {email.aiSummary.actionRequired && (
                              <span className="inline-flex items-center px-1 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                ⚡
                              </span>
                            )}
                          </div>
                        </div>
                      </AITooltip>
                    ) : (
                      <div className="text-sm text-gray-400 italic">
                        No AI summary available
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(email.date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      onClick={() => toggleExpand(email.id)}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {expandedEmail === email.id ? 'Hide Details' : 'View Full Email'}
                    </button>
                  </td>
                </tr>
                
                {expandedEmail === email.id && (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 bg-gray-50">
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="font-medium text-gray-700">From:</span>
                            <div className="text-gray-600 break-all">{email.from}</div>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">To:</span>
                            <div className="text-gray-600 break-all">{email.to}</div>
                          </div>
                        </div>
                        
                        <div>
                          <span className="font-medium text-gray-700">Subject:</span>
                          <div className="text-gray-600">{email.subject || '(No Subject)'}</div>
                        </div>
                        
                        <div>
                          <span className="font-medium text-gray-700">Full Email Content:</span>
                          <EmailRenderer 
                            htmlContent={email.bodyHtml}
                            textContent={email.bodyText}
                            fallbackContent={email.body || email.snippet}
                          />
                        </div>

                        {email.aiSummary && (
                          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                            <h4 className="font-semibold text-blue-900 mb-3">🤖 AI Analysis</h4>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                              <div>
                                <span className="font-medium text-blue-800">Summary:</span>
                                <div className="text-blue-700 mt-1">{email.aiSummary.summary}</div>
                              </div>
                              <div>
                                <span className="font-medium text-blue-800">Category:</span>
                                <div className="text-blue-700 mt-1">{email.aiSummary.category}</div>
                              </div>
                            </div>

                            {email.aiSummary.keyPoints.length > 0 && (
                              <div className="mb-3">
                                <span className="font-medium text-blue-800">Key Points:</span>
                                <ul className="list-disc list-inside text-blue-700 mt-1 space-y-1">
                                  {email.aiSummary.keyPoints.map((point, index) => (
                                    <li key={index}>{point}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            <div className="flex items-center space-x-4 text-sm">
                              <div className="flex items-center space-x-2">
                                <span className="font-medium text-blue-800">Sentiment:</span>
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getSentimentColor(email.aiSummary.sentiment)}`}>
                                  {getSentimentEmoji(email.aiSummary.sentiment)} {email.aiSummary.sentiment}
                                </span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="font-medium text-blue-800">Action Required:</span>
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${email.aiSummary.actionRequired ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}`}>
                                  {email.aiSummary.actionRequired ? '⚡ Yes' : '✅ No'}
                                </span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="font-medium text-blue-800">Confidence:</span>
                                <span className="text-blue-700">{Math.round(email.aiSummary.confidence * 100)}%</span>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        <div className="flex flex-wrap gap-2">
                          <span className="font-medium text-gray-700">Labels:</span>
                          {email.labels.map((label) => (
                            <span 
                              key={label}
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                        
                        <div className="text-xs text-gray-500">
                          <span className="font-medium">Email ID:</span> {email.id}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

'use client';

import React, { useState } from 'react';

interface EmailData {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  isRead: boolean;
  hasAttachments: boolean;
  labels: string[];
}

interface EmailTableProps {
  emails: EmailData[];
  loading?: boolean;
}

export default function EmailTable({ emails, loading = false }: EmailTableProps) {
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);

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
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(email.date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      onClick={() => toggleExpand(email.id)}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {expandedEmail === email.id ? 'Hide' : 'View'}
                    </button>
                  </td>
                </tr>
                
                {expandedEmail === email.id && (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 bg-gray-50">
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
                          <span className="font-medium text-gray-700">Preview:</span>
                          <div className="text-gray-600 bg-white p-3 rounded border">
                            {email.snippet || 'No preview available'}
                          </div>
                        </div>
                        
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

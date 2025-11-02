'use client';

import DOMPurify from 'dompurify';
import { useState } from 'react';

interface EmailRendererProps {
  htmlContent?: string;
  textContent?: string;
  fallbackContent?: string;
}

export default function EmailRenderer({ htmlContent, textContent, fallbackContent }: EmailRendererProps) {
  const [viewMode, setViewMode] = useState<'html' | 'text'>('html');
  const [isExpanded, setIsExpanded] = useState(false);

  // Sanitize HTML content for security
  const sanitizedHtml = htmlContent ? DOMPurify.sanitize(htmlContent, {
    ALLOWED_TAGS: [
      'p', 'br', 'div', 'span', 'a', 'strong', 'b', 'em', 'i', 'u', 
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote',
      'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img', 'hr'
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'style', 'class', 'target',
      'width', 'height', 'border', 'cellpadding', 'cellspacing'
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
  }) : '';

  const hasHtml = htmlContent && htmlContent.trim().length > 0;
  const hasText = textContent && textContent.trim().length > 0;
  const content = fallbackContent || textContent || 'No content available';

  if (!hasHtml && !hasText) {
    return (
      <div className="text-gray-500 italic p-4 bg-gray-50 rounded border">
        {fallbackContent || 'No email content available'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* View Mode Toggle */}
      {hasHtml && hasText && (
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium text-gray-700">View:</span>
          <button
            onClick={() => setViewMode('html')}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              viewMode === 'html'
                ? 'bg-blue-100 text-blue-700 font-medium'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            📧 Rich HTML
          </button>
          <button
            onClick={() => setViewMode('text')}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              viewMode === 'text'
                ? 'bg-blue-100 text-blue-700 font-medium'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            📝 Plain Text
          </button>
        </div>
      )}

      {/* Email Content */}
      <div className={`bg-white border rounded-lg overflow-hidden ${isExpanded ? '' : 'max-h-96'}`}>
        {viewMode === 'html' && hasHtml ? (
          <div 
            className="email-content p-4 overflow-auto"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            style={{
              maxHeight: isExpanded ? 'none' : '24rem',
              fontSize: '14px',
              lineHeight: '1.5'
            }}
          />
        ) : (
          <div 
            className="p-4 whitespace-pre-wrap break-words text-gray-700 overflow-auto"
            style={{
              maxHeight: isExpanded ? 'none' : '24rem',
              fontSize: '14px',
              lineHeight: '1.5'
            }}
          >
            {textContent || content}
          </div>
        )}
      </div>

      {/* Expand/Collapse Button */}
      {(htmlContent || textContent) && ((htmlContent?.length || 0) > 1000 || (textContent?.length || 0) > 1000) && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          {isExpanded ? '📄 Show Less' : '📄 Show Full Email'}
        </button>
      )}

      {/* Email Content Styles */}
      <style jsx>{`
        .email-content {
          /* Reset some email styles that might break layout */
        }
        .email-content img {
          max-width: 100% !important;
          height: auto !important;
        }
        .email-content table {
          max-width: 100% !important;
          border-collapse: collapse;
        }
        .email-content td, .email-content th {
          padding: 4px 8px;
          border: 1px solid #e5e7eb;
        }
        .email-content a {
          color: #2563eb;
          text-decoration: underline;
        }
        .email-content a:hover {
          color: #1d4ed8;
        }
        .email-content blockquote {
          border-left: 4px solid #e5e7eb;
          margin: 16px 0;
          padding-left: 16px;
          color: #6b7280;
        }
        .email-content h1, .email-content h2, .email-content h3 {
          margin: 16px 0 8px 0;
          font-weight: 600;
        }
        .email-content p {
          margin: 8px 0;
        }
        .email-content ul, .email-content ol {
          margin: 8px 0;
          padding-left: 20px;
        }
      `}</style>
    </div>
  );
}

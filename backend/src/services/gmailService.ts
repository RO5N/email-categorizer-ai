import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

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
}

interface GmailTokens {
  access_token: string;
  refresh_token?: string;
}

class GmailService {
  private oauth2Client: OAuth2Client;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  /**
   * Set user credentials for Gmail API access
   */
  setCredentials(tokens: GmailTokens) {
    this.oauth2Client.setCredentials(tokens);
  }

  /**
   * Fetch latest 10 emails from user's Gmail
   */
  async fetchLatest10Emails(): Promise<EmailData[]> {
    try {
      const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

      // Get list of latest 10 messages
      const listResponse = await gmail.users.messages.list({
        userId: 'me',
        maxResults: 10,
        q: 'in:inbox', // Only inbox emails
      });

      const messages = listResponse.data.messages || [];
      
      if (messages.length === 0) {
        return [];
      }

      // Fetch details for each message
      const emailPromises = messages.map(async (message) => {
        const messageResponse = await gmail.users.messages.get({
          userId: 'me',
          id: message.id!,
          format: 'full',
        });

        return this.parseEmailData(messageResponse.data);
      });

      const emails = await Promise.all(emailPromises);
      return emails.filter(email => email !== null) as EmailData[];

    } catch (error) {
      console.error('Error fetching emails:', error);
      throw new Error('Failed to fetch emails from Gmail');
    }
  }

  /**
   * Parse Gmail message data into our EmailData format
   */
  private parseEmailData(message: any): EmailData | null {
    try {
      const headers = message.payload?.headers || [];
      const getHeader = (name: string) => 
        headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

      // Check if email is read (not in UNREAD label)
      const isRead = !message.labelIds?.includes('UNREAD');

      // Check for attachments
      const hasAttachments = this.hasAttachments(message.payload);

      // Extract email body content
      const emailContent = this.extractEmailContent(message.payload);

      return {
        id: message.id,
        threadId: message.threadId,
        subject: getHeader('Subject') || '(No Subject)',
        from: getHeader('From'),
        to: getHeader('To'),
        date: getHeader('Date'),
        snippet: message.snippet || '',
        body: emailContent.text || emailContent.html || '',
        bodyHtml: emailContent.html,
        bodyText: emailContent.text,
        isRead,
        hasAttachments,
        labels: message.labelIds || [],
      };
    } catch (error) {
      console.error('Error parsing email data:', error);
      return null;
    }
  }

  /**
   * Extract email content (both HTML and text) from Gmail payload
   */
  private extractEmailContent(payload: any): { html: string; text: string } {
    if (!payload) return { html: '', text: '' };

    let htmlContent = '';
    let textContent = '';

    try {
      // If payload has parts, extract both HTML and text
      if (payload.parts) {
        for (const part of payload.parts) {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            textContent = Buffer.from(part.body.data, 'base64').toString('utf-8');
          } else if (part.mimeType === 'text/html' && part.body?.data) {
            htmlContent = Buffer.from(part.body.data, 'base64').toString('utf-8');
          }
        }

        // Check nested parts (multipart/alternative, etc.)
        if (!htmlContent && !textContent) {
          for (const part of payload.parts) {
            if (part.parts) {
              const nestedContent = this.extractEmailContent(part);
              if (!htmlContent && nestedContent.html) htmlContent = nestedContent.html;
              if (!textContent && nestedContent.text) textContent = nestedContent.text;
            }
          }
        }
      }

      // If no parts, check if body data is directly available
      if (!htmlContent && !textContent && payload.body?.data) {
        const content = Buffer.from(payload.body.data, 'base64').toString('utf-8');
        if (payload.mimeType === 'text/html') {
          htmlContent = content;
        } else {
          textContent = content;
        }
      }

      // If we only have HTML, generate text version for AI processing
      if (htmlContent && !textContent) {
        textContent = this.stripHtmlTags(htmlContent);
      }

      return { html: htmlContent, text: textContent };
    } catch (error) {
      console.error('Error extracting email content:', error);
      return { html: '', text: '' };
    }
  }

  /**
   * Strip HTML tags from content
   */
  private stripHtmlTags(html: string): string {
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
      .replace(/&amp;/g, '&') // Replace &amp; with &
      .replace(/&lt;/g, '<') // Replace &lt; with <
      .replace(/&gt;/g, '>') // Replace &gt; with >
      .replace(/&quot;/g, '"') // Replace &quot; with "
      .replace(/&#39;/g, "'") // Replace &#39; with '
      .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
      .trim();
  }

  /**
   * Check if email has attachments
   */
  private hasAttachments(payload: any): boolean {
    if (!payload) return false;

    // Check if payload has parts with attachments
    if (payload.parts) {
      return payload.parts.some((part: any) => 
        part.filename && part.filename.length > 0
      );
    }

    // Check if main payload is an attachment
    return payload.filename && payload.filename.length > 0;
  }

  /**
   * Get user's Gmail profile info
   */
  async getProfile() {
    try {
      const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
      const response = await gmail.users.getProfile({
        userId: 'me',
      });
      
      return response.data;
    } catch (error) {
      console.error('Error fetching Gmail profile:', error);
      throw new Error('Failed to fetch Gmail profile');
    }
  }
}

export { GmailService, EmailData, GmailTokens };

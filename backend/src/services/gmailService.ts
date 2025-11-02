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
   * Archive emails in Gmail (remove from inbox)
   */
  async archiveEmails(messageIds: string[]): Promise<{ success: string[]; failed: string[] }> {
    try {
      const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
      const success: string[] = [];
      const failed: string[] = [];

      // Archive emails in batches to avoid rate limits
      const batchSize = 10;
      for (let i = 0; i < messageIds.length; i += batchSize) {
        const batch = messageIds.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (messageId) => {
          try {
            console.log(`🔍 Attempting to modify labels for email ${messageId}...`);
            const response = await gmail.users.messages.modify({
              userId: 'me',
              id: messageId,
              requestBody: {
                removeLabelIds: ['INBOX'] // Remove from inbox = archive
              }
            });
            console.log(`✅ Successfully modified labels for email ${messageId}:`, response.data);
            success.push(messageId);
          } catch (error) {
            console.error(`❌ Failed to archive email ${messageId}:`, error);
            
            // Extract detailed error information
            const errorDetails = {
              message: error instanceof Error ? error.message : String(error),
              status: (error as any)?.status,
              statusText: (error as any)?.statusText,
              code: (error as any)?.code,
              errors: (error as any)?.errors,
              response: (error as any)?.response?.data,
              config: (error as any)?.config,
              request: (error as any)?.request ? 'Request made' : 'No request'
            };
            
            console.error(`❌ Detailed error for ${messageId}:`, JSON.stringify(errorDetails, null, 2));
            
            // Check if it's a 400 error (Bad Request) which might indicate the email is already archived
            if ((error as any)?.status === 400) {
              console.log(`⚠️ Email ${messageId} returned 400 - might already be archived or have special restrictions`);
            }
            
            failed.push(messageId);
          }
        });

        await Promise.all(batchPromises);

        // Add delay between batches to respect rate limits
        if (i + batchSize < messageIds.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      console.log(`Archived ${success.length} emails, failed ${failed.length}`);
      return { success, failed };

    } catch (error) {
      console.error('Error archiving emails:', error);
      throw new Error('Failed to archive emails in Gmail');
    }
  }

  /**
   * Archive a single email in Gmail
   */
  async archiveEmail(messageId: string): Promise<boolean> {
    try {
      console.log(`🔍 Archiving single email ${messageId}...`);
      const result = await this.archiveEmails([messageId]);
      const success = result.success.includes(messageId);
      
      if (success) {
        console.log(`✅ Single email ${messageId} archived successfully`);
      } else {
        console.log(`❌ Single email ${messageId} archive failed`);
      }
      
      return success;
    } catch (error) {
      console.error(`❌ Error archiving single email ${messageId}:`, error);
      return false;
    }
  }

  /**
   * Archive a single email with detailed error response
   */
  async archiveEmailWithDetails(messageId: string): Promise<{ success: boolean; error?: any }> {
    try {
      console.log(`🔍 Archiving email ${messageId} with detailed logging...`);
      
      const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
      
      const response = await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['INBOX']
        }
      });
      
      console.log(`✅ Archive successful for ${messageId}:`, response.data);
      return { success: true };
      
    } catch (error) {
      console.error(`❌ Archive failed for ${messageId}:`, error);
      
      const errorDetails = {
        message: error instanceof Error ? error.message : String(error),
        status: (error as any)?.status,
        statusText: (error as any)?.statusText,
        code: (error as any)?.code,
        errors: (error as any)?.errors,
        response: (error as any)?.response?.data
      };
      
      console.error(`❌ Detailed error:`, JSON.stringify(errorDetails, null, 2));
      
      return { 
        success: false, 
        error: errorDetails
      };
    }
  }

  /**
   * Get current email details to verify it still exists
   */
  async getEmailDetails(messageId: string): Promise<any> {
    try {
      const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'minimal'
      });
      return response.data;
    } catch (error) {
      console.error(`Failed to get email details for ${messageId}:`, error);
      throw error;
    }
  }

  /**
   * Check if emails are archived in Gmail
   */
  async checkArchivedStatus(messageIds: string[]): Promise<Record<string, boolean>> {
    try {
      const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
      const status: Record<string, boolean> = {};

      // Check in batches
      const batchSize = 10;
      for (let i = 0; i < messageIds.length; i += batchSize) {
        const batch = messageIds.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (messageId) => {
          try {
            const response = await gmail.users.messages.get({
              userId: 'me',
              id: messageId,
              format: 'minimal'
            });
            
            // Email is archived if it doesn't have INBOX label
            const isArchived = !response.data.labelIds?.includes('INBOX');
            status[messageId] = isArchived;
          } catch (error) {
            console.error(`Failed to check status for email ${messageId}:`, error);
            status[messageId] = false;
          }
        });

        await Promise.all(batchPromises);
      }

      return status;
    } catch (error) {
      console.error('Error checking archived status:', error);
      throw error;
    }
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

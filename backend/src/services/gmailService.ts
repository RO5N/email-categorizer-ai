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
  expiry_date?: number; // Optional: timestamp in milliseconds when token expires
}

class GmailService {
  private oauth2Client: OAuth2Client;
  private userId?: string; // Store userId for token refresh callbacks
  private tokenRefreshCallback?: (newTokens: GmailTokens) => Promise<void>; // Callback to update tokens in database

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    // Configure OAuth2Client to automatically refresh tokens
    this.oauth2Client.on('tokens', (tokens) => {
      if (tokens.access_token && this.tokenRefreshCallback) {
        // When tokens are refreshed, update database via callback
        this.tokenRefreshCallback({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || undefined
        }).catch(err => {
          console.error('❌ [Gmail Service] Failed to update tokens in database after refresh:', err);
        });
      }
    });
  }

  /**
   * Set user credentials for Gmail API access
   * @param tokens - User's OAuth tokens
   * @param userId - Optional: User ID for token refresh callbacks
   * @param tokenRefreshCallback - Optional: Callback to update tokens in database when refreshed
   */
  setCredentials(
    tokens: GmailTokens, 
    userId?: string, 
    tokenRefreshCallback?: (newTokens: GmailTokens) => Promise<void>
  ) {
    this.userId = userId;
    this.tokenRefreshCallback = tokenRefreshCallback;
    
    console.log('🔍 [DEBUG] setCredentials called with:', {
      userId: userId || 'not provided',
      hasAccessToken: !!tokens.access_token,
      accessTokenLength: tokens.access_token?.length || 0,
      accessTokenPreview: tokens.access_token ? tokens.access_token.substring(0, 20) + '...' : 'none',
      hasRefreshToken: !!tokens.refresh_token,
      refreshTokenLength: tokens.refresh_token?.length || 0,
      refreshTokenPreview: tokens.refresh_token ? tokens.refresh_token.substring(0, 20) + '...' : 'none',
      hasCallback: !!tokenRefreshCallback
    });
    
    // Build credentials object - include expiry_date if provided
    const credentials: any = {
      access_token: tokens.access_token
    };
    
    if (tokens.refresh_token) {
      credentials.refresh_token = tokens.refresh_token;
      console.log('✅ [Gmail Service] Setting credentials with refresh_token');
    } else {
      console.error('❌ [Gmail Service] No refresh_token provided! This will cause token refresh to fail.');
      console.error('❌ [Gmail Service] Credentials:', {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        userId: userId || 'not provided'
      });
    }
    
    // CRITICAL: Set expiry_date if provided - this tells OAuth2Client when token expires
    if (tokens.expiry_date) {
      credentials.expiry_date = tokens.expiry_date;
      console.log('✅ [Gmail Service] Setting expiry_date:', {
        expiryDate: tokens.expiry_date,
        expiryDateISO: new Date(tokens.expiry_date).toISOString(),
        now: new Date().toISOString(),
        isExpired: tokens.expiry_date <= Date.now()
      });
    } else {
      console.warn('⚠️ [Gmail Service] No expiry_date provided - OAuth2Client will not know when token expires');
    }
    
    console.log('🔍 [DEBUG] OAuth2Client credentials BEFORE setCredentials:', {
      hasAccessToken: !!this.oauth2Client.credentials.access_token,
      hasRefreshToken: !!this.oauth2Client.credentials.refresh_token,
      expiryDate: this.oauth2Client.credentials.expiry_date ? new Date(this.oauth2Client.credentials.expiry_date).toISOString() : 'none',
      expiryDateTimestamp: this.oauth2Client.credentials.expiry_date || 'none'
    });
    
    this.oauth2Client.setCredentials(credentials);
    
    console.log('🔍 [DEBUG] OAuth2Client credentials AFTER setCredentials:', {
      hasAccessToken: !!this.oauth2Client.credentials.access_token,
      hasRefreshToken: !!this.oauth2Client.credentials.refresh_token,
      expiryDate: this.oauth2Client.credentials.expiry_date ? new Date(this.oauth2Client.credentials.expiry_date).toISOString() : 'none',
      expiryDateTimestamp: this.oauth2Client.credentials.expiry_date || 'none',
      tokenType: this.oauth2Client.credentials.token_type || 'none'
    });
  }

  /**
   * Ensure access token is valid, refresh if expired
   * This should be called before making Gmail API calls
   */
  async ensureValidToken(): Promise<void> {
    console.log('🔍 [DEBUG] ensureValidToken() called');
    console.log('🔍 [DEBUG] Current OAuth2Client credentials:', {
      hasAccessToken: !!this.oauth2Client.credentials.access_token,
      accessTokenPreview: this.oauth2Client.credentials.access_token ? this.oauth2Client.credentials.access_token.substring(0, 20) + '...' : 'none',
      hasRefreshToken: !!this.oauth2Client.credentials.refresh_token,
      refreshTokenPreview: this.oauth2Client.credentials.refresh_token ? this.oauth2Client.credentials.refresh_token.substring(0, 20) + '...' : 'none',
      expiryDate: this.oauth2Client.credentials.expiry_date ? new Date(this.oauth2Client.credentials.expiry_date).toISOString() : 'none',
      expiryDateTimestamp: this.oauth2Client.credentials.expiry_date || 'none',
      now: new Date().toISOString(),
      nowTimestamp: Date.now()
    });
    
    try {
      // Check if token is expired or about to expire (within 5 minutes)
      const expiryDate = this.oauth2Client.credentials.expiry_date;
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;
      
      console.log('🔍 [DEBUG] Token expiry check:', {
        expiryDate: expiryDate || 'none',
        expiryDateISO: expiryDate ? new Date(expiryDate).toISOString() : 'none',
        now: now,
        nowISO: new Date(now).toISOString(),
        timeUntilExpiry: expiryDate ? (expiryDate - now) : 'unknown',
        needsRefresh: !expiryDate || expiryDate <= (now + fiveMinutes)
      });
      
      if (!expiryDate || expiryDate <= (now + fiveMinutes)) {
        console.log('🔄 [Gmail Service] Token expired or expiring soon, refreshing...');
        
        // Check if we have a refresh_token
        if (!this.oauth2Client.credentials.refresh_token) {
          console.error('❌ [DEBUG] No refresh_token in OAuth2Client credentials!');
          console.error('❌ [DEBUG] Full credentials object:', {
            ...this.oauth2Client.credentials,
            access_token: this.oauth2Client.credentials.access_token ? 'REDACTED' : 'none',
            refresh_token: this.oauth2Client.credentials.refresh_token ? 'REDACTED' : 'none'
          });
          throw new Error('No refresh token available. Please re-authenticate.');
        }

        console.log('🔍 [DEBUG] About to call getAccessToken()...');
        console.log('🔍 [DEBUG] OAuth2Client before getAccessToken:', {
          hasAccessToken: !!this.oauth2Client.credentials.access_token,
          hasRefreshToken: !!this.oauth2Client.credentials.refresh_token,
          expiryDate: this.oauth2Client.credentials.expiry_date || 'none'
        });

        // Get a new access token (OAuth2Client will use refresh_token automatically)
        const tokenResult = await this.oauth2Client.getAccessToken();
        console.log('🔍 [DEBUG] getAccessToken() returned:', {
          hasToken: !!tokenResult.token,
          tokenPreview: tokenResult.token ? tokenResult.token.substring(0, 20) + '...' : 'none',
          res: tokenResult.res ? 'Response object exists' : 'No response object'
        });
        
        if (tokenResult.token) {
          // Update credentials with new token
          const currentCredentials = this.oauth2Client.credentials;
          console.log('🔍 [DEBUG] Updating OAuth2Client credentials with new token...');
          console.log('🔍 [DEBUG] Current credentials before update:', {
            hasAccessToken: !!currentCredentials.access_token,
            hasRefreshToken: !!currentCredentials.refresh_token,
            expiryDate: currentCredentials.expiry_date || 'none'
          });
          
          this.oauth2Client.setCredentials({
            ...currentCredentials,
            access_token: tokenResult.token,
            expiry_date: currentCredentials.expiry_date || (now + 3600 * 1000) // Default 1 hour if not provided
          });

          console.log('🔍 [DEBUG] OAuth2Client credentials AFTER update:', {
            hasAccessToken: !!this.oauth2Client.credentials.access_token,
            accessTokenPreview: this.oauth2Client.credentials.access_token ? this.oauth2Client.credentials.access_token.substring(0, 20) + '...' : 'none',
            hasRefreshToken: !!this.oauth2Client.credentials.refresh_token,
            expiryDate: this.oauth2Client.credentials.expiry_date ? new Date(this.oauth2Client.credentials.expiry_date).toISOString() : 'none',
            expiryDateTimestamp: this.oauth2Client.credentials.expiry_date || 'none'
          });

          // If we have a callback, update database with new token
          if (this.tokenRefreshCallback) {
            console.log('🔍 [DEBUG] Calling tokenRefreshCallback to update database...');
            try {
              await this.tokenRefreshCallback({
                access_token: tokenResult.token,
                refresh_token: this.oauth2Client.credentials.refresh_token
              });
              console.log('✅ [DEBUG] tokenRefreshCallback completed successfully');
            } catch (callbackError) {
              console.error('❌ [DEBUG] tokenRefreshCallback failed:', callbackError);
              // Don't throw - token is refreshed, callback failure is not critical
            }
          } else {
            console.log('⚠️ [DEBUG] No tokenRefreshCallback provided, database will not be updated');
          }

          console.log('✅ [Gmail Service] Token refreshed successfully');
        } else {
          console.error('❌ [DEBUG] getAccessToken() returned no token!');
          throw new Error('getAccessToken() returned no token');
        }
      } else {
        console.log('✅ [Gmail Service] Token is still valid, no refresh needed');
        console.log('🔍 [DEBUG] Token valid until:', new Date(expiryDate).toISOString());
      }
      
      console.log('🔍 [DEBUG] Final OAuth2Client credentials after ensureValidToken:', {
        hasAccessToken: !!this.oauth2Client.credentials.access_token,
        accessTokenPreview: this.oauth2Client.credentials.access_token ? this.oauth2Client.credentials.access_token.substring(0, 20) + '...' : 'none',
        hasRefreshToken: !!this.oauth2Client.credentials.refresh_token,
        expiryDate: this.oauth2Client.credentials.expiry_date ? new Date(this.oauth2Client.credentials.expiry_date).toISOString() : 'none'
      });
      
    } catch (error) {
      console.error('❌ [Gmail Service] Failed to refresh token:', error);
      console.error('❌ [DEBUG] Error details:', {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : 'unknown',
        stack: error instanceof Error ? error.stack : 'no stack',
        cause: error instanceof Error && (error as any).cause ? (error as any).cause : 'no cause'
      });
      console.error('❌ [DEBUG] OAuth2Client credentials at error time:', {
        hasAccessToken: !!this.oauth2Client.credentials.access_token,
        hasRefreshToken: !!this.oauth2Client.credentials.refresh_token,
        expiryDate: this.oauth2Client.credentials.expiry_date || 'none'
      });
      throw new Error('Failed to refresh Gmail access token. Please re-authenticate.');
    }
  }

  /**
   * Fetch latest 10 emails from user's Gmail
   */
  async fetchLatest10Emails(): Promise<EmailData[]> {
    try {
      // Ensure token is valid before making API call
      await this.ensureValidToken();
      
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
      // Ensure token is valid before making API call
      await this.ensureValidToken();
      
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
      // Ensure token is valid before making API call
      await this.ensureValidToken();
      
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
      // Ensure token is valid before making API call
      await this.ensureValidToken();
      
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
      // Ensure token is valid before making API call
      await this.ensureValidToken();
      
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
      // Ensure token is valid before making API call
      await this.ensureValidToken();
      
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

  /**
   * Fetch new emails since a specific history ID
   * Used for webhook notifications
   * @param startHistoryId - The previous historyId to compare against (not the new one from notification)
   */
  async fetchEmailsSinceHistoryId(startHistoryId: string): Promise<EmailData[]> {
    try {
      // Ensure token is valid before making API call
      await this.ensureValidToken();
      
      console.log('🔍 [DEBUG] OAuth2Client credentials RIGHT BEFORE API call:', {
        hasAccessToken: !!this.oauth2Client.credentials.access_token,
        accessTokenPreview: this.oauth2Client.credentials.access_token ? this.oauth2Client.credentials.access_token.substring(0, 30) + '...' : 'none',
        accessTokenLength: this.oauth2Client.credentials.access_token?.length || 0,
        hasRefreshToken: !!this.oauth2Client.credentials.refresh_token,
        expiryDate: this.oauth2Client.credentials.expiry_date ? new Date(this.oauth2Client.credentials.expiry_date).toISOString() : 'none',
        tokenType: this.oauth2Client.credentials.token_type || 'none'
      });
      
      // Get access token explicitly to ensure it's set
      const currentToken = await this.oauth2Client.getAccessToken();
      console.log('🔍 [DEBUG] getAccessToken() right before API call returned:', {
        hasToken: !!currentToken.token,
        tokenPreview: currentToken.token ? currentToken.token.substring(0, 30) + '...' : 'none',
        tokenLength: currentToken.token?.length || 0,
        matchesStored: currentToken.token === this.oauth2Client.credentials.access_token
      });
      
      // Update credentials with the token from getAccessToken (in case it was refreshed)
      if (currentToken.token && currentToken.token !== this.oauth2Client.credentials.access_token) {
        console.log('🔍 [DEBUG] Token changed after getAccessToken(), updating credentials...');
        this.oauth2Client.setCredentials({
          ...this.oauth2Client.credentials,
          access_token: currentToken.token
        });
      }
      
      const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

      console.log(`🔍 [Gmail Service] Fetching history since: ${startHistoryId}`);
      console.log('🔍 [DEBUG] About to make Gmail API call with auth:', {
        authType: typeof this.oauth2Client,
        authIsOAuth2Client: this.oauth2Client instanceof (await import('google-auth-library')).OAuth2Client
      });

      // Get history of changes since the provided startHistoryId
      // This will return all changes between startHistoryId and current state
      const historyResponse = await gmail.users.history.list({
        userId: 'me',
        startHistoryId: startHistoryId,
        historyTypes: ['messageAdded'], // Only get new messages
      });

      console.log(`📊 [Gmail Service] History API response:`, {
        historyId: historyResponse.data.historyId,
        historyRecords: historyResponse.data.history?.length || 0
      });

      const history = historyResponse.data.history || [];
      const messageIds = new Set<string>();

      // Extract message IDs from history
      for (const historyRecord of history) {
        if (historyRecord.messagesAdded) {
          console.log(`📧 [Gmail Service] Found ${historyRecord.messagesAdded.length} message(s) added in this history record`);
          for (const messageAdded of historyRecord.messagesAdded) {
            if (messageAdded.message?.id) {
              messageIds.add(messageAdded.message.id);
              console.log(`✅ [Gmail Service] Extracted message ID: ${messageAdded.message.id}`);
            }
          }
        }
      }

      if (messageIds.size === 0) {
        console.log('⚠️ [Gmail Service] No new messages found in history');
        return [];
      }

      console.log(`✅ [Gmail Service] Found ${messageIds.size} new message ID(s) in history`);

      // Fetch full details for each message
      const emailPromises = Array.from(messageIds).map(async (messageId) => {
        try {
          const messageResponse = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full',
          });

          return this.parseEmailData(messageResponse.data);
        } catch (error) {
          console.error(`Failed to fetch email ${messageId}:`, error);
          return null;
        }
      });

      const emails = await Promise.all(emailPromises);
      const validEmails = emails.filter(email => email !== null) as EmailData[];

      // Filter to only inbox emails (not already archived)
      const inboxEmails = validEmails.filter(email => 
        email.labels.includes('INBOX')
      );

      console.log(`Found ${inboxEmails.length} new inbox email(s)`);
      return inboxEmails;

    } catch (error) {
      console.error('❌ [Gmail Service] Error fetching emails from history:', error);
      console.error('🔍 [DEBUG] Error details:', {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : 'unknown',
        code: (error as any)?.code || 'no code',
        status: (error as any)?.status || 'no status',
        statusText: (error as any)?.statusText || 'no statusText',
        response: (error as any)?.response ? {
          status: (error as any).response.status,
          statusText: (error as any).response.statusText,
          data: (error as any).response.data
        } : 'no response',
        config: (error as any)?.config ? {
          url: (error as any).config.url?.href || 'no url',
          method: (error as any).config.method || 'no method',
          hasAuth: !!(error as any).config.headers?.authorization,
          authPreview: (error as any).config.headers?.authorization ? (error as any).config.headers.authorization.substring(0, 30) + '...' : 'no auth'
        } : 'no config'
      });
      console.error('🔍 [DEBUG] OAuth2Client credentials at error time:', {
        hasAccessToken: !!this.oauth2Client.credentials.access_token,
        accessTokenPreview: this.oauth2Client.credentials.access_token ? this.oauth2Client.credentials.access_token.substring(0, 30) + '...' : 'none',
        hasRefreshToken: !!this.oauth2Client.credentials.refresh_token,
        expiryDate: this.oauth2Client.credentials.expiry_date ? new Date(this.oauth2Client.credentials.expiry_date).toISOString() : 'none'
      });
      
      // If it's a 401 error, the token is invalid - try to force refresh and retry once
      if ((error as any)?.status === 401 || (error as any)?.code === 401) {
        console.log('🔄 [Gmail Service] Got 401 error - token is invalid. Forcing refresh and retry...');
        
        try {
          // Force refresh by clearing expiry_date so ensureValidToken thinks it's expired
          const refreshToken = this.oauth2Client.credentials.refresh_token;
          if (refreshToken) {
            console.log('🔍 [DEBUG] Forcing token refresh due to 401...');
            // Clear access_token and expiry_date to force refresh
            this.oauth2Client.setCredentials({
              refresh_token: refreshToken
            });
            
            // Now refresh - this will get a new access_token
            await this.ensureValidToken();
            
            console.log('🔍 [DEBUG] Token refreshed after 401, retrying API call...');
            
            // CRITICAL: Get fresh access token explicitly before retry
            // This ensures OAuth2Client uses the newly refreshed token
            const freshTokenResult = await this.oauth2Client.getAccessToken();
            console.log('🔍 [DEBUG] Fresh token for retry:', {
              hasToken: !!freshTokenResult.token,
              tokenPreview: freshTokenResult.token ? freshTokenResult.token.substring(0, 30) + '...' : 'none',
              tokenLength: freshTokenResult.token?.length || 0
            });
            
            // Ensure credentials are updated with fresh token
            if (freshTokenResult.token) {
              this.oauth2Client.setCredentials({
                ...this.oauth2Client.credentials,
                access_token: freshTokenResult.token
              });
              console.log('✅ [DEBUG] Updated OAuth2Client with fresh token for retry');
            }
            
            console.log('🔍 [DEBUG] OAuth2Client credentials before retry:', {
              hasAccessToken: !!this.oauth2Client.credentials.access_token,
              accessTokenPreview: this.oauth2Client.credentials.access_token ? this.oauth2Client.credentials.access_token.substring(0, 30) + '...' : 'none',
              hasRefreshToken: !!this.oauth2Client.credentials.refresh_token,
              expiryDate: this.oauth2Client.credentials.expiry_date ? new Date(this.oauth2Client.credentials.expiry_date).toISOString() : 'none'
            });
            
            // Retry the API call with fresh token
            console.log('🔍 [DEBUG] Creating new Gmail client for retry...');
            const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
            
            console.log('🔍 [DEBUG] Making retry API call...');
            let historyResponse;
            try {
              historyResponse = await gmail.users.history.list({
                userId: 'me',
                startHistoryId: startHistoryId,
                historyTypes: ['messageAdded'],
              });
              console.log('✅ [DEBUG] Retry API call succeeded!');
            } catch (retryApiError) {
              console.error('❌ [Gmail Service Retry] API call failed even with fresh token:', retryApiError);
              console.error('🔍 [DEBUG] Retry API error details:', {
                message: retryApiError instanceof Error ? retryApiError.message : String(retryApiError),
                code: (retryApiError as any)?.code,
                status: (retryApiError as any)?.status,
                response: (retryApiError as any)?.response?.data
              });
              throw retryApiError;
            }
            console.log(`📊 [Gmail Service] Retry History API response:`, {
              historyId: historyResponse.data.historyId,
              historyRecords: historyResponse.data.history?.length || 0
            });
            
            // Continue with normal processing...
            const history = historyResponse.data.history || [];
            const messageIds = new Set<string>();
            
            console.log(`🔍 [DEBUG] Processing ${history.length} history record(s)...`);

            for (const historyRecord of history) {
              if (historyRecord.messagesAdded) {
                console.log(`📧 [Gmail Service Retry] Found ${historyRecord.messagesAdded.length} message(s) added in this history record`);
                for (const messageAdded of historyRecord.messagesAdded) {
                  if (messageAdded.message?.id) {
                    messageIds.add(messageAdded.message.id);
                    console.log(`✅ [Gmail Service Retry] Extracted message ID: ${messageAdded.message.id}`);
                  }
                }
              }
            }

            console.log(`🔍 [DEBUG] Found ${messageIds.size} total message ID(s) in retry`);
            
            if (messageIds.size === 0) {
              console.log('⚠️ [Gmail Service Retry] No new messages found in history');
              return [];
            }

            console.log(`🔍 [DEBUG] Fetching details for ${messageIds.size} message(s)...`);
            const emailPromises = Array.from(messageIds).map(async (messageId) => {
              try {
                console.log(`🔍 [DEBUG] Fetching email ${messageId}...`);
                const messageResponse = await gmail.users.messages.get({
                  userId: 'me',
                  id: messageId,
                  format: 'full',
                });
                console.log(`✅ [DEBUG] Successfully fetched email ${messageId}`);
                return this.parseEmailData(messageResponse.data);
              } catch (error) {
                console.error(`❌ [Gmail Service Retry] Failed to fetch email ${messageId}:`, error);
                return null;
              }
            });

            console.log('🔍 [DEBUG] Waiting for all email fetches to complete...');
            const emails = await Promise.all(emailPromises);
            console.log(`✅ [DEBUG] All email fetches completed, got ${emails.length} result(s)`);
            
            const validEmails = emails.filter(email => email !== null) as EmailData[];
            console.log(`✅ [DEBUG] ${validEmails.length} valid email(s) after filtering nulls`);
            
            const inboxEmails = validEmails.filter(email => email.labels.includes('INBOX'));
            console.log(`✅ [Gmail Service] Retry successful after 401: Found ${inboxEmails.length} new inbox email(s)`);
            return inboxEmails;
          } else {
            console.error('❌ [Gmail Service] No refresh_token available for 401 retry');
            throw new Error('Failed to fetch emails from Gmail history - token invalid and cannot refresh');
          }
        } catch (retryError) {
          console.error('❌ [Gmail Service] Retry after 401 also failed:', retryError);
          throw new Error('Failed to fetch emails from Gmail history');
        }
      }
      
      throw new Error('Failed to fetch emails from Gmail history');
    }
  }

  /**
   * Get current Gmail history ID
   * Used to establish baseline before subscribing to watch
   */
  async getCurrentHistoryId(): Promise<string> {
    try {
      // Ensure token is valid before making API call
      await this.ensureValidToken();
      
      const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
      const response = await gmail.users.getProfile({
        userId: 'me',
      });

      const historyId = response.data.historyId;
      if (!historyId) {
        throw new Error('No history ID found in Gmail profile');
      }

      return historyId.toString();
    } catch (error) {
      console.error('Error getting current history ID:', error);
      throw new Error('Failed to get current Gmail history ID');
    }
  }

  /**
   * Subscribe to Gmail Watch for push notifications
   * Returns the expiration timestamp (milliseconds since epoch)
   */
  async subscribeToWatch(topicName: string): Promise<{ expiration: string; historyId: string }> {
    try {
      // Ensure token is valid before making API call
      await this.ensureValidToken();
      
      const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

      // Get current history ID before subscribing
      const historyId = await this.getCurrentHistoryId();
      console.log(`Current history ID: ${historyId}`);

      // Subscribe to watch
      // Gmail watch expires after 7 days, so we need to renew it regularly
      const watchResponse = await gmail.users.watch({
        userId: 'me',
        requestBody: {
          topicName: topicName,
          labelIds: ['INBOX'], // Only watch for inbox messages
        },
      });

      const expiration = watchResponse.data.expiration;
      if (!expiration) {
        throw new Error('No expiration returned from Gmail Watch');
      }

      console.log(`Gmail Watch subscribed successfully. Expires: ${expiration}`);

      return {
        expiration: expiration,
        historyId: historyId,
      };
    } catch (error) {
      console.error('Error subscribing to Gmail Watch:', error);
      throw new Error(`Failed to subscribe to Gmail Watch: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Stop Gmail Watch subscription
   */
  async stopWatch(): Promise<void> {
    try {
      // Ensure token is valid before making API call
      await this.ensureValidToken();
      
      const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
      await gmail.users.stop({
        userId: 'me',
      });
      console.log('Gmail Watch stopped successfully');
    } catch (error) {
      console.error('Error stopping Gmail Watch:', error);
      throw new Error('Failed to stop Gmail Watch');
    }
  }
}

export { GmailService, EmailData, GmailTokens };

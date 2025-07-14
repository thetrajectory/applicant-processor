import { google } from 'googleapis';
import { CONFIG } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger();

export class GmailService {
    constructor() {
        try {
          const credentials = CONFIG.GOOGLE_CREDENTIALS;
          
          logger.info('📧 Initializing Gmail service...');
          logger.info(`   Service Account: ${credentials.client_email}`);
          logger.info(`   Impersonating User: ${CONFIG.GMAIL_USER_EMAIL}`);
          logger.info(`   Project: ${credentials.project_id}`);
          logger.info(`   Client ID: ${credentials.client_id}`);
          
          this.auth = new google.auth.GoogleAuth({
            credentials,
            scopes: [
              'https://www.googleapis.com/auth/gmail.readonly',
              'https://www.googleapis.com/auth/gmail.modify'
            ],
            subject: CONFIG.GMAIL_USER_EMAIL
          });
          
          this.gmail = google.gmail({ version: 'v1' });
          
          logger.info('📧 Gmail service initialized successfully');
          
        } catch (error) {
          logger.error('❌ Gmail service initialization failed:', error);
          throw new Error(`Gmail service initialization failed: ${error.message}`);
        }
      }

  async testConnection() {
    try {
      logger.info('🔍 Testing Gmail connection...');
      logger.info(`   Target Gmail: ${CONFIG.GMAIL_USER_EMAIL}`);
      logger.info(`   Service Account: ${CONFIG.GOOGLE_CREDENTIALS.client_email}`);
      logger.info(`   Client ID: ${CONFIG.GOOGLE_CREDENTIALS.client_id}`);
      
      // Step 1: Get auth client
      logger.info('   Step 1: Getting auth client...');
      const auth = await this.auth.getClient();
      logger.info('   ✅ Auth client obtained');
      
      // Step 2: Create Gmail API instance
      logger.info('   Step 2: Creating Gmail API instance...');
      const gmail = google.gmail({ version: 'v1', auth });
      logger.info('   ✅ Gmail API instance created');
      
      // Step 3: Test basic Gmail access
      logger.info('   Step 3: Testing Gmail profile access...');
      const profile = await gmail.users.getProfile({ userId: 'me' });
      
      logger.info('✅ Gmail connection successful!');
      logger.info(`   Email Address: ${profile.data.emailAddress}`);
      logger.info(`   Messages Total: ${profile.data.messagesTotal}`);
      logger.info(`   Threads Total: ${profile.data.threadsTotal}`);
      
      // Step 4: Test inbox access
      logger.info('   Step 4: Testing inbox access...');
      const inbox = await gmail.users.messages.list({
        userId: 'me',
        maxResults: 1,
        q: 'in:inbox'
      });
      
      logger.info('✅ Inbox access confirmed');
      logger.info(`   Available messages: ${inbox.data.resultSizeEstimate || 0}`);
      
      return true;
      
    } catch (error) {
      logger.error('❌ DETAILED Gmail connection error:');
      logger.error(`   Error Message: ${error.message}`);
      logger.error(`   Error Code: ${error.code || 'N/A'}`);
      logger.error(`   Error Status: ${error.status || 'N/A'}`);
      logger.error(`   Error Stack: ${error.stack}`);
      
      if (error.response) {
        logger.error(`   Response Status: ${error.response.status}`);
        logger.error(`   Response Data: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      
      // Specific Gmail error guidance
      if (error.code === 403) {
        logger.error('🚨 GMAIL PERMISSION DENIED:');
        logger.error('   This means domain-wide delegation is NOT properly configured for Gmail');
        logger.error('   Required fixes:');
        logger.error(`   1. Go to admin.google.com`);
        logger.error(`   2. Security → API Controls → Domain-wide Delegation`);
        logger.error(`   3. Find Client ID: ${CONFIG.GOOGLE_CREDENTIALS.client_id}`);
        logger.error(`   4. Ensure it has these EXACT scopes:`);
        logger.error(`      https://www.googleapis.com/auth/gmail.readonly`);
        logger.error(`      https://www.googleapis.com/auth/gmail.modify`);
        logger.error(`   5. Save and wait 5-10 minutes for propagation`);
      } else if (error.code === 400) {
        logger.error('🚨 GMAIL BAD REQUEST:');
        logger.error(`   Check if email format is correct: ${CONFIG.GMAIL_USER_EMAIL}`);
        logger.error(`   Ensure it's a valid Google Workspace email (not @gmail.com)`);
      } else if (error.message.includes('domain')) {
        logger.error('🚨 DOMAIN ISSUES:');
        logger.error(`   Gmail email domain: ${CONFIG.GMAIL_USER_EMAIL.split('@')[1]}`);
        logger.error(`   Must be a Google Workspace domain, not personal Gmail`);
      } else if (error.message.includes('subject') || error.message.includes('impersonat')) {
        logger.error('🚨 IMPERSONATION FAILED:');
        logger.error(`   Service account cannot impersonate: ${CONFIG.GMAIL_USER_EMAIL}`);
        logger.error(`   Check domain-wide delegation configuration`);
      }
      
      throw new Error(`Gmail connection failed: ${error.message}`);
    }
  }

  async getLatestEmails(maxResults = 50) {
    try {
      const auth = await this.auth.getClient();
      const gmail = google.gmail({ version: 'v1', auth });
      
      // Search for LinkedIn job application emails
      const query = [
        'from:(linkedin.com OR jobs-noreply@linkedin.com)',
        'subject:("new application" OR "job application")',
        'is:unread',
        `newer_than:${CONFIG.MAX_EMAIL_AGE_DAYS}d`
      ].join(' ');
      
      logger.info(`📧 Searching emails with query: ${query}`);
      
      const response = await gmail.users.messages.list({
        userId: 'me',
        maxResults,
        q: query
      });

      if (!response.data.messages) {
        logger.info('📭 No matching emails found');
        return [];
      }

      logger.info(`📧 Found ${response.data.messages.length} potential emails`);

      const messages = await Promise.all(
        response.data.messages.map(async (message) => {
          try {
            const details = await gmail.users.messages.get({
              userId: 'me',
              id: message.id,
              format: 'full'
            });
            
            return this.parseMessage(details.data);
          } catch (error) {
            logger.error(`Error fetching message ${message.id}:`, error);
            return null;
          }
        })
      );

      return messages.filter(Boolean);
    } catch (error) {
      throw new Error(`Gmail API error: ${error.message}`);
    }
  }

  parseMessage(message) {
    try {
      const headers = message.payload.headers;
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const from = headers.find(h => h.name === 'From')?.value || '';
      const date = headers.find(h => h.name === 'Date')?.value || '';
      const messageId = headers.find(h => h.name === 'Message-ID')?.value || message.id;

      let body = '';
      let htmlBody = '';

      // Extract body content
      if (message.payload.body?.data) {
        body = Buffer.from(message.payload.body.data, 'base64').toString();
      } else if (message.payload.parts) {
        for (const part of message.payload.parts) {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            body = Buffer.from(part.body.data, 'base64').toString();
          } else if (part.mimeType === 'text/html' && part.body?.data) {
            htmlBody = Buffer.from(part.body.data, 'base64').toString();
          }
        }
      }

      const attachments = this.extractAttachments(message.payload);

      return {
        id: message.id,
        messageId,
        subject,
        from,
        date: new Date(date),
        body: body || htmlBody,
        htmlBody,
        attachments,
        threadId: message.threadId
      };
    } catch (error) {
      logger.error(`Error parsing message:`, error);
      return null;
    }
  }

  extractAttachments(payload) {
    const attachments = [];
    
    const processAttachments = (parts) => {
      if (!parts) return;
      
      for (const part of parts) {
        if (part.filename && part.body?.attachmentId) {
          attachments.push({
            filename: part.filename,
            mimeType: part.mimeType,
            attachmentId: part.body.attachmentId,
            size: part.body.size || 0
          });
        }
        
        // Recursively process nested parts
        if (part.parts) {
          processAttachments(part.parts);
        }
      }
    };
    
    processAttachments(payload.parts);
    return attachments;
  }

  async downloadAttachment(messageId, attachmentId) {
    try {
      const auth = await this.auth.getClient();
      const gmail = google.gmail({ version: 'v1', auth });
      
      const response = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: attachmentId
      });

      return Buffer.from(response.data.data, 'base64');
    } catch (error) {
      throw new Error(`Error downloading attachment: ${error.message}`);
    }
  }

  async markAsRead(messageId) {
    try {
      const auth = await this.auth.getClient();
      const gmail = google.gmail({ version: 'v1', auth });
      
      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD']
        }
      });
      
      logger.info(`📧 Marked message ${messageId} as read`);
    } catch (error) {
      logger.error(`Error marking message as read:`, error);
    }
  }
}
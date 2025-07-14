import { google } from 'googleapis';
import { CONFIG } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger();

export class GmailService {
  constructor() {
    try {
      logger.info('📧 Initializing Gmail service...');
      
      // Use the already parsed credentials from CONFIG
      const credentials = CONFIG.GOOGLE_CREDENTIALS;
      
      logger.info(`   Service Account: ${credentials.client_email}`);
      logger.info(`   Impersonating User: ${CONFIG.GMAIL_USER_EMAIL}`);
      logger.info(`   Project: ${credentials.project_id}`);
      logger.info(`   Client ID: ${credentials.client_id}`);
      
      this.auth = new google.auth.GoogleAuth({
        credentials, // Use the already parsed object
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
      const auth = await this.auth.getClient();
      const gmail = google.gmail({ version: 'v1', auth });
      
      const profile = await gmail.users.getProfile({ userId: 'me' });
      
      logger.info('✅ Gmail connection successful');
      logger.info(`   Email Address: ${profile.data.emailAddress}`);
      
      return true;
    } catch (error) {
      throw new Error(`Gmail connection failed: ${error.message}`);
    }
  }

  // In gmail.js, update the getLatestEmails method
async getLatestEmails(maxResults = 50) {
    try {
      const auth = await this.auth.getClient();
      const gmail = google.gmail({ version: 'v1', auth });
      
      // Test basic access first
      logger.info('🔍 Testing Gmail profile access...');
      const profile = await gmail.users.getProfile({ userId: 'me' });
      logger.info(`✅ Gmail profile accessible: ${profile.data.emailAddress}`);
      
      const query = [
        'from:(linkedin.com OR jobs-noreply@linkedin.com)',
        'subject:("new application" OR "job application")',
        'is:unread',
        `newer_than:${CONFIG.MAX_EMAIL_AGE_DAYS}d`
      ].join(' ');
      
      logger.info(`🔍 Gmail query: ${query}`);
      
      const response = await gmail.users.messages.list({
        userId: 'me',
        maxResults,
        q: query
      });
  
      // ... rest of the method
    } catch (error) {
      logger.error('❌ Detailed Gmail error:', {
        message: error.message,
        code: error.code,
        status: error.status,
        details: error.details || 'No additional details',
        stack: error.stack
      });
      throw new Error(`Gmail API error: ${error.message}`);
    }
  }

  parseMessage(message) {
    try {
      const headers = message.payload.headers;
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const from = headers.find(h => h.name === 'From')?.value || '';
      const date = headers.find(h => h.name === 'Date')?.value || '';

      let body = '';
      let htmlBody = '';

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
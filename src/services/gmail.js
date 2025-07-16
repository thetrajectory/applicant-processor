import { google } from 'googleapis';
import { OAuth2AuthService } from './oauth-auth.js';
import { CONFIG } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger();

export class GmailService {
  constructor() {
    this.authService = new OAuth2AuthService();
  }

  async testConnection() {
    try {
      const auth = await this.authService.getAuthClient();
      const gmail = google.gmail({ version: 'v1', auth });
      
      const profile = await gmail.users.getProfile({ userId: 'me' });
      
      logger.info('✅ Gmail connection successful');
      logger.info(`   Email Address: ${profile.data.emailAddress}`);
      logger.info(`   Messages Total: ${profile.data.messagesTotal}`);
      logger.info(`   Threads Total: ${profile.data.threadsTotal}`);
      
      return true;
    } catch (error) {
      throw new Error(`Gmail connection failed: ${error.message}`);
    }
  }

  async getLatestEmails(maxResults = 50) {
    try {
      const auth = await this.authService.getAuthClient();
      const gmail = google.gmail({ version: 'v1', auth });
      
      const query = [
        'from:(linkedin.com OR jobs-noreply@linkedin.com)',
        'subject:("new application" OR "job application")',
        `newer_than:${CONFIG.MAX_EMAIL_AGE_DAYS}d`
      ].join(' ');
      
      logger.info(`🔍 Searching for emails with query: ${query}`);
      
      const response = await gmail.users.messages.list({
        userId: 'me',
        maxResults,
        q: query
      });

      if (!response.data.messages) {
        logger.info('📭 No messages found matching the criteria');
        return [];
      }

      logger.info(`📧 Found ${response.data.messages.length} messages, fetching details...`);

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

      const validMessages = messages.filter(Boolean);
      logger.info(`✅ Successfully parsed ${validMessages.length} messages`);
      
      return validMessages;
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
      const auth = await this.authService.getAuthClient();
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
      const auth = await this.authService.getAuthClient();
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
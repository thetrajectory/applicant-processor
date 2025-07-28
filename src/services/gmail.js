import { google } from 'googleapis';
import { CONFIG } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { OAuth2AuthService } from './oauth-auth.js';

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
      
      // Enhanced query for LinkedIn job applications
      const query = [
        'from:(linkedin.com OR jobs-noreply@linkedin.com OR noreply@linkedin.com)',
        'subject:("new application" OR "job application" OR "applicant")',
        `newer_than:${CONFIG.MAX_EMAIL_AGE_DAYS}d`
      ].join(' ');
      
      logger.info(`🔍 Searching for emails with query: ${query}`);
      logger.info(`🎯 Target: ${maxResults} messages (Batch size set to: ${CONFIG.BATCH_SIZE})`);
      
      let allMessages = [];
      let pageToken = null;
      let totalFetched = 0;
      let pageNumber = 1;
      let totalApiCalls = 0;
      
      // Keep fetching until we have enough messages or no more pages
      do {
        const batchSize = Math.min(500, maxResults - totalFetched); // Gmail's max per request is 500
        
        logger.info(`📄 Fetching page ${pageNumber} (requesting ${batchSize} messages)${pageToken ? ' with token: ' + pageToken.substring(0, 20) + '...' : ''}`);
        
        totalApiCalls++;
        const response = await gmail.users.messages.list({
          userId: 'me',
          maxResults: batchSize,
          q: query,
          ...(pageToken && { pageToken })
        });
  
        if (!response.data.messages || response.data.messages.length === 0) {
          logger.info(`📭 No messages found on page ${pageNumber}`);
          break;
        }
  
        allMessages = allMessages.concat(response.data.messages);
        totalFetched += response.data.messages.length;
        
        logger.info(`📧 Page ${pageNumber}: Found ${response.data.messages.length} messages (total: ${totalFetched}/${maxResults})`);
        logger.info(`📊 API calls made: ${totalApiCalls}, Quota units used: ~${totalApiCalls * 5}`);
        
        // Check if we have enough messages
        if (totalFetched >= maxResults) {
          logger.info(`✅ Reached target of ${maxResults} messages, stopping pagination`);
          break;
        }
        
        // Set up for next iteration
        pageToken = response.data.nextPageToken;
        pageNumber++;
        
        // Safety check to prevent infinite loops
        if (pageNumber > 20) {
          logger.warn(`⚠️ Reached maximum page limit (20), stopping pagination at ${totalFetched} messages`);
          break;
        }
        
        // Small delay to be nice to the API
        if (pageToken) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Continue if there's a next page
      } while (pageToken);
      
      if (!pageToken && totalFetched < maxResults) {
        logger.info(`📭 Reached end of available messages. Found ${totalFetched} total messages.`);
      }
  
      logger.info(`📧 Total messages collected: ${allMessages.length}, fetching details...`);
      logger.info(`📊 Total API calls for listing: ${totalApiCalls}, Estimated quota units: ${totalApiCalls * 5}`);
  
      // Truncate if we got more than requested
      if (allMessages.length > maxResults) {
        allMessages = allMessages.slice(0, maxResults);
        logger.info(`✂️ Truncated to ${maxResults} messages as requested`);
      }
  
      // Process messages in batches to avoid overwhelming the API
      const batchSize = 50; // Process 50 message details at a time
      const messages = [];
      let detailApiCalls = 0;
      
      for (let i = 0; i < allMessages.length; i += batchSize) {
        const batch = allMessages.slice(i, i + batchSize);
        logger.info(`📥 Processing message details batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(allMessages.length/batchSize)} (${batch.length} messages)`);
        
        const batchPromises = batch.map(async (message) => {
          try {
            detailApiCalls++;
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
        });
        
        const batchResults = await Promise.all(batchPromises);
        messages.push(...batchResults);
        
        // Log quota usage periodically
        if (i % 200 === 0) {
          logger.info(`📊 Message detail API calls: ${detailApiCalls}, Estimated quota units: ${detailApiCalls * 5}`);
        }
        
        // Small delay between batches to be nice to the API
        if (i + batchSize < allMessages.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
  
      const validMessages = messages.filter(Boolean);
      logger.info(`✅ Successfully parsed ${validMessages.length} messages out of ${allMessages.length} total`);
      logger.info(`📊 Total API calls: ${totalApiCalls + detailApiCalls}, Total quota units used: ~${(totalApiCalls * 5) + (detailApiCalls * 5)}`);
      
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

      // Enhanced email body parsing
      const extractBody = (payload) => {
        if (payload.body?.data) {
          const bodyText = Buffer.from(payload.body.data, 'base64').toString('utf8');
          if (payload.mimeType === 'text/plain') {
            body += bodyText;
          } else if (payload.mimeType === 'text/html') {
            htmlBody += bodyText;
          }
        }

        if (payload.parts) {
          payload.parts.forEach(part => {
            if (part.mimeType === 'text/plain' && part.body?.data) {
              body += Buffer.from(part.body.data, 'base64').toString('utf8');
            } else if (part.mimeType === 'text/html' && part.body?.data) {
              htmlBody += Buffer.from(part.body.data, 'base64').toString('utf8');
            } else if (part.parts) {
              // Handle nested parts
              extractBody(part);
            }
          });
        }
      };

      extractBody(message.payload);

      const attachments = this.extractAttachments(message.payload);

      const parsedMessage = {
        id: message.id,
        subject,
        from,
        date: new Date(date),
        body: body.trim(),
        htmlBody: htmlBody.trim(),
        attachments,
        threadId: message.threadId
      };

      // Log email content for debugging (only first 200 chars)
      logger.debug(`📧 Parsed message: ${subject}`);
      logger.debug(`   Body length: ${body.length}`);
      logger.debug(`   HTML length: ${htmlBody.length}`);
      logger.debug(`   Body preview: ${body.substring(0, 200)}...`);

      return parsedMessage;
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
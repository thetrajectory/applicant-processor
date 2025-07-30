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
      
      // 🚀 ENHANCED: Comprehensive query strategy to catch ALL emails
      const queries = [
        // Primary LinkedIn job application emails
        'from:(linkedin.com OR jobs-noreply@linkedin.com OR noreply@linkedin.com OR jobs-listings@linkedin.com) subject:("new application" OR "job application" OR "applicant" OR "application received")',
        
        // LinkedIn notifications and confirmations
        'from:(linkedin.com OR jobs-noreply@linkedin.com OR noreply@linkedin.com OR jobs-listings@linkedin.com) (application OR applied OR candidate OR resume OR job OR hiring)',
        
        // Subject-based patterns (catch forwarded or different sender emails)
        'subject:("application received" OR "thank you for applying" OR "application submitted" OR "we received your application" OR "your application for" OR "application status" OR "Your job has a new applicant" OR "New Application" OR "Job Application")',
        
        // Content-based patterns with attachments
        'has:attachment (CV OR resume OR application) (linkedin OR job OR position OR role OR candidate OR applicant)',
        
        // Broader LinkedIn patterns
        '(linkedin) AND (job OR position OR role OR application OR apply OR candidate OR resume OR CV OR applicant OR hiring)',
        
        // 🚀 NEW: Catch emails with specific job-related terms
        '(candidate OR applicant OR "new hire") AND (resume OR CV OR application) has:attachment',
        
        // 🚀 NEW: Catch forwarded job applications
        'subject:(Fwd OR Forward OR FWD) AND (application OR candidate OR resume OR CV)',
        
        // 🚀 NEW: Catch internal recruitment emails
        '(recruitment OR talent OR hiring) AND (candidate OR applicant OR resume) has:attachment'
      ];

      const maxAgeDays = CONFIG.MAX_EMAIL_AGE_DAYS || 365;
      
      logger.info(`🔍 Using comprehensive multi-query search strategy`);
      logger.info(`🎯 Age limit: ${maxAgeDays} days`);
      logger.info(`🎯 Target: ${maxResults} messages total`);
      
      let allMessages = [];
      let totalApiCalls = 0;
      
      for (let i = 0; i < queries.length; i++) {
        const baseQuery = queries[i];
        
        const query = maxAgeDays > 0 ? 
          `${baseQuery} newer_than:${maxAgeDays}d` : 
          baseQuery;
        
        logger.info(`📧 Query ${i + 1}/${queries.length}: ${query}`);
        
        try {
          let pageToken = null;
          let queryResults = [];
          let pageNumber = 1;
          
          do {
            const batchSize = Math.min(500, maxResults - allMessages.length);
            
            totalApiCalls++;
            const response = await gmail.users.messages.list({
              userId: 'me',
              maxResults: batchSize,
              q: query,
              ...(pageToken && { pageToken })
            });

            if (response.data.messages?.length > 0) {
              queryResults = queryResults.concat(response.data.messages);
              logger.info(`   📄 Page ${pageNumber}: Found ${response.data.messages.length} messages`);
            }

            pageToken = response.data.nextPageToken;
            pageNumber++;
            
            if (allMessages.length + queryResults.length >= maxResults) {
              break;
            }
            
          } while (pageToken && pageNumber <= 10);
          
          // Remove duplicates by message ID
          const existingIds = new Set(allMessages.map(m => m.id));
          const newMessages = queryResults.filter(m => !existingIds.has(m.id));
          
          allMessages = allMessages.concat(newMessages);
          
          logger.info(`   ✅ Query ${i + 1} results: ${queryResults.length} total, ${newMessages.length} new`);
          logger.info(`   📊 Running total: ${allMessages.length} unique messages`);
          
          if (allMessages.length >= maxResults) {
            logger.info(`✅ Reached target of ${maxResults} messages, stopping search`);
            break;
          }
          
          // Rate limiting between queries
          await new Promise(resolve => setTimeout(resolve, 200));
          
        } catch (error) {
          logger.error(`❌ Error with query ${i + 1}: ${error.message}`);
          continue;
        }
      }
      
      if (allMessages.length > maxResults) {
        allMessages = allMessages.slice(0, maxResults);
        logger.info(`✂️ Truncated to ${maxResults} messages as requested`);
      }
      
      logger.info(`📧 Total unique messages collected: ${allMessages.length}`);
      logger.info(`📊 Total API calls for listing: ${totalApiCalls}`);
      
      // 🚀 ENHANCED: Process messages in batches with better error handling
      const messages = [];
      const batchSize = 50;
      let detailApiCalls = 0;
      
      for (let i = 0; i < allMessages.length; i += batchSize) {
        const batch = allMessages.slice(i, i + batchSize);
        logger.info(`📥 Processing message details batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(allMessages.length/batchSize)}`);
        
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
            logger.error(`Error fetching message ${message.id}:`, error.message);
            return null;
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        messages.push(...batchResults.filter(Boolean));
        
        // Rate limiting between batches
        if (i + batchSize < allMessages.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      logger.info(`✅ Successfully parsed ${messages.length} messages out of ${allMessages.length} total`);
      logger.info(`📊 Total API calls: ${totalApiCalls + detailApiCalls}`);
      
      return messages;
      
    } catch (error) {
      throw new Error(`Gmail API error: ${error.message}`);
    }
  }

  // 🚀 ENHANCED: Complete message parsing with comprehensive body extraction
  parseMessage(message) {
    try {
      const headers = message.payload.headers;
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const from = headers.find(h => h.name === 'From')?.value || '';
      const date = headers.find(h => h.name === 'Date')?.value || '';

      let body = '';
      let htmlBody = '';

      // 🚀 ENHANCED: Comprehensive email body parsing - recursive extraction
      const extractBody = (payload) => {
        if (payload.body?.data) {
          try {
            const bodyText = Buffer.from(payload.body.data, 'base64').toString('utf8');
            if (payload.mimeType === 'text/plain') {
              body += bodyText + '\n';
            } else if (payload.mimeType === 'text/html') {
              htmlBody += bodyText + '\n';
            }
          } catch (decodeError) {
            logger.warn(`Failed to decode body part: ${decodeError.message}`);
          }
        }

        // 🚀 CRITICAL: Process ALL parts recursively (including nested multipart)
        if (payload.parts) {
          payload.parts.forEach(part => {
            if (part.mimeType === 'text/plain' && part.body?.data) {
              try {
                body += Buffer.from(part.body.data, 'base64').toString('utf8') + '\n';
              } catch (decodeError) {
                logger.warn(`Failed to decode plain text part: ${decodeError.message}`);
              }
            } else if (part.mimeType === 'text/html' && part.body?.data) {
              try {
                htmlBody += Buffer.from(part.body.data, 'base64').toString('utf8') + '\n';
              } catch (decodeError) {
                logger.warn(`Failed to decode HTML part: ${decodeError.message}`);
              }
            } else if (part.mimeType.startsWith('multipart/') && part.parts) {
              // 🚀 RECURSIVE: Handle nested multipart messages  
              extractBody(part);
            } else if (part.parts) {
              // Handle any other nested parts
              extractBody(part);
            }
          });
        }
      };

      extractBody(message.payload);

      // 🚀 ENHANCED: Comprehensive attachment extraction
      const attachments = this.extractAllAttachments(message.payload);

      const parsedMessage = {
        id: message.id,
        subject,
        from,
        date: new Date(date),
        body: body.trim(),
        htmlBody: htmlBody.trim(),
        attachments,
        threadId: message.threadId,
        // 🚀 NEW: Additional metadata for debugging
        hasAttachments: attachments.length > 0,
        bodyLength: body.trim().length,
        htmlBodyLength: htmlBody.trim().length
      };

      logger.debug(`📧 Parsed message: ${subject}`);
      logger.debug(`   Body length: ${body.length}`);
      logger.debug(`   HTML length: ${htmlBody.length}`);
      logger.debug(`   Attachments: ${attachments.length}`);

      return parsedMessage;
    } catch (error) {
      logger.error(`Error parsing message:`, error);
      return null;
    }
  }

  // 🚀 ENHANCED: Comprehensive attachment extraction - handles all cases
  extractAllAttachments(payload) {
    const attachments = [];
    
    const processAllParts = (parts, level = 0) => {
      if (!parts) return;
      
      for (const part of parts) {
        // 🚀 CRITICAL: Handle explicit attachments with filename
        if (part.filename && part.body?.attachmentId) {
          attachments.push({
            filename: part.filename,
            mimeType: part.mimeType,
            attachmentId: part.body.attachmentId,
            size: part.body.size || 0,
            disposition: this.getContentDisposition(part),
            partId: part.partId || null
          });
          logger.debug(`📎 Found attachment: ${part.filename} (${part.mimeType})`);
        }
        
        // 🚀 CRITICAL: Handle inline attachments without explicit filename
        else if (part.body?.attachmentId && part.mimeType && 
                 (part.mimeType.startsWith('image/') || 
                  part.mimeType.startsWith('application/') ||
                  part.mimeType === 'text/plain' ||
                  part.mimeType.includes('document') ||
                  part.mimeType.includes('pdf'))) {
          
          const generatedFilename = this.generateFilename(part.mimeType, attachments.length);
          attachments.push({
            filename: generatedFilename,
            mimeType: part.mimeType,
            attachmentId: part.body.attachmentId,
            size: part.body.size || 0,
            disposition: 'inline',
            generated: true,
            partId: part.partId || null
          });
          logger.debug(`📎 Found inline attachment: ${generatedFilename} (${part.mimeType})`);
        }
        
        // 🚀 CRITICAL: Handle attachments with content-disposition but no filename
        else if (part.body?.attachmentId && this.isAttachmentPart(part)) {
          const generatedFilename = this.generateFilename(part.mimeType, attachments.length);
          attachments.push({
            filename: generatedFilename,
            mimeType: part.mimeType,
            attachmentId: part.body.attachmentId,
            size: part.body.size || 0,
            disposition: this.getContentDisposition(part),
            generated: true,
            partId: part.partId || null
          });
          logger.debug(`📎 Found disposition attachment: ${generatedFilename} (${part.mimeType})`);
        }
        
        // 🚀 RECURSIVE: Process nested parts (multipart messages)
        if (part.parts) {
          processAllParts(part.parts, level + 1);
        }
      }
    };
    
    // Start with payload parts
    processAllParts(payload.parts);
    
    // 🚀 ALSO: Check payload itself for attachments (edge case)  
    if (payload.filename && payload.body?.attachmentId) {
      attachments.push({
        filename: payload.filename,
        mimeType: payload.mimeType,
        attachmentId: payload.body.attachmentId,
        size: payload.body.size || 0,
        disposition: this.getContentDisposition(payload),
        partId: payload.partId || null
      });
      logger.debug(`📎 Found payload attachment: ${payload.filename}`);
    }
    
    logger.debug(`📎 Total attachments found: ${attachments.length}`);
    return attachments;
  }

  // 🚀 NEW: Helper methods for attachment processing
  getContentDisposition(part) {
    const headers = part.headers || [];
    const dispositionHeader = headers.find(h => h.name.toLowerCase() === 'content-disposition');
    return dispositionHeader?.value || 'attachment';
  }

  isAttachmentPart(part) {
    const disposition = this.getContentDisposition(part);
    return disposition.toLowerCase().includes('attachment') || 
           part.mimeType.startsWith('application/') ||
           part.mimeType.includes('pdf') ||
           part.mimeType.includes('document') ||
           part.mimeType.includes('spreadsheet') ||
           part.mimeType.includes('presentation');
  }

  generateFilename(mimeType, index) {
    const extensions = {
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.ms-powerpoint': 'ppt',
      'application/rtf': 'rtf',
      'text/plain': 'txt',
      'text/csv': 'csv',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/bmp': 'bmp',
      'image/tiff': 'tiff'
    };
    
    const ext = extensions[mimeType] || 'bin';
    return `attachment_${index + 1}.${ext}`;
  }

  async downloadAttachment(messageId, attachmentId) {
    try {
      const auth = await this.authService.getAuthClient();
      const gmail = google.gmail({ version: 'v1', auth });
      
      logger.debug(`📥 Downloading attachment: ${attachmentId} from message: ${messageId}`);
      
      const response = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: attachmentId
      });

      const attachmentData = Buffer.from(response.data.data, 'base64');
      logger.debug(`📥 Downloaded attachment: ${attachmentData.length} bytes`);
      
      return attachmentData;
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

  // 🚀 NEW: Get specific message by ID
  async getMessageById(messageId) {
    try {
      const auth = await this.authService.getAuthClient();
      const gmail = google.gmail({ version: 'v1', auth });
      
      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });
      
      return this.parseMessage(response.data);
    } catch (error) {
      throw new Error(`Error fetching message ${messageId}: ${error.message}`);
    }
  }

  // 🚀 NEW: Batch message processing
  async getMessagesByIds(messageIds) {
    const messages = [];
    const batchSize = 50;
    
    for (let i = 0; i < messageIds.length; i += batchSize) {
      const batch = messageIds.slice(i, i + batchSize);
      logger.info(`Processing message batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(messageIds.length/batchSize)}`);
      
      const batchPromises = batch.map(async (messageId) => {
        try {
          return await this.getMessageById(messageId);
       } catch (error) {
         logger.error(`Error fetching message ${messageId}:`, error.message);
         return null;
       }
     });
     
     const batchResults = await Promise.all(batchPromises);
     messages.push(...batchResults.filter(Boolean));
     
     // Rate limiting between batches
     if (i + batchSize < messageIds.length) {
       await new Promise(resolve => setTimeout(resolve, 200));
     }
   }
   
   return messages;
 }

 // 🚀 NEW: Search messages with advanced filters
 async searchMessages(query, maxResults = 100) {
   try {
     const auth = await this.authService.getAuthClient();
     const gmail = google.gmail({ version: 'v1', auth });
     
     logger.info(`🔍 Searching messages with query: ${query}`);
     
     const response = await gmail.users.messages.list({
       userId: 'me',
       maxResults,
       q: query
     });
     
     if (!response.data.messages) {
       logger.info('No messages found for query');
       return [];
     }
     
     logger.info(`Found ${response.data.messages.length} messages`);
     return response.data.messages;
   } catch (error) {
     throw new Error(`Error searching messages: ${error.message}`);
   }
 }
}
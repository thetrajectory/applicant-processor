// main.js - Fixed version addressing all discrepancy issues
import fs from 'fs/promises';
import { CONFIG } from './config.js';
import { DriveService } from './services/drive.js';
import { GmailService } from './services/gmail.js';
import { OpenAIService } from './services/openai.js';
import { SheetsService } from './services/sheets.js';
import { SupabaseService } from './services/supabase.js';
import { createLogger } from './utils/logger.js';
import { EmailParser } from './utils/parser.js';
import { StorageManager } from './utils/storage.js';

const logger = createLogger();

class ApplicantProcessor {
  constructor() {
    this.gmail = new GmailService();
    this.drive = new DriveService();
    this.sheets = new SheetsService();
    this.supabase = new SupabaseService();
    this.openai = new OpenAIService();
    this.parser = new EmailParser();
    this.storage = new StorageManager();
    
    this.stats = {
      startTime: new Date(),
      emailsFound: 0,
      emailsProcessed: 0,
      emailsSkipped: 0,
      emailsErrored: 0,
      applicantsCreated: 0,
      duplicatesFound: 0,
      attachmentsFound: 0,
      attachmentsProcessed: 0,
      ocrSuccessful: 0,
      formatStats: {
        pdf: 0,
        image: 0,
        document: 0,
        text: 0,
        other: 0,
        failed: 0
      },
      parsingSuccessRate: {
        name: 0,
        title: 0,
        location: 0,
        compensation: 0,
        projectId: 0,
        screeningQuestions: 0
      },
      errors: []
    };
  }

  async initialize() {
    logger.info('🚀 Initializing Enhanced Applicant Processor with Message Tracking...');
    
    try {
      await fs.mkdir('logs', { recursive: true });
      
      // Initialize storage manager
      await this.storage.initializeTable();
      
      await this.testConnections();
      await this.sheets.initializeSheet();
      
      // Optional: Clean up old processed message records
      if (!CONFIG.IS_GITHUB_ACTIONS) {
        await this.storage.cleanupOldRecords(30);
      }
      
      logger.info('✅ Initialization complete with message tracking enabled');
    } catch (error) {
      logger.error('❌ Initialization failed:', {
        message: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async testConnections() {
    logger.info('🔍 Testing service connections...');
    
    const tests = [
      { name: 'Supabase', test: () => this.supabase.testConnection(), critical: true },
      { name: 'Storage Manager', test: () => this.storage.initializeTable(), critical: true },
      { name: 'Google Sheets', test: () => this.sheets.testConnection(), critical: true },
      { name: 'Google Drive', test: () => this.drive.testConnection(), critical: false },
      { name: 'Gmail', test: () => this.gmail.testConnection(), critical: true },
      { name: 'OpenAI', test: () => this.openai.testConnection(), critical: true }
    ];

    let criticalFailures = 0;

    for (const { name, test, critical } of tests) {
      try {
        await test();
        logger.info(`✅ ${name} connection successful`);
      } catch (error) {
        logger.error(`❌ ${name} connection failed: ${error.message}`);
        
        if (critical) {
          criticalFailures++;
          logger.error(`🚨 ${name} is critical - this will prevent processing`);
        } else {
          logger.warn(`⚠️ ${name} failed but processing can continue`);
        }
      }
    }
    
    if (criticalFailures > 0) {
      throw new Error(`${criticalFailures} critical service(s) failed - cannot proceed`);
    }
  }
  
  async processEmails() {
    try {
      logger.info('🔥 Starting enhanced email processing cycle...');
      
      // 🚀 MODIFIED: Use config-based batch size
      const messages = await this.gmail.getLatestEmails(CONFIG.BATCH_SIZE);
      this.stats.emailsFound = messages.length;
      
      if (messages.length === 0) {
        logger.info('📭 No new emails found');
        return;
      }
  
      logger.info(`📋 Processing ${messages.length} emails...`);
      logger.info(`🎯 Process All Mode: ${CONFIG.PROCESS_ALL_EMAILS}`);
  
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        try {
          logger.info(`📧 Processing email ${i + 1}/${messages.length}: "${message.subject}"`);
          await this.processMessage(message);
          
          // 🚀 NEW: Progress logging for large batches
          if (CONFIG.PROCESS_ALL_EMAILS && (i + 1) % 100 === 0) {
            logger.info(`📊 Progress: ${i + 1}/${messages.length} emails processed (${((i + 1) / messages.length * 100).toFixed(1)}%)`);
          }
        } catch (error) {
          this.stats.emailsErrored++;
          this.stats.errors.push({
            messageId: message.id,
            subject: message.subject,
            error: error.message,
            timestamp: new Date()
          });
          logger.error(`❌ Error processing message ${message.id}:`, error.message);
        }
      }
      
      await this.generateEnhancedReport();
      logger.info('✅ Enhanced email processing cycle completed');
      
    } catch (error) {
      logger.error('❌ Fatal error in email processing:', error.message);
      throw error;
    }
  }
  
  // 🚀 FIXED: processMessage method - simplified to only check message ID
  async processMessage(message) {
    const startTime = Date.now();
    const messageId = message.id;
    
    logger.info(`🔄 Processing: "${message.subject}" (${messageId})`);
    
    try {
      // 🚀 CRITICAL FIX: Only check if message ID already processed (not duplicate applicant)
      const alreadyProcessed = await this.storage.isProcessed(messageId);
      if (alreadyProcessed) {
        logger.info(`⏭️ Skipping already processed message: ${messageId}`);
        this.stats.emailsSkipped++;
        return; // Early return - message already tracked
      }

      // 🚀 TRACK ALL MESSAGES: Even if not LinkedIn, track them for statistics
      let skipReason = null;
      let isValidLinkedInEmail = true;

      // Check if it's a LinkedIn application
      if (!this.parser.isLinkedInApplication(message)) {
        logger.info(`📧 Not a LinkedIn application: ${messageId}`);
        skipReason = 'Not LinkedIn application';
        isValidLinkedInEmail = false;
      }
      
      // Check email age
      const emailAge = (new Date() - message.date) / (1000 * 60 * 60 * 24);
      if (emailAge > CONFIG.MAX_EMAIL_AGE_DAYS) {
        logger.info(`⏳ Email too old (${emailAge.toFixed(1)} days): ${messageId}`);
        skipReason = `Too old (${emailAge.toFixed(1)} days)`;
        isValidLinkedInEmail = false;
      }

      // If not valid LinkedIn email, track and skip
      if (!isValidLinkedInEmail) {
        this.stats.emailsSkipped++;
        await this.storage.markProcessed(messageId, 'skipped', {
          subject: message.subject,
          skipReason,
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      // Parse email data
      const parsedData = this.parser.parseLinkedInApplication(message);
      this.updateParsingStats(parsedData);
      
      if (!parsedData.name?.trim()) {
        logger.warn(`⚠️ No applicant name found: ${messageId}`);
        this.stats.emailsSkipped++;
        await this.storage.markProcessed(messageId, 'skipped', {
          subject: message.subject,
          skipReason: 'No applicant name found',
          parsedData,
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      logger.info(`👤 Processing applicant: ${parsedData.name}`);
      
      // Process attachments (OCR + Drive upload)
      let resumeText = null;
      let resumeDriveLink = null;
      let processedAttachments = [];
      
      if (message.attachments?.length > 0) {
        logger.info(`📎 Found ${message.attachments.length} attachment(s), processing each one...`);
        
        for (const attachment of message.attachments) {
          try {
            logger.info(`📄 Processing attachment: ${attachment.filename} (${attachment.mimeType})`);
            
            const canProcess = this.drive.canProcessFile(
              attachment.mimeType, 
              attachment.filename, 
              attachment.size
            );
            
            if (!canProcess.canProcess) {
              logger.warn(`⚠️ Skipping ${attachment.filename}: ${canProcess.reason}`);
              processedAttachments.push({
                filename: attachment.filename,
                mimeType: attachment.mimeType,
                processed: false,
                reason: canProcess.reason
              });
              continue;
            }
            
            // Download attachment
            const attachmentData = await this.gmail.downloadAttachment(
              messageId, 
              attachment.attachmentId
            );
            
            // Upload to Drive for backup
            const driveLink = await this.drive.uploadFile(
              attachmentData,
              `${parsedData.name}_${attachment.filename}`,
              attachment.mimeType
            );
            
            if (!resumeDriveLink) {
              resumeDriveLink = driveLink;
            }
            
            // Process with OCR if enabled
            if (CONFIG.ENABLE_OCR) {
              logger.info(`🔍 Converting ${attachment.filename} to text...`);
              
              const ocrResult = await this.drive.convertFileToText(
                attachmentData, 
                attachment.filename, 
                attachment.mimeType
              );
              
              if (ocrResult.processed && ocrResult.length > 0) {
                if (!resumeText || ocrResult.length > resumeText.length) {
                  resumeText = ocrResult.text;
                  logger.info(`📖 Using OCR result from ${attachment.filename}: ${ocrResult.length} characters`);
                }
                
                this.stats.ocrSuccessful++;
              }
              
              processedAttachments.push({
                filename: attachment.filename,
                mimeType: attachment.mimeType,
                processed: ocrResult.processed,
                method: ocrResult.method || 'unknown',
                length: ocrResult.length,
                driveLink: driveLink,
                reason: ocrResult.reason
              });
              
            } else {
              processedAttachments.push({
                filename: attachment.filename,
                mimeType: attachment.mimeType,
                processed: false,
                reason: 'OCR disabled',
                driveLink: driveLink
              });
            }
            
          } catch (error) {
            logger.error(`❌ Error processing attachment ${attachment.filename}:`, error.message);
            
            processedAttachments.push({
              filename: attachment.filename,
              mimeType: attachment.mimeType,
              processed: false,
              error: error.message
            });
          }
        }
        
        const successfulOCR = processedAttachments.filter(a => a.processed).length;
        const totalAttachments = processedAttachments.length;
        
        logger.info(`📊 Attachment processing summary: ${successfulOCR}/${totalAttachments} successfully processed`);
      }
      
      // 🚀 FIXED: Extract email from multiple sources including hyperlinks
      let applicantEmail = this.extractApplicantEmail(message, resumeText);
      
      if (!applicantEmail) {
        logger.warn(`⚠️ No email found for applicant: ${parsedData.name}`);
        this.stats.emailsSkipped++;
        await this.storage.markProcessed(messageId, 'skipped', {
          subject: message.subject,
          skipReason: 'No email found',
          applicantName: parsedData.name,
          attachmentsSummary: processedAttachments,
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      // Extract contact info with GPT (only if we have resume text)
      let contactInfo = { mobile_number: null, email: applicantEmail, linkedin_url: null };
      
      if (resumeText && CONFIG.ENABLE_GPT) {
        try {
          logger.info(`🤖 Extracting contact info with GPT...`);
          const gptContactInfo = await this.openai.extractContactInfo(resumeText);
          
          // Merge GPT results with email we already found
          contactInfo = {
            mobile_number: gptContactInfo.mobile_number || null,
            email: gptContactInfo.email || applicantEmail, // Use GPT email if found, otherwise use extracted email
            linkedin_url: gptContactInfo.linkedin_url || null
          };
          
          logger.info(`📞 Contact info extracted:`, contactInfo);
        } catch (error) {
          logger.error(`❌ GPT extraction failed:`, error.message);
        }
      }
      
      // 🚀 REMOVED: Duplicate applicant check - we only check message ID now
      
      // Prepare applicant data
      const applicantData = {
        email: contactInfo.email,
        name: parsedData.name.trim(),
        title: parsedData.title || null,
        location: parsedData.location || null,
        expected_compensation: parsedData.expected_compensation || null,
        project_id: parsedData.project_id || null,
        screening_questions: parsedData.screening_questions || null,
        resume_raw_text: resumeText || null,
        resume_drive_link: resumeDriveLink || null,
        mobile_number: contactInfo.mobile_number || null,
        linkedin_url: contactInfo.linkedin_url || null,
        processed_at: new Date().toISOString()
      };
      
      if (!CONFIG.DRY_RUN) {
        // Store data with message ID in both places
        await Promise.all([
          this.sheets.appendApplicant(applicantData, messageId),
          this.storage.createApplicant(applicantData, messageId)
        ]);
      }
      
      this.stats.emailsProcessed++;
      this.stats.applicantsCreated++;
      
      // Mark as successfully processed with enhanced metadata
      await this.storage.markProcessed(messageId, 'success', {
        subject: message.subject,
        applicantEmail: contactInfo.email,
        applicantName: parsedData.name,
        projectId: parsedData.project_id,
        processingTimeMs: Date.now() - startTime,
        attachmentsSummary: processedAttachments,
        ocrSuccessful: processedAttachments.filter(a => a.processed).length,
        gptProcessed: !!contactInfo.email,
        timestamp: new Date().toISOString()
      });
      
      const processingTime = Date.now() - startTime;
      logger.info(`✅ Successfully processed: ${parsedData.name} (${contactInfo.email}) in ${processingTime}ms`);
      logger.info(`   📧 Message ID: ${messageId}`);
      logger.info(`   📎 Processed ${processedAttachments.length} attachment(s), ${processedAttachments.filter(a => a.processed).length} successful OCR`);
      
    } catch (error) {
      this.stats.emailsErrored++;
      this.stats.errors.push({
        messageId,
        subject: message.subject,
        error: error.message,
        timestamp: new Date()
      });
      
      // CRITICAL: Mark as error in processed_messages table
      await this.storage.markProcessed(messageId, 'error', {
        subject: message.subject,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      
      logger.error(`❌ Error processing message ${messageId}:`, error.message);
      throw error;
    }
  }

  // 🚀 NEW: Enhanced email extraction method
  extractApplicantEmail(message, resumeText = null) {
    const sources = [
      message.body,
      message.htmlBody,
      resumeText
    ].filter(Boolean);

    const emailPatterns = [
      // 🚀 CRITICAL: Hyperlink email extraction
      /<a[^>]+href=['"]mailto:([^'"]+)['"][^>]*>([^<]*)<\/a>/gi,
      /<a[^>]+href=['"]mailto:([^'"]+)['"][^>]*>/gi,
      
      // Standard email patterns
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      
      // Gmail-specific patterns from email body
      /email[:\s]*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/gi,
      /contact[:\s]*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/gi,
      
      // Pattern within parentheses or brackets
      /\(([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\)/g,
      /\[([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\]/g
    ];

    for (const source of sources) {
      if (!source) continue;
      
      for (const pattern of emailPatterns) {
        let match;
        pattern.lastIndex = 0; // Reset regex state
        
        while ((match = pattern.exec(source)) !== null) {
          const email = match[1] || match[0];
          
          if (this.isValidEmail(email)) {
            logger.info(`📧 Email extracted from source: ${email}`);
            return email.toLowerCase().trim();
          }
        }
      }
    }

    logger.warn('⚠️ No valid email found in any source');
    return null;
  }

  // 🚀 NEW: Email validation helper
  isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    
    // Basic validation
    if (!emailRegex.test(email)) return false;
    
    // Exclude common non-email patterns
    const excludePatterns = [
      /noreply/i,
      /no-reply/i,
      /donotreply/i,
      /linkedin\.com$/i,
      /example\.com$/i,
      /test\.com$/i,
      /dummy/i
    ];
    
    return !excludePatterns.some(pattern => pattern.test(email));
  }
  
  updateParsingStats(parsedData) {
    if (parsedData.name) this.stats.parsingSuccessRate.name++;
    if (parsedData.title) this.stats.parsingSuccessRate.title++;
    if (parsedData.location) this.stats.parsingSuccessRate.location++;
    if (parsedData.expected_compensation) this.stats.parsingSuccessRate.compensation++;
    if (parsedData.project_id) this.stats.parsingSuccessRate.projectId++;
    if (parsedData.screening_questions) this.stats.parsingSuccessRate.screeningQuestions++;
  }
  
  // Enhanced generateEnhancedReport method
  async generateEnhancedReport() {
    try {
      const endTime = new Date();
      const duration = (endTime - this.stats.startTime) / 1000;
      
      // Get comprehensive stats from both tables
      const processedStats = await this.storage.getProcessedStats();
      const applicantStats = await this.storage.getApplicantStats();
      const recentlyProcessed = await this.storage.getRecentlyProcessed(5);
      
      const report = {
        ...this.stats,
        endTime,
        durationSeconds: duration,
        successRate: this.stats.emailsFound > 0 ? 
          (this.stats.emailsProcessed / this.stats.emailsFound * 100).toFixed(1) : 0,
        
        // Enhanced tracking stats
        processedMessageStats: processedStats,
        applicantStats: applicantStats,
        recentlyProcessed,
        
        // Message tracking metrics
        trackingMetrics: {
          messagesTracked: processedStats.total,
          alreadyProcessedCount: processedStats.already_processed,
          duplicatePreventionRate: processedStats.total > 0 ? 
            ((processedStats.already_processed + processedStats.duplicates) / processedStats.total * 100).toFixed(1) : 0,
          errorRate: processedStats.total > 0 ? 
            (processedStats.errors / processedStats.total * 100).toFixed(1) : 0
        },
        
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          workflowRunId: process.env.WORKFLOW_RUN_ID || 'local',
          debugMode: CONFIG.DEBUG_MODE,
          dryRun: CONFIG.DRY_RUN,
          authMethod: 'OAuth2',
          messageTrackingEnabled: true,
          dualTableTracking: true,
          mainTable: CONFIG.TABLE_NAME,
          trackingTable: CONFIG.PROCESSED_MESSAGES_TABLE
        }
      };
      
      await fs.writeFile('stats.json', JSON.stringify(report, null, 2));
      
      // Enhanced logging
      logger.info('📊 ===== ENHANCED PROCESSING SUMMARY =====');
      logger.info(`🔥 Total emails found: ${this.stats.emailsFound}`);
      logger.info(`✅ Emails processed: ${this.stats.emailsProcessed}`);
      logger.info(`⏭️ Emails skipped: ${this.stats.emailsSkipped}`);
      logger.info(`❌ Errors encountered: ${this.stats.emailsErrored}`);
      logger.info(`👥 New applicants created: ${this.stats.applicantsCreated}`);
      logger.info(`🔄 Duplicates found: ${this.stats.duplicatesFound}`);
      
      // Dual table tracking stats
      logger.info('📝 ===== DUAL TABLE TRACKING STATS =====');
      logger.info(`📊 Total tracked messages: ${processedStats.total}`);
      logger.info(`✅ Successfully processed: ${processedStats.success}`);
      logger.info(`🔄 Already processed (from applicant table): ${processedStats.already_processed}`);
      logger.info(`🔄 Duplicates prevented: ${processedStats.duplicates}`);
      logger.info(`⏭️ Skipped messages: ${processedStats.skipped}`);
      logger.info(`❌ Error messages: ${processedStats.errors}`);
      
      logger.info('👥 ===== APPLICANT TABLE STATS =====');
      logger.info(`📊 Total applicants: ${applicantStats.total}`);
      logger.info(`📱 With mobile numbers: ${applicantStats.withMobile}`);
      logger.info(`🔗 With LinkedIn URLs: ${applicantStats.withLinkedIn}`);
      logger.info(`📄 With resume links: ${applicantStats.withResume}`);
      logger.info(`📧 With message IDs: ${applicantStats.withMessageId}`);
      
      // Key metrics
      logger.info('🎯 ===== KEY METRICS =====');
      logger.info(`📈 Duplicate prevention rate: ${report.trackingMetrics.duplicatePreventionRate}%`);
      logger.info(`📉 Error rate: ${report.trackingMetrics.errorRate}%`);
      logger.info(`🔄 Message tracking coverage: ${applicantStats.withMessageId}/${applicantStats.total} (${applicantStats.total > 0 ? (applicantStats.withMessageId/applicantStats.total*100).toFixed(1) : 0}%)`);
      
      if (recentlyProcessed.length > 0) {
        logger.info('🕒 Recently processed messages:');
        recentlyProcessed.forEach((msg, i) => {
          const metadata = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata;
          logger.info(`   ${i + 1}. ${msg.status.toUpperCase()} - ${metadata?.subject || 'Unknown'} (${msg.processed_at})`);
        });
      }
      
    } catch (error) {
      logger.error('❌ Error generating enhanced report:', error.message);
    }
  }
}

// Enhanced error handling
process.on('unhandledRejection', (reason, promise) => {
  logger.error('🚨 Unhandled Promise Rejection detected!');
  logger.error('🚨 Promise:', promise);
  logger.error('🚨 Reason:', reason);
  logger.error('🚨 Stack:', reason.stack || 'No stack trace available');
  
  logger.warn('⚠️ Continuing execution despite unhandled rejection...');
});

process.on('uncaughtException', (error) => {
  logger.error('🚨 Uncaught Exception detected!');
  logger.error('🚨 Error:', error);
  logger.error('🚨 Stack:', error.stack);
  logger.error('💥 Exiting due to uncaught exception...');
  process.exit(1);
});

// Main execution function
async function main() {
  const processor = new ApplicantProcessor();
  
  try {
    logger.info('🚀 ===== ENHANCED APPLICANT PROCESSOR STARTING =====');
    logger.info(`🔧 Configuration:`);
    logger.info(`   Environment: ${CONFIG.IS_GITHUB_ACTIONS ? 'GitHub Actions' : 'Local'}`);
    logger.info(`   Debug Mode: ${CONFIG.DEBUG_MODE}`);
    logger.info(`   Dry Run: ${CONFIG.DRY_RUN}`);
    logger.info(`   Batch Size: ${CONFIG.BATCH_SIZE}`);
    logger.info(`   Max Email Age: ${CONFIG.MAX_EMAIL_AGE_DAYS} days`);
    logger.info(`   OCR Enabled: ${CONFIG.ENABLE_OCR}`);
    logger.info(`   GPT Enabled: ${CONFIG.ENABLE_GPT}`);
    logger.info(`   Authentication: OAuth2`);
    logger.info(`   Main Table: ${CONFIG.TABLE_NAME}`);
    logger.info(`   Tracking Table: ${CONFIG.PROCESSED_MESSAGES_TABLE}`);
    logger.info('');
    
    await processor.initialize();
    await processor.processEmails();
    
    logger.info('🎉 ===== APPLICATION COMPLETED SUCCESSFULLY =====');
    process.exit(0);
    
  } catch (error) {
    logger.error('💥 ===== FATAL APPLICATION ERROR =====');
    logger.error('🚨 Error Details:', {
      message: error.message,
      name: error.name,
      code: error.code,
      stack: error.stack
    });
    
    logger.error('💡 Troubleshooting suggestions:');
    logger.error('   1. Check all environment variables are set correctly');
    logger.error('   2. Run: npm run setup (to configure OAuth2)');
    logger.error('   3. Verify Google Sheet and Drive folder permissions');
    logger.error('   4. Ensure refresh token is valid and not expired');
    logger.error('   5. Check Supabase database and tables exist');
    logger.error('   6. Verify OpenAI API key has sufficient credits');
    
    process.exit(1);
  }
}

main();
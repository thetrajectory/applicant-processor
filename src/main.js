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
      ocrProcessed: 0,
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

  // Enhanced initialization method
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
      
      const messages = await this.gmail.getLatestEmails(CONFIG.BATCH_SIZE);
      this.stats.emailsFound = messages.length;
      
      if (messages.length === 0) {
        logger.info('📭 No new emails found');
        return;
      }

      logger.info(`📋 Processing ${messages.length} emails...`);

      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        try {
          logger.info(`📧 Processing email ${i + 1}/${messages.length}: "${message.subject}"`);
          await this.processMessage(message);
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

  // Enhanced processMessage method in main.js
async processMessage(message) {
  const startTime = Date.now();
  const messageId = message.id;
  
  logger.info(`🔄 Processing: "${message.subject}" (${messageId})`);
  
  try {
    // 🚀 CRITICAL: Check if already processed
    const alreadyProcessed = await this.storage.isProcessed(messageId);
    if (alreadyProcessed) {
      logger.info(`⏭️ Skipping already processed message: ${messageId}`);
      this.stats.emailsSkipped++;
      await this.storage.markProcessed(messageId, 'duplicate', {
        subject: message.subject,
        skipReason: 'Already processed',
        timestamp: new Date().toISOString()
      });
      return;
    }

    // Check if it's a LinkedIn application
    if (!this.parser.isLinkedInApplication(message)) {
      logger.info(`📧 Not a LinkedIn application: ${messageId}`);
      this.stats.emailsSkipped++;
      await this.storage.markProcessed(messageId, 'skipped', {
        subject: message.subject,
        skipReason: 'Not LinkedIn application',
        timestamp: new Date().toISOString()
      });
      return;
    }
    
    // Check email age
    const emailAge = (new Date() - message.date) / (1000 * 60 * 60 * 24);
    if (emailAge > CONFIG.MAX_EMAIL_AGE_DAYS) {
      logger.info(`⏳ Email too old (${emailAge.toFixed(1)} days): ${messageId}`);
      this.stats.emailsSkipped++;
      await this.storage.markProcessed(messageId, 'skipped', {
        subject: message.subject,
        skipReason: `Too old (${emailAge.toFixed(1)} days)`,
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
    
    // Process attachments (OCR)
    let resumeText = null;
    let resumeDriveLink = null;
    
    if (message.attachments?.length > 0) {
      const pdfAttachment = message.attachments.find(att => 
        att.mimeType === 'application/pdf'
      );
      
      if (pdfAttachment) {
        try {
          logger.info(`📄 Processing PDF attachment: ${pdfAttachment.filename}`);
          
          const attachmentData = await this.gmail.downloadAttachment(
            messageId, 
            pdfAttachment.attachmentId
          );
          
          resumeDriveLink = await this.drive.uploadFile(
            attachmentData,
            `${parsedData.name}_${parsedData.project_id || 'CV'}.pdf`,
            pdfAttachment.mimeType
          );
          
          if (CONFIG.ENABLE_OCR) {
            const ocrResult = await this.drive.convertPDFToText(attachmentData, pdfAttachment.filename);
            resumeText = ocrResult.text;
            this.stats.ocrProcessed++;
            logger.info(`📖 OCR completed: ${ocrResult.length} characters extracted`);
          }
          
        } catch (error) {
          logger.error(`❌ Error processing PDF attachment:`, error.message);
          resumeText = `PDF processing failed: ${error.message}`;
        }
      }
    }
    
    // Extract contact info with GPT (only if we have resume text)
    let contactInfo = { mobile_number: null, email: null, linkedin_url: null };
    
    if (resumeText && CONFIG.ENABLE_GPT) {
      try {
        logger.info(`🤖 Extracting contact info with GPT...`);
        contactInfo = await this.openai.extractContactInfo(resumeText);
        logger.info(`📞 Contact info extracted:`, contactInfo);
      } catch (error) {
        logger.error(`❌ GPT extraction failed:`, error.message);
      }
    }
    
    const applicantEmail = contactInfo.email;
    if (!applicantEmail) {
      logger.warn(`⚠️ No email found in resume for applicant: ${parsedData.name}`);
      this.stats.emailsSkipped++;
      await this.storage.markProcessed(messageId, 'skipped', {
        subject: message.subject,
        skipReason: 'No email found in resume',
        applicantName: parsedData.name,
        timestamp: new Date().toISOString()
      });
      return;
    }
    
    // Check for duplicate applicant
    const isDuplicate = await this.supabase.isDuplicateApplicant(applicantEmail, parsedData.project_id);
    
    if (isDuplicate) {
      logger.info(`🔄 Duplicate applicant: ${applicantEmail} for project ${parsedData.project_id || 'N/A'}`);
      this.stats.duplicatesFound++;
      await this.storage.markProcessed(messageId, 'duplicate', {
        subject: message.subject,
        applicantEmail,
        projectId: parsedData.project_id,
        skipReason: 'Duplicate applicant',
        timestamp: new Date().toISOString()
      });
      return;
    }
    
    // Prepare and store applicant data
    const applicantData = {
      email: applicantEmail,
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
      await Promise.all([
        this.sheets.appendApplicant(applicantData),
        this.supabase.createApplicant(applicantData)
      ]);
    }
    
    this.stats.emailsProcessed++;
    this.stats.applicantsCreated++;
    
    // Mark as successfully processed
    await this.storage.markProcessed(messageId, 'success', {
      subject: message.subject,
      applicantEmail,
      applicantName: parsedData.name,
      projectId: parsedData.project_id,
      processingTimeMs: Date.now() - startTime,
      ocrProcessed: !!resumeText,
      gptProcessed: !!contactInfo.email,
      timestamp: new Date().toISOString()
    });
    
    const processingTime = Date.now() - startTime;
    logger.info(`✅ Successfully processed: ${parsedData.name} (${applicantEmail}) in ${processingTime}ms`);
    
  } catch (error) {
    this.stats.emailsErrored++;
    this.stats.errors.push({
      messageId,
      subject: message.subject,
      error: error.message,
      timestamp: new Date()
    });
    
    // Mark as error
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
      const processedCount = this.stats.emailsProcessed;
      
      // Get processed message stats
      const processedStats = await this.storage.getProcessedStats();
      const recentlyProcessed = await this.storage.getRecentlyProcessed(5);
      
      const report = {
        ...this.stats,
        endTime,
        durationSeconds: duration,
        successRate: this.stats.emailsFound > 0 ? (this.stats.emailsProcessed / this.stats.emailsFound * 100).toFixed(1) : 0,
        processedMessageStats: processedStats,
        recentlyProcessed,
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          workflowRunId: process.env.WORKFLOW_RUN_ID || 'local',
          debugMode: CONFIG.DEBUG_MODE,
          dryRun: CONFIG.DRY_RUN,
          authMethod: 'OAuth2',
          messageTrackingEnabled: true
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
      logger.info(`📄 PDFs processed: ${this.stats.ocrProcessed}`);
      
      // Message tracking stats
      logger.info('📝 ===== MESSAGE TRACKING STATS =====');
      logger.info(`📊 Total tracked messages: ${processedStats.total}`);
      logger.info(`✅ Successfully processed: ${processedStats.success}`);
      logger.info(`🔄 Duplicates prevented: ${processedStats.duplicates}`);
      logger.info(`⏭️ Skipped messages: ${processedStats.skipped}`);
      logger.info(`❌ Error messages: ${processedStats.errors}`);
      
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
 
 // Enhanced error handling with better debugging
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
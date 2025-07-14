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
      // Removed: this.ocr = new OCRService();
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
        errors: []
      };
    }

  async initialize() {
    logger.info('🚀 Initializing Applicant Processor...');
    
    // Ensure logs directory exists
    await fs.mkdir('logs', { recursive: true });
    
    // Test all service connections
    await this.testConnections();
    
    logger.info('✅ Initialization complete');
  }

  async testConnections() {
    logger.info('🔍 Testing service connections...');
    
    const tests = [
      { name: 'Supabase', test: () => this.supabase.testConnection() },
      { name: 'Google Sheets', test: () => this.sheets.testConnection() },
      { name: 'Google Drive', test: () => this.drive.testConnection() },
      { name: 'OpenAI', test: () => this.openai.testConnection() }
      // Gmail test removed - will be tested during actual email processing
    ];
  
    for (const { name, test } of tests) {
      try {
        await test();
        logger.info(`✅ ${name} connection successful`);
      } catch (error) {
        logger.error(`❌ ${name} connection failed: ${error.message}`);
        throw new Error(`${name} service unavailable: ${error.message}`);
      }
    }
    
    // Add informational message about Gmail
    logger.info('📧 Gmail connection will be tested during email processing');
    logger.info('   If Gmail fails, you\'ll see errors in the email processing step');
  }

  async processEmails() {
    try {
      logger.info('🔥 Starting email processing cycle...');
      
      // Test Gmail connection here during actual usage
      let messages = [];
      try {
        logger.info('📧 Attempting to fetch emails from Gmail...');
        messages = await this.gmail.getLatestEmails(CONFIG.BATCH_SIZE);
        logger.info(`✅ Gmail connection successful - found ${messages.length} emails`);
      } catch (gmailError) {
        logger.error('❌ Gmail connection failed during email fetch:');
        logger.error(`   Error: ${gmailError.message}`);
        logger.error(`   Code: ${gmailError.code || 'N/A'}`);
        
        // Provide specific guidance
        if (gmailError.code === 403) {
          logger.error('🔧 Gmail Permission Fix Required:');
          logger.error('   1. Configure domain-wide delegation in admin.google.com');
          logger.error('   2. Add Gmail scopes to service account');
          logger.error('   3. Ensure GMAIL_USER_EMAIL is Google Workspace (not @gmail.com)');
        }
        
        logger.warn('⚠️ Skipping email processing due to Gmail connectivity issues');
        return; // Exit gracefully instead of crashing
      }
      
      this.stats.emailsFound = messages.length;
      
      if (messages.length === 0) {
        logger.info('📭 No new emails found');
        return;
      }
  
      // Continue with normal processing...
      for (const message of messages) {
        try {
          await this.processMessage(message);
        } catch (error) {
          this.stats.emailsErrored++;
          this.stats.errors.push({
            messageId: message.id,
            subject: message.subject,
            error: error.message,
            timestamp: new Date()
          });
          logger.error(`❌ Error processing message ${message.id}:`, error);
        }
      }
      
      await this.generateReport();
      logger.info('✅ Email processing cycle completed');
      
    } catch (error) {
      logger.error('❌ Fatal error in email processing:', error);
      throw error;
    }
  }

  async processMessage(message) {
  const startTime = Date.now();
  logger.info(`🔄 Processing: "${message.subject}" (${message.id})`);
  
  // Check if already processed
  if (await this.storage.isProcessed(message.id)) {
    logger.info(`⏭️ Already processed: ${message.id}`);
    this.stats.emailsSkipped++;
    return;
  }
  
  // Check if LinkedIn application
  if (!this.parser.isLinkedInApplication(message)) {
    logger.info(`📧 Not a LinkedIn application: ${message.id}`);
    await this.storage.markProcessed(message.id, 'not_linkedin');
    this.stats.emailsSkipped++;
    return;
  }
  
  // Check email age
  const emailAge = (new Date() - message.date) / (1000 * 60 * 60 * 24);
  if (emailAge > CONFIG.MAX_EMAIL_AGE_DAYS) {
    logger.info(`⏳ Email too old (${emailAge.toFixed(1)} days): ${message.id}`);
    await this.storage.markProcessed(message.id, 'too_old');
    this.stats.emailsSkipped++;
    return;
  }
  
  // Parse LinkedIn application data
  const parsedData = this.parser.parseLinkedInApplication(message);
  
  if (!parsedData.name?.trim()) {
    logger.warn(`⚠️ No applicant name found: ${message.id}`);
    await this.storage.markProcessed(message.id, 'no_name');
    this.stats.emailsSkipped++;
    return;
  }
  
  logger.info(`👤 Processing applicant: ${parsedData.name}`);
  
  // Process attachments - Upload to Drive and OCR
  let resumeText = null;
  let resumeDriveLink = null;
  
  if (message.attachments?.length > 0) {
    const pdfAttachment = message.attachments.find(att => 
      att.mimeType === 'application/pdf'
    );
    
    if (pdfAttachment) {
      try {
        logger.info(`📄 Processing PDF attachment: ${pdfAttachment.filename}`);
        
        // Download attachment
        const attachmentData = await this.gmail.downloadAttachment(
          message.id, 
          pdfAttachment.attachmentId
        );
        
        // Upload to Drive for permanent storage
        resumeDriveLink = await this.drive.uploadFile(
          attachmentData,
          `${parsedData.name}_${parsedData.project_id || 'CV'}.pdf`,
          pdfAttachment.mimeType
        );
        
        logger.info(`📁 PDF uploaded to Drive: ${resumeDriveLink}`);
        
        // Process with Google Drive OCR (if enabled)
        if (CONFIG.ENABLE_OCR) {
          try {
            logger.info(`🔍 Processing with Google Drive OCR...`);
            const ocrResult = await this.drive.convertPDFToText(attachmentData, pdfAttachment.filename);
            resumeText = ocrResult.text;
            this.stats.ocrProcessed++;
            logger.info(`📖 OCR completed: ${ocrResult.length} characters extracted`);
          } catch (ocrError) {
            logger.error(`❌ OCR processing failed:`, ocrError);
            resumeText = `OCR processing failed: ${ocrError.message}\nPDF stored at: ${resumeDriveLink}`;
          }
        } else {
          logger.info(`📄 OCR disabled - PDF stored without text extraction`);
          resumeText = `OCR disabled - PDF stored at: ${resumeDriveLink}`;
        }
        
      } catch (error) {
        logger.error(`❌ Error processing PDF attachment:`, error);
        resumeText = `PDF processing failed: ${error.message}`;
      }
    } else {
      logger.info(`📎 No PDF attachments found (${message.attachments.length} attachments total)`);
    }
  }
  
  // Extract contact info with GPT
  let contactInfo = { mobile_number: null, email: null, linkedin_url: null };
  
  if (resumeText && CONFIG.ENABLE_GPT) {
    try {
      logger.info(`🤖 Extracting contact info with GPT...`);
      contactInfo = await this.openai.extractContactInfo(resumeText);
      logger.info(`📞 Contact info extracted:`, contactInfo);
    } catch (error) {
      logger.error(`❌ GPT extraction failed:`, error);
    }
  } else if (!CONFIG.ENABLE_GPT) {
    logger.info(`🤖 GPT extraction disabled`);
  } else {
    logger.info(`🤖 No resume text available for GPT extraction`);
  }
  
  // Determine primary email
  const applicantEmail = contactInfo.email || this.extractEmailFromSender(message);
  
  if (!applicantEmail) {
    logger.warn(`⚠️ No email found for applicant: ${parsedData.name}`);
    await this.storage.markProcessed(message.id, 'no_email');
    this.stats.emailsSkipped++;
    return;
  }
  
  // Check for duplicates
  if (await this.supabase.emailExists(applicantEmail)) {
    logger.info(`🔄 Duplicate email found: ${applicantEmail}`);
    await this.storage.markProcessed(message.id, 'duplicate_email');
    this.stats.duplicatesFound++;
    return;
  }
  
  // Prepare complete applicant data
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
    processed_at: new Date().toISOString(),
    source_message_id: message.id,
    processing_time_ms: Date.now() - startTime
  };
  
  // Store in both Sheets and Supabase (unless dry run)
  if (!CONFIG.DRY_RUN) {
    await Promise.all([
      this.sheets.appendApplicant(applicantData),
      this.supabase.createApplicant(applicantData)
    ]);
    
    // Mark as processed
    await this.storage.markProcessed(message.id, 'success');
  } else {
    logger.info('🧪 DRY RUN: Would store data:', JSON.stringify(applicantData, null, 2));
    logger.info('🧪 DRY RUN: Would mark message as processed');
  }
  
  this.stats.emailsProcessed++;
  this.stats.applicantsCreated++;
  
  const processingTime = Date.now() - startTime;
  logger.info(`✅ Successfully processed: ${parsedData.name} (${applicantEmail}) in ${processingTime}ms`);
}

  extractEmailFromSender(message) {
    const match = message.from.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    return match ? match[1] : null;
  }

  async generateReport() {
    const endTime = new Date();
    const duration = (endTime - this.stats.startTime) / 1000;
    
    const report = {
      ...this.stats,
      endTime,
      durationSeconds: duration,
      environment: {
        nodeVersion: process.version,
        workflowRunId: process.env.WORKFLOW_RUN_ID,
        workflowRunNumber: process.env.WORKFLOW_RUN_NUMBER
      }
    };
    
    // Save stats for artifacts
    await fs.writeFile('stats.json', JSON.stringify(report, null, 2));
    
    // Log summary
    logger.info('📊 PROCESSING SUMMARY:');
    logger.info(`   Total emails found: ${this.stats.emailsFound}`);
    logger.info(`   Emails processed: ${this.stats.emailsProcessed}`);
    logger.info(`   Emails skipped: ${this.stats.emailsSkipped}`);
    logger.info(`   Errors encountered: ${this.stats.emailsErrored}`);
    logger.info(`   New applicants created: ${this.stats.applicantsCreated}`);
    logger.info(`   Duplicates found: ${this.stats.duplicatesFound}`);
    logger.info(`   PDFs processed with OCR: ${this.stats.ocrProcessed}`);
    logger.info(`   Duration: ${duration.toFixed(1)}s`);
    
    if (this.stats.errors.length > 0) {
      logger.warn(`⚠️ Errors encountered:`);
      this.stats.errors.forEach(error => {
        logger.warn(`   - ${error.subject}: ${error.error}`);
      });
    }
  }
}

// Main execution
async function main() {
  const processor = new ApplicantProcessor();
  
  try {
    await processor.initialize();
    await processor.processEmails();
    
    logger.info('🎉 Application completed successfully');
    process.exit(0);
    
  } catch (error) {
    logger.error('💥 Fatal application error:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

main();
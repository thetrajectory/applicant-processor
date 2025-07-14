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
      errors: []
    };
  }

  async initialize() {
    logger.info('🚀 Initializing Applicant Processor...');
    
    try {
      // Ensure logs directory exists
      await fs.mkdir('logs', { recursive: true });
      
      // Test all service connections
      await this.testConnections();
      
      logger.info('✅ Initialization complete');
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
      { name: 'OpenAI', test: () => this.openai.testConnection(), critical: true }
      // Gmail test removed - will be tested during email processing
    ];

    let criticalFailures = 0;

    for (const { name, test, critical } of tests) {
      try {
        await test();
        logger.info(`✅ ${name} connection successful`);
      } catch (error) {
        logger.error(`❌ ${name} connection failed:`);
        logger.error(`   Message: ${error.message}`);
        logger.error(`   Code: ${error.code || 'N/A'}`);
        logger.error(`   Status: ${error.status || 'N/A'}`);
        
        if (error.stack) {
          logger.error(`   Stack: ${error.stack}`);
        }
        
        if (critical) {
          criticalFailures++;
          logger.error(`🚨 ${name} is critical - this will prevent processing`);
        } else {
          logger.warn(`⚠️ ${name} failed but processing can continue`);
        }
      }
    }
    
    // Gmail will be tested during email processing
    logger.info('📧 Gmail will be tested during email processing');
    
    if (criticalFailures > 0) {
      throw new Error(`${criticalFailures} critical service(s) failed - cannot proceed`);
    }
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
        logger.error(`   Stack: ${gmailError.stack || 'No stack trace'}`);
        
        // Provide specific guidance
        if (gmailError.code === 403) {
          logger.error('🔧 Gmail Permission Fix Required:');
          logger.error('   1. Configure domain-wide delegation in admin.google.com');
          logger.error('   2. Add Gmail scopes to service account');
          logger.error('   3. Ensure GMAIL_USER_EMAIL is Google Workspace (not @gmail.com)');
        } else if (gmailError.message.includes('delegation') || gmailError.message.includes('impersonat')) {
          logger.error('🔧 Domain-Wide Delegation Issue:');
          logger.error('   1. Go to admin.google.com');
          logger.error('   2. Security → API Controls → Domain-wide delegation');
          logger.error('   3. Add Client ID: 117017463249548390241');
          logger.error('   4. Add scopes: https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/gmail.modify');
        } else if (gmailError.message.includes('credentials') || gmailError.message.includes('client_email')) {
          logger.error('🔧 Credentials Issue:');
          logger.error('   1. Check GOOGLE_CREDENTIALS secret in GitHub');
          logger.error('   2. Ensure it contains valid service account JSON');
          logger.error('   3. Verify client_email field exists');
        }
        
        logger.warn('⚠️ Skipping email processing due to Gmail connectivity issues');
        logger.warn('   Fix the Gmail issues above and re-run the workflow');
        return; // Exit gracefully instead of crashing
      }
      
      this.stats.emailsFound = messages.length;
      
      if (messages.length === 0) {
        logger.info('📭 No new emails found');
        logger.info('   This could mean:');
        logger.info('   - No new LinkedIn job applications');
        logger.info('   - All recent emails already processed');
        logger.info('   - Emails older than MAX_EMAIL_AGE_DAYS setting');
        return;
      }

      logger.info(`📋 Processing ${messages.length} emails...`);

      // Process each message
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
          logger.error(`❌ Error processing message ${message.id}:`, {
            subject: message.subject,
            error: error.message,
            stack: error.stack
          });
          
          // Continue processing other emails even if one fails
          logger.info(`   Continuing with remaining ${messages.length - i - 1} emails...`);
        }
      }
      
      await this.generateReport();
      logger.info('✅ Email processing cycle completed');
      
    } catch (error) {
      logger.error('❌ Fatal error in email processing:', {
        message: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async processMessage(message) {
    const startTime = Date.now();
    logger.info(`🔄 Processing: "${message.subject}" (${message.id})`);
    
    try {
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
            
            logger.info(`📥 Downloaded attachment: ${attachmentData.length} bytes`);
            
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
            logger.error(`❌ Error processing PDF attachment:`, {
              filename: pdfAttachment.filename,
              error: error.message,
              stack: error.stack
            });
            resumeText = `PDF processing failed: ${error.message}`;
          }
        } else {
          logger.info(`📎 No PDF attachments found (${message.attachments.length} attachments total)`);
          
          // Log what attachments we did find
          message.attachments.forEach((att, i) => {
            logger.info(`   ${i + 1}. ${att.filename} (${att.mimeType})`);
          });
        }
      } else {
        logger.info(`📎 No attachments found`);
      }
      
      // Extract contact info with GPT
      let contactInfo = { mobile_number: null, email: null, linkedin_url: null };
      
      if (resumeText && CONFIG.ENABLE_GPT) {
        try {
          logger.info(`🤖 Extracting contact info with GPT...`);
          contactInfo = await this.openai.extractContactInfo(resumeText);
          logger.info(`📞 Contact info extracted:`, contactInfo);
        } catch (error) {
          logger.error(`❌ GPT extraction failed:`, {
            error: error.message,
            stack: error.stack
          });
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
        logger.warn(`   GPT extracted email: ${contactInfo.email || 'None'}`);
        logger.warn(`   Sender email: ${this.extractEmailFromSender(message) || 'None'}`);
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
        try {
          logger.info(`💾 Storing applicant data for: ${applicantData.name}`);
          
          await Promise.all([
            this.sheets.appendApplicant(applicantData),
            this.supabase.createApplicant(applicantData)
          ]);
          
          logger.info(`📊 Data stored in Sheets and Supabase`);
          
          // Mark as processed
          await this.storage.markProcessed(message.id, 'success');
          
        } catch (storageError) {
          logger.error(`❌ Error storing applicant data:`, {
            applicant: applicantData.name,
            email: applicantData.email,
            error: storageError.message,
            stack: storageError.stack
          });
          throw storageError;
        }
      } else {
        logger.info('🧪 DRY RUN: Would store data for:', applicantData.name);
        logger.info('🧪 DRY RUN: Would mark message as processed');
      }
      
      this.stats.emailsProcessed++;
      this.stats.applicantsCreated++;
      
      const processingTime = Date.now() - startTime;
      logger.info(`✅ Successfully processed: ${parsedData.name} (${applicantEmail}) in ${processingTime}ms`);
      
      // Log key details for verification
      logger.info(`   📋 Details: Title="${parsedData.title || 'N/A'}", Location="${parsedData.location || 'N/A'}"`);
      logger.info(`   📞 Contact: Mobile="${contactInfo.mobile_number || 'N/A'}", LinkedIn="${contactInfo.linkedin_url || 'N/A'}"`);
      logger.info(`   📄 Resume: ${resumeDriveLink ? 'Uploaded to Drive' : 'No PDF'}, OCR: ${resumeText ? 'Extracted' : 'None'}`);
      
    } catch (error) {
      logger.error(`❌ Error in processMessage for ${message.id}:`, {
        subject: message.subject,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  extractEmailFromSender(message) {
    try {
      const match = message.from.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      return match ? match[1] : null;
    } catch (error) {
      logger.error(`Error extracting email from sender:`, error);
      return null;
    }
  }

  async generateReport() {
    try {
      const endTime = new Date();
      const duration = (endTime - this.stats.startTime) / 1000;
      
      const report = {
        ...this.stats,
        endTime,
        durationSeconds: duration,
        successRate: this.stats.emailsFound > 0 ? (this.stats.emailsProcessed / this.stats.emailsFound * 100).toFixed(1) : 0,
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          workflowRunId: process.env.WORKFLOW_RUN_ID || 'local',
          workflowRunNumber: process.env.WORKFLOW_RUN_NUMBER || 'local',
          debugMode: CONFIG.DEBUG_MODE,
          dryRun: CONFIG.DRY_RUN
        }
      };
      
      // Save stats for artifacts
      await fs.writeFile('stats.json', JSON.stringify(report, null, 2));
      
      // Log comprehensive summary
      logger.info('📊 ===== PROCESSING SUMMARY =====');
      logger.info(`🔥 Total emails found: ${this.stats.emailsFound}`);
      logger.info(`✅ Emails processed: ${this.stats.emailsProcessed}`);
      logger.info(`⏭️ Emails skipped: ${this.stats.emailsSkipped}`);
      logger.info(`❌ Errors encountered: ${this.stats.emailsErrored}`);
      logger.info(`👥 New applicants created: ${this.stats.applicantsCreated}`);
      logger.info(`🔄 Duplicates found: ${this.stats.duplicatesFound}`);
      logger.info(`📄 PDFs processed with OCR: ${this.stats.ocrProcessed}`);
      logger.info(`📈 Success rate: ${report.successRate}%`);
      logger.info(`⏱️ Total duration: ${duration.toFixed(1)}s`);
      
      if (this.stats.errors.length > 0) {
        logger.warn(`⚠️ ${this.stats.errors.length} Errors encountered:`);
        this.stats.errors.forEach((error, i) => {
          logger.warn(`   ${i + 1}. "${error.subject}": ${error.error}`);
        });
      }
      
      // Performance insights
      if (this.stats.emailsFound > 0) {
        const avgProcessingTime = duration / this.stats.emailsFound;
        logger.info(`📊 Average processing time per email: ${avgProcessingTime.toFixed(2)}s`);
      }
      
      // Recommendations
      if (this.stats.emailsProcessed === 0 && this.stats.emailsFound > 0) {
        logger.warn('⚠️ No emails were successfully processed!');
        logger.warn('   Check for configuration issues or permission problems');
      } else if (this.stats.duplicatesFound > this.stats.applicantsCreated) {
        logger.info('ℹ️ High number of duplicates detected');
        logger.info('   This is normal if the system has been running for a while');
      }
      
      logger.info('📊 ===== END SUMMARY =====');
      
    } catch (error) {
      logger.error('❌ Error generating report:', {
        error: error.message,
        stack: error.stack
      });
    }
  }
}

// Enhanced error handling
process.on('unhandledRejection', (reason, promise) => {
  logger.error('🚨 Unhandled Promise Rejection detected!');
  logger.error('🚨 Promise:', promise);
  logger.error('🚨 Reason:', reason);
  logger.error('🚨 Stack:', reason.stack || 'No stack trace available');
  
  // Log additional debugging information
  logger.error('🔍 Process debugging info:', {
    pid: process.pid,
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
    nodeVersion: process.version,
    platform: process.platform
  });
  
  // Don't exit immediately - log the error and continue
  logger.warn('⚠️ Continuing execution despite unhandled rejection...');
  logger.warn('   This error has been logged and the process will continue');
  logger.warn('   Check the logs above for the specific issue that needs to be fixed');
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('🚨 Uncaught Exception detected!');
  logger.error('🚨 Error:', error);
  logger.error('🚨 Stack:', error.stack);
  
  logger.error('🔍 Process debugging info:', {
    pid: process.pid,
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime()
  });
  
  // Exit gracefully for uncaught exceptions
  logger.error('💥 Exiting due to uncaught exception...');
  process.exit(1);
});

// Graceful shutdown handling
process.on('SIGINT', () => {
  logger.info('🛑 Received SIGINT signal, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('🛑 Received SIGTERM signal, shutting down gracefully...');
  process.exit(0);
});

// Main execution function
async function main() {
  const processor = new ApplicantProcessor();
  
  try {
    logger.info('🚀 ===== APPLICANT PROCESSOR STARTING =====');
    logger.info(`🔧 Configuration:`);
    logger.info(`   Environment: ${CONFIG.IS_GITHUB_ACTIONS ? 'GitHub Actions' : 'Local'}`);
    logger.info(`   Debug Mode: ${CONFIG.DEBUG_MODE}`);
    logger.info(`   Dry Run: ${CONFIG.DRY_RUN}`);
    logger.info(`   Batch Size: ${CONFIG.BATCH_SIZE}`);
    logger.info(`   Max Email Age: ${CONFIG.MAX_EMAIL_AGE_DAYS} days`);
    logger.info(`   OCR Enabled: ${CONFIG.ENABLE_OCR}`);
    logger.info(`   GPT Enabled: ${CONFIG.ENABLE_GPT}`);
    logger.info('');
    
    await processor.initialize();
    await processor.processEmails();
    
    logger.info('🎉 ===== APPLICATION COMPLETED SUCCESSFULLY =====');
    logger.info('   All email processing has finished');
    logger.info('   Check the processing summary above for details');
    logger.info('   Logs and stats have been saved for review');
    
    process.exit(0);
    
  } catch (error) {
    logger.error('💥 ===== FATAL APPLICATION ERROR =====');
    logger.error('🚨 Error Details:', {
      message: error.message,
      name: error.name,
      code: error.code,
      stack: error.stack
    });
    
    // Log additional context for debugging
    logger.error('🔍 Application Context:', {
      nodeVersion: process.version,
      platform: process.platform,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      environment: CONFIG.IS_GITHUB_ACTIONS ? 'GitHub Actions' : 'Local',
      configLoaded: !!CONFIG,
      credentialsAvailable: !!(CONFIG.GOOGLE_CREDENTIALS && CONFIG.GOOGLE_CREDENTIALS.client_email)
    });
    
    logger.error('💡 Troubleshooting suggestions:');
    logger.error('   1. Check all environment variables are set correctly');
    logger.error('   2. Verify Google service account permissions');
    logger.error('   3. Ensure domain-wide delegation is configured');
    logger.error('   4. Check Gmail user email is Google Workspace (not @gmail.com)');
    logger.error('   5. Verify Supabase database and tables exist');
    logger.error('   6. Check OpenAI API key has sufficient credits');
    
    process.exit(1);
  }
}

// Start the application
main();
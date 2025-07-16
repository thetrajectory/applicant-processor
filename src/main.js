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

  async initialize() {
    logger.info('🚀 Initializing Enhanced Applicant Processor...');
    
    try {
      await fs.mkdir('logs', { recursive: true });
      await this.testConnections();
      await this.sheets.initializeSheet();
      
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

  async processMessage(message) {
    const startTime = Date.now();
    logger.info(`🔄 Processing: "${message.subject}" (${message.id})`);
    
    try {
      if (!this.parser.isLinkedInApplication(message)) {
        logger.info(`📧 Not a LinkedIn application: ${message.id}`);
        this.stats.emailsSkipped++;
        return;
      }
      
      const emailAge = (new Date() - message.date) / (1000 * 60 * 60 * 24);
      if (emailAge > CONFIG.MAX_EMAIL_AGE_DAYS) {
        logger.info(`⏳ Email too old (${emailAge.toFixed(1)} days): ${message.id}`);
        this.stats.emailsSkipped++;
        return;
      }
      
      // Enhanced parsing with detailed logging
      const parsedData = this.parser.parseLinkedInApplication(message);
      
      // Update parsing success stats
      this.updateParsingStats(parsedData);
      
      if (!parsedData.name?.trim()) {
        logger.warn(`⚠️ No applicant name found: ${message.id}`);
        this.stats.emailsSkipped++;
        return;
      }
      
      logger.info(`👤 Processing applicant: ${parsedData.name}`);
      logger.info(`📊 Parsing results - Title: ${parsedData.title ? '✅' : '❌'}, Location: ${parsedData.location ? '✅' : '❌'}, Compensation: ${parsedData.expected_compensation ? '✅' : '❌'}, Project ID: ${parsedData.project_id ? '✅' : '❌'}`);
      
      // Process attachments
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
              message.id, 
              pdfAttachment.attachmentId
            );
            
            logger.info(`📥 Downloaded attachment: ${attachmentData.length} bytes`);
            
            resumeDriveLink = await this.drive.uploadFile(
              attachmentData,
              `${parsedData.name}_${parsedData.project_id || 'CV'}.pdf`,
              pdfAttachment.mimeType
            );
            
            logger.info(`📁 PDF uploaded to Drive: ${resumeDriveLink}`);
            
            if (CONFIG.ENABLE_OCR) {
              try {
                logger.info(`🔍 Processing with OCR...`);
                const ocrResult = await this.drive.convertPDFToText(attachmentData, pdfAttachment.filename);
                resumeText = ocrResult.text;
                this.stats.ocrProcessed++;
                logger.info(`📖 OCR completed: ${ocrResult.length} characters extracted`);
              } catch (ocrError) {
                logger.error(`❌ OCR processing failed:`, ocrError.message);
                resumeText = `OCR processing failed: ${ocrError.message}\nPDF stored at: ${resumeDriveLink}`;
              }
            } else {
              logger.info(`📄 OCR disabled - PDF stored without text extraction`);
              resumeText = `OCR disabled - PDF stored at: ${resumeDriveLink}`;
            }
            
          } catch (error) {
            logger.error(`❌ Error processing PDF attachment:`, error.message);
            resumeText = `PDF processing failed: ${error.message}`;
          }
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
          logger.error(`❌ GPT extraction failed:`, error.message);
        }
      }
      
      const applicantEmail = contactInfo.email;
      if (!applicantEmail) {
        logger.warn(`⚠️ No email found in resume for applicant: ${parsedData.name}`);
        this.stats.emailsSkipped++;
        return;
      }
      
      // Check for duplicates using email AND project_id
      const isDuplicate = await this.supabase.isDuplicateApplicant(applicantEmail, parsedData.project_id);
      
      if (isDuplicate) {
        logger.info(`🔄 Duplicate applicant: ${applicantEmail} for project ${parsedData.project_id || 'N/A'}`);
        this.stats.duplicatesFound++;
        return;
      }
      
      // Prepare complete applicant data matching schema
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
      
      // Store in both Sheets and Supabase
      if (!CONFIG.DRY_RUN) {
        try {
          logger.info(`💾 Storing applicant data for: ${applicantData.name}`);
          
          await Promise.all([
            this.sheets.appendApplicant(applicantData),
            this.supabase.createApplicant(applicantData)
          ]);
          
          logger.info(`📊 Data stored in Sheets and Supabase`);
          
        } catch (storageError) {
          logger.error(`❌ Error storing applicant data:`, storageError.message);
          throw storageError;
        }
      } else {
        logger.info('🧪 DRY RUN: Would store data for:', applicantData.name);
      }
      
      this.stats.emailsProcessed++;
      this.stats.applicantsCreated++;
      
      const processingTime = Date.now() - startTime;
      logger.info(`✅ Successfully processed: ${parsedData.name} (${applicantEmail}) in ${processingTime}ms`);
      
      // Enhanced logging with parsing quality metrics
      logger.info(`   📋 Parsing Quality - Name: ✅, Title: ${parsedData.title ? '✅' : '❌'}, Location: ${parsedData.location ? '✅' : '❌'}`);
      logger.info(`   💰 Compensation: ${parsedData.expected_compensation ? '✅ ' + parsedData.expected_compensation : '❌'}, Project: ${parsedData.project_id ? '✅ ' + parsedData.project_id : '❌'}`);
      logger.info(`   📞 Contact: Mobile="${contactInfo.mobile_number || 'N/A'}", LinkedIn="${contactInfo.linkedin_url || 'N/A'}"`);
      logger.info(`   📄 Resume: ${resumeDriveLink ? 'Uploaded to Drive' : 'No PDF'}, OCR: ${resumeText ? 'Extracted' : 'None'}`);
      
    } catch (error) {
      logger.error(`❌ Error in processMessage for ${message.id}:`, error.message);
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
 
  async generateEnhancedReport() {
    try {
      const endTime = new Date();
      const duration = (endTime - this.stats.startTime) / 1000;
      const processedCount = this.stats.emailsProcessed;
      
      // Calculate parsing success rates
      const parsingRates = {};
      Object.keys(this.stats.parsingSuccessRate).forEach(key => {
        parsingRates[key] = processedCount > 0 
          ? ((this.stats.parsingSuccessRate[key] / processedCount) * 100).toFixed(1)
          : 0;
      });
      
      const report = {
        ...this.stats,
        endTime,
        durationSeconds: duration,
        successRate: this.stats.emailsFound > 0 ? (this.stats.emailsProcessed / this.stats.emailsFound * 100).toFixed(1) : 0,
        parsingSuccessRates: parsingRates,
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          workflowRunId: process.env.WORKFLOW_RUN_ID || 'local',
          debugMode: CONFIG.DEBUG_MODE,
          dryRun: CONFIG.DRY_RUN,
          authMethod: 'OAuth2'
        }
      };
      
      await fs.writeFile('stats.json', JSON.stringify(report, null, 2));
      
      // Enhanced logging with parsing quality metrics
      logger.info('📊 ===== ENHANCED PROCESSING SUMMARY =====');
      logger.info(`🔥 Total emails found: ${this.stats.emailsFound}`);
      logger.info(`✅ Emails processed: ${this.stats.emailsProcessed}`);
      logger.info(`⏭️ Emails skipped: ${this.stats.emailsSkipped}`);
      logger.info(`❌ Errors encountered: ${this.stats.emailsErrored}`);
      logger.info(`👥 New applicants created: ${this.stats.applicantsCreated}`);
      logger.info(`🔄 Duplicates found: ${this.stats.duplicatesFound}`);
      logger.info(`📄 PDFs processed: ${this.stats.ocrProcessed}`);
      logger.info(`📈 Success rate: ${report.successRate}%`);
      logger.info(`⏱️ Total duration: ${duration.toFixed(1)}s`);
      
      // Detailed parsing quality report
      logger.info('🎯 ===== PARSING QUALITY METRICS =====');
      logger.info(`📝 Name extraction: ${parsingRates.name}% (${this.stats.parsingSuccessRate.name}/${processedCount})`);
      logger.info(`💼 Title extraction: ${parsingRates.title}% (${this.stats.parsingSuccessRate.title}/${processedCount})`);
      logger.info(`📍 Location extraction: ${parsingRates.location}% (${this.stats.parsingSuccessRate.location}/${processedCount})`);
      logger.info(`💰 Compensation extraction: ${parsingRates.compensation}% (${this.stats.parsingSuccessRate.compensation}/${processedCount})`);
      logger.info(`🆔 Project ID extraction: ${parsingRates.projectId}% (${this.stats.parsingSuccessRate.projectId}/${processedCount})`);
      logger.info(`❓ Screening Questions extraction: ${parsingRates.screeningQuestions}% (${this.stats.parsingSuccessRate.screeningQuestions}/${processedCount})`);
      
      if (this.stats.errors.length > 0) {
        logger.warn(`⚠️ ${this.stats.errors.length} Errors encountered:`);
        this.stats.errors.forEach((error, i) => {
          logger.warn(`   ${i + 1}. "${error.subject}": ${error.error}`);
        });
      }
      
      // Performance and quality insights
      if (this.stats.emailsFound > 0) {
        const avgProcessingTime = duration / this.stats.emailsFound;
        logger.info(`📊 Average processing time per email: ${avgProcessingTime.toFixed(2)}s`);
      }
      
      // Quality recommendations
      const lowQualityFields = Object.entries(parsingRates).filter(([_, rate]) => parseFloat(rate) < 70);
      if (lowQualityFields.length > 0) {
        logger.warn('🔧 ===== PARSING IMPROVEMENT RECOMMENDATIONS =====');
        lowQualityFields.forEach(([field, rate]) => {
          logger.warn(`   ${field}: ${rate}% - Consider reviewing parsing patterns`);
        });
      }
      
      logger.info('📊 ===== END ENHANCED SUMMARY =====');
      
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
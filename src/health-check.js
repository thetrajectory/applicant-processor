// Enhanced health check for dual table system
import { createLogger } from './utils/logger.js';
import { OAuth2AuthService } from './services/oauth-auth.js';
import { GmailService } from './services/gmail.js';
import { DriveService } from './services/drive.js';
import { SheetsService } from './services/sheets.js';
import { SupabaseService } from './services/supabase.js';
import { OpenAIService } from './services/openai.js';
import { StorageManager } from './utils/storage.js';
import { CONFIG } from './config.js';

const logger = createLogger();

async function runHealthCheck() {
  logger.info('🏥 Starting enhanced OAuth2-based system health check...');
  logger.info(`   Main Table: ${CONFIG.TABLE_NAME}`);
  logger.info(`   Tracking Table: ${CONFIG.PROCESSED_MESSAGES_TABLE}`);
  
  const services = [
    { name: 'OAuth2 Authentication', service: OAuth2AuthService },
    { name: 'Supabase (Dual Tables)', service: SupabaseService },
    { name: 'Storage Manager (Message Tracking)', service: StorageManager },
    { name: 'Google Sheets', service: SheetsService },
    { name: 'Google Drive', service: DriveService },
    { name: 'Gmail', service: GmailService },
    { name: 'OpenAI', service: OpenAIService }
  ];
  
  const results = [];
  
  for (const { name, service } of services) {
    try {
      logger.info(`🔍 Testing ${name}...`);
      const instance = new service();
      await instance.testConnection();
      results.push({ name, status: 'OK', error: null });
      logger.info(`✅ ${name}: OK`);
    } catch (error) {
      results.push({ name, status: 'ERROR', error: error.message });
      logger.error(`❌ ${name}: ${error.message}`);
    }
  }
  
  // Test storage manager specifically
  try {
    logger.info('🔍 Testing enhanced storage manager...');
    const storage = new StorageManager();
    await storage.initializeTable();
    
    // Test getting stats
    const stats = await storage.getProcessedStats();
    logger.info(`📊 Processed message stats: ${JSON.stringify(stats)}`);
    
    const applicantStats = await storage.getApplicantStats();
    logger.info(`👥 Applicant stats: ${JSON.stringify(applicantStats)}`);
    
    logger.info('✅ Storage manager comprehensive test: OK');
  } catch (error) {
    logger.error(`❌ Storage manager comprehensive test: ${error.message}`);
  }
  
  const healthyServices = results.filter(r => r.status === 'OK').length;
  const totalServices = results.length;
  
  logger.info(`🏥 Health check complete: ${healthyServices}/${totalServices} services healthy`);
  
  if (healthyServices === totalServices) {
    logger.info('🎉 All systems operational! Ready to process emails with message tracking.');
    logger.info('');
    logger.info('📋 Key Features Enabled:');
    logger.info('   ✅ Dual table message tracking');
    logger.info('   ✅ Duplicate prevention at message level');
    logger.info('   ✅ Error status tracking');
    logger.info('   ✅ Already processed detection');
    logger.info('   ✅ Complete processing audit trail');
  } else {
    logger.warn('⚠️ Some services need attention before processing can begin.');
  }
  
  if (healthyServices < totalServices) {
    process.exit(1);
  }
}

runHealthCheck().catch(error => {
  logger.error('💥 Health check failed:', error);
  process.exit(1);
});
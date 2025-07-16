import { createLogger } from './utils/logger.js';
import { OAuth2AuthService } from './services/oauth-auth.js';
import { GmailService } from './services/gmail.js';
import { DriveService } from './services/drive.js';
import { SheetsService } from './services/sheets.js';
import { SupabaseService } from './services/supabase.js';
import { OpenAIService } from './services/openai.js';

const logger = createLogger();

async function runHealthCheck() {
  logger.info('🏥 Starting OAuth2-based system health check...');
  
  const services = [
    { name: 'OAuth2 Authentication', service: OAuth2AuthService },
    { name: 'Supabase', service: SupabaseService },
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
      
      // Provide specific guidance for common issues
      if (name === 'OAuth2 Authentication') {
        logger.error('🔧 OAuth2 Fix Required:');
        logger.error('   1. Run: npm run setup');
        logger.error('   2. Complete OAuth2 authorization');
        logger.error('   3. Add GOOGLE_REFRESH_TOKEN to environment');
      } else if (name === 'Google Sheets' && error.message.includes('403')) {
        logger.error('🔧 Sheets Permission Fix Required:');
        logger.error('   1. Share the Google Sheet with your Google account');
        logger.error('   2. Grant "Editor" permissions');
        logger.error('   3. Verify the GOOGLE_SHEET_ID is correct');
      } else if (name === 'Google Drive' && error.message.includes('403')) {
        logger.error('🔧 Drive Permission Fix Required:');
        logger.error('   1. Share the Google Drive folder with your Google account');
        logger.error('   2. Grant "Editor" permissions');
        logger.error('   3. Verify the GOOGLE_DRIVE_FOLDER_ID is correct');
      }
    }
  }
  
  const healthyServices = results.filter(r => r.status === 'OK').length;
  const totalServices = results.length;
  
  logger.info(`🏥 Health check complete: ${healthyServices}/${totalServices} services healthy`);
  
  if (healthyServices === totalServices) {
    logger.info('🎉 All systems operational! Ready to process emails.');
  } else {
    logger.warn('⚠️ Some services need attention before processing can begin.');
    logger.warn('   Fix the issues above and re-run the health check.');
  }
  
  if (healthyServices < totalServices) {
    process.exit(1);
  }
}

runHealthCheck().catch(error => {
  logger.error('💥 Health check failed:', error);
  process.exit(1);
});
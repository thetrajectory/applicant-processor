import { CONFIG } from './config.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger();

async function debugCredentials() {
  logger.info('🔍 === CREDENTIAL DEBUG INFORMATION ===');
  
  try {
    // Parse Google credentials
    const credentials = JSON.parse(CONFIG.GOOGLE_CREDENTIALS);
    
    logger.info('✅ Google Credentials parsed successfully');
    logger.info(`   Service Account Email: ${credentials.client_email}`);
    logger.info(`   Project ID: ${credentials.project_id}`);
    logger.info(`   Client ID: ${credentials.client_id}`);
    logger.info(`   Private Key ID: ${credentials.private_key_id}`);
    logger.info(`   Auth URI: ${credentials.auth_uri}`);
    
  } catch (error) {
    logger.error('❌ Error parsing Google credentials:', error.message);
    logger.error('   Check if GOOGLE_CREDENTIALS is valid JSON');
  }
  
  logger.info('📋 Configuration:');
  logger.info(`   Sheet ID: ${CONFIG.GOOGLE_SHEET_ID}`);
  logger.info(`   Drive Folder ID: ${CONFIG.GOOGLE_DRIVE_FOLDER_ID}`);
  logger.info(`   Gmail User: ${CONFIG.GMAIL_USER_EMAIL}`);
  logger.info(`   Supabase URL: ${CONFIG.SUPABASE_URL}`);
  
  logger.info('🔧 Required Actions:');
  logger.info('   1. Share Google Sheet with service account email');
  logger.info('   2. Share Google Drive folder with service account email');
  logger.info('   3. Configure domain-wide delegation in Google Admin Console');
  logger.info('   4. Enable required APIs in Google Cloud Console');
}

debugCredentials().catch(error => {
  logger.error('💥 Debug failed:', error);
});
import { createLogger } from './utils/logger.js';
import { GmailService } from './services/gmail.js';
import { DriveService } from './services/drive.js';
import { SheetsService } from './services/sheets.js';
import { SupabaseService } from './services/supabase.js';
import { OpenAIService } from './services/openai.js';

const logger = createLogger();

async function runHealthCheck() {
  logger.info('🏥 Starting system health check...');
  
  const services = [
    { name: 'Supabase', service: SupabaseService },
    { name: 'Google Sheets', service: SheetsService },
    { name: 'Google Drive', service: DriveService },
    { name: 'Gmail', service: GmailService },
    { name: 'OpenAI', service: OpenAIService }
  ];
  
  const results = [];
  
  for (const { name, service } of services) {
    try {
      const instance = new service();
      await instance.testConnection();
      results.push({ name, status: 'OK', error: null });
      logger.info(`✅ ${name}: OK`);
    } catch (error) {
      results.push({ name, status: 'ERROR', error: error.message });
      logger.error(`❌ ${name}: ${error.message}`);
    }
  }
  
  const healthyServices = results.filter(r => r.status === 'OK').length;
  const totalServices = results.length;
  
  logger.info(`🏥 Health check complete: ${healthyServices}/${totalServices} services healthy`);
  
  if (healthyServices < totalServices) {
    process.exit(1);
  }
}

runHealthCheck().catch(error => {
  logger.error('💥 Health check failed:', error);
  process.exit(1);
});
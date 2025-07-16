import { createLogger } from './logger.js';

const logger = createLogger();

export class StorageManager {
  constructor() {
    // No longer using processed_messages table
    logger.info('💾 Storage manager initialized (no processed messages tracking)');
  }

  async isProcessed(messageId) {
    // Always return false since we're not tracking processed messages
    return false;
  }

  async markProcessed(messageId, status = 'success', metadata = null) {
    // No longer marking messages as processed
    logger.debug(`📝 Would mark message ${messageId} as ${status} (disabled)`);
  }

  async getProcessedStats() {
    // Return empty stats since we're not tracking
    return { 
      total: 0, 
      success: 0, 
      duplicates: 0, 
      skipped: 0, 
      errors: 0, 
      latest: null 
    };
  }
}
import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '../config.js';
import { createLogger } from './logger.js';

const logger = createLogger();

export class StorageManager {
  constructor() {
    this.supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
  }

  async isProcessed(messageId) {
    try {
      const { data, error } = await this.supabase
        .from(CONFIG.PROCESSED_MESSAGES_TABLE)
        .select('message_id')
        .eq('message_id', messageId)
        .limit(1);
      
      if (error) throw error;
      return data && data.length > 0;
    } catch (error) {
      logger.error(`Error checking processed status:`, error);
      return false;
    }
  }

  async markProcessed(messageId, status = 'success', metadata = null) {
    try {
      const { error } = await this.supabase
        .from(CONFIG.PROCESSED_MESSAGES_TABLE)
        .upsert([{
          message_id: messageId,
          status,
          processed_at: new Date().toISOString(),
          metadata: metadata ? JSON.stringify(metadata) : null
        }], {
          onConflict: 'message_id'
        });
      
      if (error) throw error;
      logger.debug(`📝 Message ${messageId} marked as processed (${status})`);
    } catch (error) {
      logger.error(`Error marking message as processed:`, error);
    }
  }

  async getProcessedStats() {
    try {
      const { data, error } = await this.supabase
        .from(CONFIG.PROCESSED_MESSAGES_TABLE)
        .select('status, processed_at')
        .order('processed_at', { ascending: false })
        .limit(1000);
      
      if (error) throw error;
      
      const stats = {
        total: data.length,
        success: data.filter(m => m.status === 'success').length,
        duplicates: data.filter(m => m.status === 'duplicate_email').length,
        skipped: data.filter(m => m.status.includes('skip') || m.status.includes('not_')).length,
        errors: data.filter(m => m.status === 'error').length,
        latest: data[0]?.processed_at || null
      };
      
      return stats;
    } catch (error) {
      logger.error(`Error getting processed stats:`, error);
      return { total: 0, success: 0, duplicates: 0, skipped: 0, errors: 0, latest: null };
    }
  }
}
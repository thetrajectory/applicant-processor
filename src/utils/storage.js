// src/utils/storage.js
import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '../config.js';
import { createLogger } from './logger.js';

const logger = createLogger();

export class StorageManager {
  constructor() {
    this.supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    this.tableName = 'processed_messages';
    logger.info('💾 Enhanced storage manager initialized with message tracking');
  }

  async initializeTable() {
    try {
      // Create processed_messages table if it doesn't exist
      const { error } = await this.supabase.rpc('create_processed_messages_table');
      
      if (error && !error.message.includes('already exists')) {
        logger.warn('Table creation note:', error.message);
      } else {
        logger.info('✅ processed_messages table ready');
      }
    } catch (error) {
      logger.error('Error initializing processed_messages table:', error.message);
    }
  }

  async isProcessed(messageId) {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('message_id, processed_at, status')
        .eq('message_id', messageId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      const isProcessed = !!data;
      
      if (isProcessed) {
        logger.info(`🔄 Message already processed: ${messageId} (${data.status}) at ${data.processed_at}`);
      } else {
        logger.debug(`📝 New message: ${messageId}`);
      }

      return isProcessed;
    } catch (error) {
      logger.error(`Error checking processed status for ${messageId}:`, error.message);
      return false; // Assume not processed on error to be safe
    }
  }

  async markProcessed(messageId, status = 'success', metadata = null) {
    try {
      const processedData = {
        message_id: messageId,
        status,
        processed_at: new Date().toISOString(),
        metadata: metadata ? JSON.stringify(metadata) : null,
        error_details: status === 'error' ? metadata?.error : null
      };

      const { error } = await this.supabase
        .from(this.tableName)
        .upsert([processedData], {
          onConflict: 'message_id'
        });

      if (error) throw error;

      logger.info(`📝 Marked message ${messageId} as ${status}`);
      
      if (metadata?.applicantEmail) {
        logger.info(`   👤 Applicant: ${metadata.applicantEmail}`);
      }
      
    } catch (error) {
      logger.error(`Error marking message ${messageId} as processed:`, error.message);
    }
  }

  async getProcessedStats() {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('status, processed_at, metadata');

      if (error) throw error;

      const stats = {
        total: data.length,
        success: data.filter(d => d.status === 'success').length,
        duplicates: data.filter(d => d.status === 'duplicate').length,
        skipped: data.filter(d => d.status === 'skipped').length,
        errors: data.filter(d => d.status === 'error').length,
        latest: data.length > 0 ? data.sort((a, b) => new Date(b.processed_at) - new Date(a.processed_at))[0] : null
      };

      return stats;
    } catch (error) {
      logger.error('Error getting processed stats:', error.message);
      return { total: 0, success: 0, duplicates: 0, skipped: 0, errors: 0, latest: null };
    }
  }

  async cleanupOldRecords(daysToKeep = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const { data, error } = await this.supabase
        .from(this.tableName)
        .delete()
        .lt('processed_at', cutoffDate.toISOString());

      if (error) throw error;

      const deletedCount = data?.length || 0;
      logger.info(`🧹 Cleaned up ${deletedCount} old processed message records`);
      
      return deletedCount;
    } catch (error) {
      logger.error('Error cleaning up old records:', error.message);
      return 0;
    }
  }

  async getRecentlyProcessed(limit = 10) {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('message_id, status, processed_at, metadata')
        .order('processed_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error('Error getting recently processed messages:', error.message);
      return [];
    }
  }
}
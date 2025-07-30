// src/utils/storage.js - Enhanced with dual table tracking for your schema
import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '../config.js';
import { createLogger } from './logger.js';

const logger = createLogger();

export class StorageManager {
  constructor() {
    this.supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    this.processedMessagesTable = CONFIG.PROCESSED_MESSAGES_TABLE;
    this.applicantDetailsTable = CONFIG.TABLE_NAME;
    logger.info('💾 Enhanced storage manager initialized with dual table tracking');
    logger.info(`   Applicant Table: ${this.applicantDetailsTable} (PK: email)`);
    logger.info(`   Processing Table: ${this.processedMessagesTable} (PK: message_id)`);
  }

  async initializeTable() {
    try {
      // Test both tables exist
      await this.testTableAccess(this.applicantDetailsTable);
      await this.testTableAccess(this.processedMessagesTable);
      
      logger.info('✅ Both tracking tables are accessible');
    } catch (error) {
      logger.error('Error initializing tables:', error.message);
      throw error;
    }
  }

  async testTableAccess(tableName) {
    try {
      const { data, error } = await this.supabase
        .from(tableName)
        .select('*')
        .limit(1);

      if (error && error.code === 'PGRST116') {
        throw new Error(`Table "${tableName}" does not exist. Please create it first.`);
      } else if (error) {
        throw error;
      }

      logger.debug(`✅ Table ${tableName} is accessible`);
      return true;
    } catch (error) {
      logger.error(`❌ Table ${tableName} access failed:`, error.message);
      throw error;
    }
  }

  // 🚀 SIMPLIFIED: Only check message ID (not duplicate applicant)
  async isProcessed(messageId) {
    try {
      // Only check processed_messages_duplicate table (PK: message_id)
      const { data: processedData, error: processedError } = await this.supabase
        .from(this.processedMessagesTable)
        .select('message_id, processed_at, status')
        .eq('message_id', messageId)
        .single();

      if (processedError && processedError.code !== 'PGRST116') {
        logger.warn(`Warning checking processed messages: ${processedError.message}`);
      }

      // 🚀 SIMPLIFIED: Any status means processed (don't reprocess)
      if (processedData) {
        logger.info(`🔄 Message already tracked: ${messageId} (${processedData.status}) at ${processedData.processed_at}`);
        return true;
      }

      logger.debug(`📝 Message ready for processing: ${messageId}`);
      return false;

    } catch (error) {
      logger.error(`Error checking processed status for ${messageId}:`, error.message);
      return false; // Assume not processed on error to be safe
    }
  }

  async markProcessed(messageId, status = 'success', metadata = null) {
    try {
      const processedData = {
        message_id: messageId,  // PK in your schema
        status,
        processed_at: new Date().toISOString(),
        metadata: metadata ? JSON.stringify(metadata) : null,
        error_details: status === 'error' ? metadata?.error : null
      };

      // Use upsert with message_id as the conflict target (your PK)
      const { error } = await this.supabase
        .from(this.processedMessagesTable)
        .upsert([processedData], {
          onConflict: 'message_id'  // Your table's PK
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
        .from(this.processedMessagesTable)
        .select('status, processed_at, metadata');

      if (error) throw error;

      const stats = {
        total: data.length,
        success: data.filter(d => d.status === 'success').length,
        already_processed: data.filter(d => d.status === 'already_processed').length,
        duplicates: data.filter(d => d.status === 'duplicate').length,
        skipped: data.filter(d => d.status === 'skipped').length,
        errors: data.filter(d => d.status === 'error').length,
        latest: data.length > 0 ? data.sort((a, b) => new Date(b.processed_at) - new Date(a.processed_at))[0] : null
      };

      return stats;
    } catch (error) {
      logger.error('Error getting processed stats:', error.message);
      return { total: 0, success: 0, already_processed: 0, duplicates: 0, skipped: 0, errors: 0, latest: null };
    }
  }

  async cleanupOldRecords(daysToKeep = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const { data, error } = await this.supabase
        .from(this.processedMessagesTable)
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
        .from(this.processedMessagesTable)
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

  // 🚀 ENHANCED: Create applicant with message ID - adapted for your schema
  async createApplicant(applicantData, messageId) {
    try {
      // Clean data to match exact schema with message_id
      const cleanData = {
        message_id: messageId,  // 🚀 CRITICAL: Include message ID
        email: applicantData.email,  // PK in your schema
        name: applicantData.name || null,
        title: applicantData.title || null,
        location: applicantData.location || null,
        expected_compensation: applicantData.expected_compensation || null,
        project_id: applicantData.project_id || null,
        screening_questions: applicantData.screening_questions || null,
        resume_raw_text: applicantData.resume_raw_text || null,
        mobile_number: applicantData.mobile_number || null,
        linkedin_url: applicantData.linkedin_url || null,
        resume_drive_link: applicantData.resume_drive_link || null,
        processed_at: new Date().toISOString()
      };

      // Use upsert with email as conflict (your PK)
      const { data, error } = await this.supabase
        .from(this.applicantDetailsTable)
        .upsert([cleanData], {
          onConflict: 'email'  // Your table's PK
        })
        .select();
      
      if (error) throw error;
      
      logger.info(`💾 Applicant stored with message ID: ${messageId} (${applicantData.email})`);
      return data[0];
    } catch (error) {
      throw new Error(`Supabase create applicant failed: ${error.message}`);
    }
  }

  async getApplicantStats() {
    try {
      const { data, error } = await this.supabase
        .from(this.applicantDetailsTable)
        .select('email, processed_at, mobile_number, linkedin_url, resume_drive_link, message_id');
      
      if (error) throw error;
      
      return {
        total: data.length,
        withMobile: data.filter(a => a.mobile_number).length,
        withLinkedIn: data.filter(a => a.linkedin_url).length,
        withResume: data.filter(a => a.resume_drive_link).length,
        withMessageId: data.filter(a => a.message_id).length,
        latest: data.length > 0 ? data.sort((a, b) => new Date(b.processed_at) - new Date(a.processed_at))[0] : null
      };
    } catch (error) {
      logger.error(`Error getting applicant stats:`, error);
      return { total: 0, withMobile: 0, withLinkedIn: 0, withResume: 0, withMessageId: 0, latest: null };
    }
  }

  // 🚀 NEW: Retry wrapper for Supabase operations
  async retryOperation(operation, operationName, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        logger.warn(`⚠️ ${operationName} attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        
        if (attempt === maxRetries) {
          logger.error(`❌ ${operationName} failed after ${maxRetries} attempts`);
          throw error;
        }
        
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        logger.info(`⏳ Retrying ${operationName} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // 🚀 NEW: Enhanced error tracking
  async trackError(messageId, error, context = {}) {
    try {
      const errorData = {
        message_id: messageId,
        status: 'error',
        processed_at: new Date().toISOString(),
        error_details: error.message,
        metadata: JSON.stringify({
          error: error.message,
          stack: error.stack,
          context,
          timestamp: new Date().toISOString()
        })
      };

      await this.supabase
        .from(this.processedMessagesTable)
        .upsert([errorData], { onConflict: 'message_id' });

      logger.error(`❌ Error tracked for message: ${messageId}`);
    } catch (trackingError) {
      logger.error('Failed to track error:', trackingError.message);
    }
  }

  // 🚀 NEW: Get processing summary
  async getProcessingSummary() {
    try {
      const processedStats = await this.getProcessedStats();
      const applicantStats = await this.getApplicantStats();
      
      return {
        totalMessages: processedStats.total,
        successfullyProcessed: processedStats.success,
        skippedMessages: processedStats.skipped,
        errorMessages: processedStats.errors,
        totalApplicants: applicantStats.total,
        messagesWithoutApplicantRecord: processedStats.success - applicantStats.total,
        processingEfficiency: processedStats.total > 0 ? 
          (processedStats.success / processedStats.total * 100).toFixed(1) + '%' : '0%'
      };
    } catch (error) {
      logger.error('Error getting processing summary:', error.message);
      return {};
    }
  }
}
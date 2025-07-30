// src/services/supabase.js - Enhanced error handling
import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger();

export class SupabaseService {
  constructor() {
    try {
      this.supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
        auth: {
          persistSession: false
        },
        db: {
          schema: 'public'
        }
      });
      logger.info('💾 Supabase client initialized');
      logger.info(`   Main Table: ${CONFIG.TABLE_NAME}`);
      logger.info(`   Tracking Table: ${CONFIG.PROCESSED_MESSAGES_TABLE}`);
      logger.info(`   URL: ${CONFIG.SUPABASE_URL}`);
    } catch (error) {
      throw new Error(`Supabase initialization failed: ${error.message}`);
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

  async testConnection() {
    try {
      // Test both tables with retry logic
      const tables = [CONFIG.TABLE_NAME, CONFIG.PROCESSED_MESSAGES_TABLE];
      
      for (const tableName of tables) {
        await this.retryOperation(async () => {
          const { data, error } = await this.supabase
            .from(tableName)
            .select('count')
            .limit(1);
          
          if (error) {
            if (error.code === 'PGRST116') {
              throw new Error(`Table "${tableName}" does not exist. Please create it first.`);
            }
            throw error;
          }
          
          logger.info(`✅ Table ${tableName} is accessible`);
          return data;
        }, `Test ${tableName} connection`);
      }
      
      logger.info('✅ Supabase connection successful');
      logger.info(`   Database: ${CONFIG.SUPABASE_URL}`);
      
      return true;
    } catch (error) {
      logger.error('❌ Supabase connection test failed:', {
        message: error.message,
        code: error.code,
        details: error.details
      });
      throw new Error(`Supabase connection test failed: ${error.message}`);
    }
  }

  // 🚀 ENHANCED: Check for duplicates with retry logic
  async isDuplicateApplicant(email, projectId, messageId = null) {
    try {
      const data = await this.retryOperation(async () => {
        let query = this.supabase
          .from(CONFIG.TABLE_NAME)
          .select('email, project_id, message_id, processed_at')
          .eq('email', email);
        
        if (projectId) {
          query = query.eq('project_id', projectId);
        }
        
        const { data, error } = await query.limit(5);
        
        if (error) throw error;
        return data;
      }, `Check duplicate for ${email}`);
      
      const isDuplicate = data && data.length > 0;
      
      if (isDuplicate) {
        logger.info(`🔄 Duplicate applicant found: ${email} ${projectId ? `(Project: ${projectId})` : ''}`);
        
        data.forEach((record, index) => {
          logger.info(`   ${index + 1}. Message: ${record.message_id}, Processed: ${record.processed_at}`);
        });
        
        if (messageId) {
          logger.info(`   Current message: ${messageId}`);
        }
      }
      
      return isDuplicate;
    } catch (error) {
      logger.error(`❌ Error checking duplicate status for ${email}:`, {
        message: error.message,
        code: error.code,
        details: error.details
      });
      
      // In case of database errors, assume NOT duplicate to avoid skipping valid applicants
      logger.warn(`⚠️ Assuming ${email} is NOT a duplicate due to database error`);
      return false;
    }
  }

  // 🚀 ENHANCED: Create applicant with retry logic
  async createApplicant(applicantData, messageId) {
    try {
      const cleanData = {
        message_id: messageId,
        email: applicantData.email,
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

      const data = await this.retryOperation(async () => {
        const { data, error } = await this.supabase
          .from(CONFIG.TABLE_NAME)
          .upsert([cleanData], {
            onConflict: 'email'
          })
          .select();
        
        if (error) throw error;
        return data;
      }, `Create applicant ${applicantData.email}`);
      
      logger.info(`💾 Applicant stored in Supabase: ${applicantData.email} (Message: ${messageId})`);
      return data[0];
    } catch (error) {
      logger.error(`❌ Supabase create applicant failed for ${applicantData.email}:`, {
        message: error.message,
        code: error.code,
        details: error.details
      });
      throw new Error(`Supabase create applicant failed: ${error.message}`);
    }
  }

  async getApplicantStats() {
    try {
      const data = await this.retryOperation(async () => {
        const { data, error } = await this.supabase
          .from(CONFIG.TABLE_NAME)
          .select('email, processed_at, mobile_number, linkedin_url, resume_drive_link, message_id');
        
        if (error) throw error;
        return data;
      }, 'Get applicant statistics');
      
      return {
        total: data.length,
        withMobile: data.filter(a => a.mobile_number).length,
        withLinkedIn: data.filter(a => a.linkedin_url).length,
        withResume: data.filter(a => a.resume_drive_link).length,
        withMessageId: data.filter(a => a.message_id).length,
        latest: data.length > 0 ? data.sort((a, b) => new Date(b.processed_at) - new Date(a.processed_at))[0] : null
      };
    } catch (error) {
      logger.error(`❌ Error getting applicant stats:`, error.message);
      return { total: 0, withMobile: 0, withLinkedIn: 0, withResume: 0, withMessageId: 0, latest: null };
    }
  }
}
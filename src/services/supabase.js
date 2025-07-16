import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger();

export class SupabaseService {
  constructor() {
    try {
      this.supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
      logger.info('💾 Supabase client initialized');
    } catch (error) {
      throw new Error(`Supabase initialization failed: ${error.message}`);
    }
  }

  async testConnection() {
    try {
      const { data, error } = await this.supabase
        .from(CONFIG.TABLE_NAME)
        .select('count')
        .limit(1);
      
      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error(`Table "${CONFIG.TABLE_NAME}" does not exist. Please create it first.`);
        }
        throw error;
      }
      
      logger.info('✅ Supabase connection successful');
      logger.info(`   Database: ${CONFIG.SUPABASE_URL}`);
      logger.info(`   Table: ${CONFIG.TABLE_NAME}`);
      
      return true;
    } catch (error) {
      throw new Error(`Supabase connection test failed: ${error.message}`);
    }
  }

  async isDuplicateApplicant(email, projectId) {
    try {
      let query = this.supabase
        .from(CONFIG.TABLE_NAME)
        .select('email, project_id')
        .eq('email', email);
      
      // If project_id is provided, check for that specific combination
      if (projectId) {
        query = query.eq('project_id', projectId);
      }
      
      const { data, error } = await query.limit(1);
      
      if (error) throw error;
      
      const isDuplicate = data && data.length > 0;
      
      if (isDuplicate) {
        logger.info(`🔄 Duplicate found: ${email} ${projectId ? `(Project: ${projectId})` : ''}`);
      }
      
      return isDuplicate;
    } catch (error) {
      logger.error(`Error checking duplicate status:`, error);
      return false;
    }
  }

  async createApplicant(applicantData) {
    try {
      // Clean data to match exact schema
      const cleanData = {
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

      const { data, error } = await this.supabase
        .from(CONFIG.TABLE_NAME)
        .upsert([cleanData], {
          onConflict: 'email'
        })
        .select();
      
      if (error) throw error;
      
      logger.info(`💾 Applicant stored in Supabase: ${applicantData.email}`);
      return data[0];
    } catch (error) {
      throw new Error(`Supabase create applicant failed: ${error.message}`);
    }
  }

  async getApplicantStats() {
    try {
      const { data, error } = await this.supabase
        .from(CONFIG.TABLE_NAME)
        .select('email, processed_at, mobile_number, linkedin_url, resume_drive_link');
      
      if (error) throw error;
      
      return {
        total: data.length,
        withMobile: data.filter(a => a.mobile_number).length,
        withLinkedIn: data.filter(a => a.linkedin_url).length,
        withResume: data.filter(a => a.resume_drive_link).length,
        latest: data.length > 0 ? data.sort((a, b) => new Date(b.processed_at) - new Date(a.processed_at))[0] : null
      };
    } catch (error) {
      logger.error(`Error getting applicant stats:`, error);
      return { total: 0, withMobile: 0, withLinkedIn: 0, withResume: 0, latest: null };
    }
  }
}
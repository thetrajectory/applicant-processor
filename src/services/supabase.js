import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger();

export class SupabaseService {
  constructor() {
    try {
      this.supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
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
      
      if (error) throw error;
      return true;
    } catch (error) {
      throw new Error(`Supabase connection test failed: ${error.message}`);
    }
  }

  async emailExists(email) {
    try {
      const { data, error } = await this.supabase
        .from(CONFIG.TABLE_NAME)
        .select('email')
        .eq('email', email)
        .limit(1);
      
      if (error) throw error;
      return data && data.length > 0;
    } catch (error) {
      logger.error(`Error checking email existence:`, error);
      return false;
    }
  }

  async createApplicant(applicantData) {
    try {
      const { data, error } = await this.supabase
        .from(CONFIG.TABLE_NAME)
        .upsert([{
          email: applicantData.email,
          name: applicantData.name,
          title: applicantData.title,
          location: applicantData.location,
          expected_compensation: applicantData.expected_compensation,
          project_id: applicantData.project_id,
          screening_questions: applicantData.screening_questions,
          resume_raw_text: applicantData.resume_raw_text,
          resume_drive_link: applicantData.resume_drive_link,
          mobile_number: applicantData.mobile_number,
          linkedin_url: applicantData.linkedin_url,
          processed_at: applicantData.processed_at,
          source_message_id: applicantData.source_message_id,
          processing_time_ms: applicantData.processing_time_ms
        }], {
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
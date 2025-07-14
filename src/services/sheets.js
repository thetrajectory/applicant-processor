import { google } from 'googleapis';
import { CONFIG } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger();

export class SheetsService {
  constructor() {
    try {
      logger.info('📊 Initializing Google Sheets service...');
      
      // Use the already parsed credentials from CONFIG
      const credentials = CONFIG.GOOGLE_CREDENTIALS;
      
      logger.info(`   Service Account: ${credentials.client_email}`);
      logger.info(`   Project: ${credentials.project_id}`);
      
      this.auth = new google.auth.GoogleAuth({
        credentials, // Use the already parsed object
        scopes: [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive.file'
        ],
        subject: CONFIG.GMAIL_USER_EMAIL
      });
      
      this.sheets = google.sheets({ version: 'v4' });
      
      logger.info('📊 Google Sheets service initialized successfully');
      
    } catch (error) {
      logger.error('❌ Sheets service initialization failed:', error);
      throw new Error(`Sheets service initialization failed: ${error.message}`);
    }
  }

  async testConnection() {
    try {
      const auth = await this.auth.getClient();
      const sheets = google.sheets({ version: 'v4', auth });
      
      const response = await sheets.spreadsheets.get({ 
        spreadsheetId: CONFIG.GOOGLE_SHEET_ID 
      });
      
      logger.info(`✅ Sheet access successful: "${response.data.properties.title}"`);
      
      const readTest = await sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.GOOGLE_SHEET_ID,
        range: 'A1:Z1'
      });
      
      logger.info(`📖 Sheet read test successful: ${readTest.data.values ? readTest.data.values.length : 0} columns`);
      
      return true;
    } catch (error) {
      throw new Error(`Sheets connection test failed: ${error.message}`);
    }
  }

  async appendApplicant(applicantData) {
    try {
      const auth = await this.auth.getClient();
      const sheets = google.sheets({ version: 'v4', auth });
      
      const rowData = [
        applicantData.name || '',
        applicantData.title || '',
        applicantData.location || '',
        applicantData.expected_compensation || '',
        applicantData.project_id || '',
        applicantData.screening_questions || '',
        applicantData.resume_raw_text || '',
        applicantData.resume_drive_link || '',
        applicantData.mobile_number || '',
        applicantData.email || '',
        applicantData.linkedin_url || '',
        applicantData.processed_at || '',
        applicantData.source_message_id || ''
      ];
      
      await sheets.spreadsheets.values.append({
        spreadsheetId: CONFIG.GOOGLE_SHEET_ID,
        range: 'A:M',
        valueInputOption: 'RAW',
        requestBody: {
          values: [rowData]
        }
      });
      
      logger.info(`📊 Applicant added to sheet: ${applicantData.name}`);
      
    } catch (error) {
      throw new Error(`Sheet append failed: ${error.message}`);
    }
  }

  async getApplicantCount() {
    try {
      const auth = await this.auth.getClient();
      const sheets = google.sheets({ version: 'v4', auth });
      
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.GOOGLE_SHEET_ID,
        range: 'A:A'
      });
      
      const count = response.data.values ? response.data.values.length - 1 : 0;
      return Math.max(0, count);
      
    } catch (error) {
      logger.error(`Error getting applicant count:`, error);
      return 0;
    }
  }
}
import { google } from 'googleapis';
import { CONFIG } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { OAuth2AuthService } from './oauth-auth.js';

const logger = createLogger();

export class SheetsService {
  constructor() {
    this.authService = new OAuth2AuthService();
  }

  async testConnection() {
    try {
      const auth = await this.authService.getAuthClient();
      const sheets = google.sheets({ version: 'v4', auth });
      
      const response = await sheets.spreadsheets.get({ 
        spreadsheetId: CONFIG.GOOGLE_SHEET_ID 
      });
      
      logger.info(`✅ Sheet access successful: "${response.data.properties.title}"`);
      logger.info(`   Sheet ID: ${CONFIG.GOOGLE_SHEET_ID}`);
      
      const readTest = await sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.GOOGLE_SHEET_ID,
        range: 'A1:Z1'
      });
      
      logger.info(`📖 Sheet read test successful: ${readTest.data.values ? readTest.data.values.length : 0} columns`);
      
      return true;
    } catch (error) {
      if (error.code === 404) {
        throw new Error(`Sheet not found. Make sure the sheet ID is correct and the sheet is shared with your Google account.`);
      } else if (error.code === 403) {
        throw new Error(`Permission denied. Make sure the sheet is shared with your Google account with edit permissions.`);
      }
      throw new Error(`Sheets connection test failed: ${error.message}`);
    }
  }

  async initializeSheet() {
    try {
      const auth = await this.authService.getAuthClient();
      const sheets = google.sheets({ version: 'v4', auth });
      
      // Check if headers exist
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.GOOGLE_SHEET_ID,
        range: 'A1:M1'  // Updated to include Message ID column
      });
      
      if (!response.data.values || response.data.values.length === 0) {
        // Add headers matching database schema including Message ID
        const headers = [
          'Message ID', 'Name', 'Title', 'Location', 'Expected Compensation',
          'Project ID', 'Screening Questions', 'Resume Raw Text',
          'Resume Drive Link', 'Mobile Number', 'Email',
          'LinkedIn URL', 'Processed At'
        ];
        
        await sheets.spreadsheets.values.update({
          spreadsheetId: CONFIG.GOOGLE_SHEET_ID,
          range: 'A1:M1',
          valueInputOption: 'RAW',
          requestBody: {
            values: [headers]
          }
        });
        
        logger.info('📊 Added headers to sheet with Message ID');
      } else {
        logger.info('📊 Headers already exist in sheet');
      }
    } catch (error) {
      logger.error('❌ Error initializing sheet:', error);
      throw error;
    }
  }

  async appendApplicant(applicantData, messageId = null) {
    try {
      const auth = await this.authService.getAuthClient();
      const sheets = google.sheets({ version: 'v4', auth });
      
      // Match exact database schema order including Message ID
      const rowData = [
        messageId || applicantData.message_id || '',  // Message ID first
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
        applicantData.processed_at || ''
      ];
      
      await sheets.spreadsheets.values.append({
        spreadsheetId: CONFIG.GOOGLE_SHEET_ID,
        range: 'A:M',
        valueInputOption: 'RAW',
        requestBody: {
          values: [rowData]
        }
      });
      
      logger.info(`📊 Applicant added to sheet: ${applicantData.name} (${messageId || 'no message ID'})`);
      
    } catch (error) {
      throw new Error(`Sheet append failed: ${error.message}`);
    }
  }

  async getApplicantCount() {
    try {
      const auth = await this.authService.getAuthClient();
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
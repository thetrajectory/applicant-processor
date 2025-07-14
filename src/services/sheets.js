import { google } from 'googleapis';
import { CONFIG } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger();

export class SheetsService {
  constructor() {
    try {
      const credentials = JSON.parse(CONFIG.GOOGLE_CREDENTIALS);
      
      this.auth = new google.auth.GoogleAuth({
        credentials,
        scopes: [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive.file'
        ],
        subject: CONFIG.GMAIL_USER_EMAIL // Important: This impersonates the user
      });
      
      this.sheets = google.sheets({ version: 'v4' });
      
      logger.info('📊 Google Sheets service initialized');
      
    } catch (error) {
      logger.error('❌ Sheets service initialization failed:', error);
      throw new Error(`Sheets service initialization failed: ${error.message}`);
    }
  }

  async testConnection() {
    try {
      logger.info('🔍 Testing Google Sheets connection...');
      
      // Get authenticated client
      const auth = await this.auth.getClient();
      const sheets = google.sheets({ version: 'v4', auth });
      
      logger.info(`📋 Testing access to sheet: ${CONFIG.GOOGLE_SHEET_ID}`);
      
      // Test basic sheet access
      const response = await sheets.spreadsheets.get({ 
        spreadsheetId: CONFIG.GOOGLE_SHEET_ID 
      });
      
      logger.info(`✅ Sheet access successful: "${response.data.properties.title}"`);
      
      // Test if we can read data
      const readTest = await sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.GOOGLE_SHEET_ID,
        range: 'A1:Z1' // Try to read first row
      });
      
      logger.info(`📖 Sheet read test successful: ${readTest.data.values ? readTest.data.values.length : 0} columns`);
      
      return true;
    } catch (error) {
      logger.error('❌ Google Sheets connection test details:', {
        message: error.message,
        code: error.code,
        status: error.status,
        details: error.details
      });
      
      // Provide specific error guidance
      if (error.code === 403) {
        logger.error('🚨 Permission denied - Check:');
        logger.error('   1. Sheet is shared with service account email');
        logger.error('   2. Service account has Editor permissions');
        logger.error('   3. Domain-wide delegation is configured');
      } else if (error.code === 404) {
        logger.error('🚨 Sheet not found - Check:');
        logger.error('   1. GOOGLE_SHEET_ID is correct');
        logger.error('   2. Sheet exists and is accessible');
      } else if (error.message.includes('subject')) {
        logger.error('🚨 Impersonation failed - Check:');
        logger.error('   1. GMAIL_USER_EMAIL is correct');
        logger.error('   2. Domain-wide delegation includes this user');
      }
      
      throw new Error(`Sheets connection test failed: ${error.message}`);
    }
  }

  async initializeSheet() {
    try {
      const auth = await this.auth.getClient();
      const sheets = google.sheets({ version: 'v4', auth });
      
      // Get sheet info
      const sheetInfo = await sheets.spreadsheets.get({
        spreadsheetId: CONFIG.GOOGLE_SHEET_ID
      });
      
      const sheet = sheetInfo.data.sheets[0];
      const sheetId = sheet.properties.sheetId;
      
      // Check if headers exist
      const headerRange = await sheets.spreadsheets.values.get({
        spreadsheetId: CONFIG.GOOGLE_SHEET_ID,
        range: 'A1:Z1'
      });
      
      if (!headerRange.data.values || headerRange.data.values.length === 0) {
        logger.info('📊 Adding headers to sheet...');
        
        // Add headers
        await sheets.spreadsheets.values.update({
          spreadsheetId: CONFIG.GOOGLE_SHEET_ID,
          range: 'A1',
          valueInputOption: 'RAW',
          requestBody: {
            values: [CONFIG.SHEET_HEADERS]
          }
        });
        
        // Format headers
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: CONFIG.GOOGLE_SHEET_ID,
          requestBody: {
            requests: [
              {
                repeatCell: {
                  range: {
                    sheetId,
                    startRowIndex: 0,
                    endRowIndex: 1,
                    startColumnIndex: 0,
                    endColumnIndex: CONFIG.SHEET_HEADERS.length
                  },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 0.26, green: 0.52, blue: 0.96 },
                      textFormat: { 
                        foregroundColor: { red: 1, green: 1, blue: 1 },
                        bold: true 
                      }
                    }
                  },
                  fields: 'userEnteredFormat(backgroundColor,textFormat)'
                }
              }
            ]
          }
        });
        
        logger.info('📊 Sheet headers initialized');
      } else {
        logger.info('📊 Sheet headers already exist');
      }
      
    } catch (error) {
      logger.error('❌ Sheet initialization failed:', error);
      throw new Error(`Sheet initialization failed: ${error.message}`);
    }
  }

  async appendApplicant(applicantData) {
    try {
      const auth = await this.auth.getClient();
      const sheets = google.sheets({ version: 'v4', auth });
      
      // Ensure headers exist
      await this.initializeSheet();
      
      // Prepare row data in correct order
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
      logger.error('❌ Sheet append failed:', error);
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
      
      const count = response.data.values ? response.data.values.length - 1 : 0; // Subtract header row
      return Math.max(0, count);
      
    } catch (error) {
      logger.error(`❌ Error getting applicant count:`, error);
      return 0;
    }
  }
}
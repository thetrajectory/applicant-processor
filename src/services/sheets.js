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
        subject: CONFIG.GMAIL_USER_EMAIL
      });
      
      this.sheets = google.sheets({ version: 'v4' });
      
    } catch (error) {
      throw new Error(`Sheets service initialization failed: ${error.message}`);
    }
  }

  async testConnection() {
    try {
      const auth = await this.auth.getClient();
      const sheets = google.sheets({ version: 'v4', auth });
      
      await sheets.spreadsheets.get({ 
        spreadsheetId: CONFIG.GOOGLE_SHEET_ID 
      });
      return true;
    } catch (error) {
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
      }
      
    } catch (error) {
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
      logger.error(`Error getting applicant count:`, error);
      return 0;
    }
  }
}
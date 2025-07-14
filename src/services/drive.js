import { google } from 'googleapis';
import { CONFIG } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger();

export class DriveService {
  constructor() {
    try {
      logger.info('📁 Initializing Google Drive service...');
      
      // Use the already parsed credentials from CONFIG
      const credentials = CONFIG.GOOGLE_CREDENTIALS;
      
      if (!credentials) {
        throw new Error('Google credentials not available from CONFIG');
      }
      
      if (typeof credentials !== 'object') {
        throw new Error(`Google credentials should be object, got ${typeof credentials}`);
      }
      
      if (!credentials.client_email) {
        throw new Error('Google credentials missing client_email field');
      }
      
      logger.info(`   Service Account: ${credentials.client_email}`);
      logger.info(`   Project: ${credentials.project_id}`);
      
      this.auth = new google.auth.GoogleAuth({
        credentials, // Use the already parsed object
        scopes: [
          'https://www.googleapis.com/auth/drive.file',
          'https://www.googleapis.com/auth/drive'
        ],
        subject: CONFIG.GMAIL_USER_EMAIL
      });
      
      this.drive = google.drive({ version: 'v3' });
      
      logger.info('📁 Google Drive service initialized successfully');
      
    } catch (error) {
      logger.error('❌ Drive service initialization error:', {
        message: error.message,
        stack: error.stack,
        credentialsType: typeof CONFIG.GOOGLE_CREDENTIALS,
        hasGoogleCredentials: !!CONFIG.GOOGLE_CREDENTIALS,
        configKeys: CONFIG.GOOGLE_CREDENTIALS ? Object.keys(CONFIG.GOOGLE_CREDENTIALS) : 'none'
      });
      throw new Error(`Drive service initialization failed: ${error.message}`);
    }
  }

  async testConnection() {
    try {
      const auth = await this.auth.getClient();
      const drive = google.drive({ version: 'v3', auth });
      
      await drive.files.get({ fileId: CONFIG.GOOGLE_DRIVE_FOLDER_ID });
      return true;
    } catch (error) {
      throw new Error(`Drive connection test failed: ${error.message}`);
    }
  }

  async uploadFile(fileBuffer, filename, mimeType = 'application/pdf') {
    try {
      const auth = await this.auth.getClient();
      const drive = google.drive({ version: 'v3', auth });
      
      const cleanFilename = filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
      
      const fileMetadata = {
        name: cleanFilename,
        parents: [CONFIG.GOOGLE_DRIVE_FOLDER_ID]
      };

      const { Readable } = await import('stream');
      const stream = new Readable();
      stream.push(fileBuffer);
      stream.push(null);

      const media = {
        mimeType,
        body: stream
      };

      const response = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id,name,webViewLink'
      });

      const fileId = response.data.id;
      const viewLink = `https://drive.google.com/file/d/${fileId}/view`;
      
      logger.info(`📁 File uploaded to Drive: ${cleanFilename} (${fileId})`);
      
      return viewLink;
    } catch (error) {
      throw new Error(`Drive upload failed: ${error.message}`);
    }
  }

  async convertPDFToText(fileBuffer, filename) {
    // Simplified version - just return basic info for now
    return {
      text: `PDF file: ${filename} - OCR temporarily disabled`,
      originalText: '',
      length: 0
    };
  }
}
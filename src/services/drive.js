import { google } from 'googleapis';
import { OAuth2AuthService } from './oauth-auth.js';
import { CONFIG } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger();

export class DriveService {
  constructor() {
    this.authService = new OAuth2AuthService();
  }

  async testConnection() {
    try {
      const auth = await this.authService.getAuthClient();
      const drive = google.drive({ version: 'v3', auth });
      
      // Test access to the drive folder
      const folder = await drive.files.get({ 
        fileId: CONFIG.GOOGLE_DRIVE_FOLDER_ID,
        fields: 'id, name, createdTime, permissions'
      });
      
      logger.info(`✅ Drive folder access successful: "${folder.data.name}"`);
      logger.info(`   Folder ID: ${CONFIG.GOOGLE_DRIVE_FOLDER_ID}`);
      logger.info(`   Created: ${folder.data.createdTime}`);
      
      // Test write access by creating a test file
      const testFile = await drive.files.create({
        requestBody: {
          name: 'test-connection.txt',
          parents: [CONFIG.GOOGLE_DRIVE_FOLDER_ID]
        },
        media: {
          mimeType: 'text/plain',
          body: 'Test connection file - can be deleted'
        }
      });
      
      // Delete the test file
      await drive.files.delete({ fileId: testFile.data.id });
      
      logger.info('📁 Drive write test successful');
      
      return true;
    } catch (error) {
      if (error.code === 404) {
        throw new Error(`Drive folder not found. Make sure the folder ID is correct and the folder is shared with your Google account.`);
      } else if (error.code === 403) {
        throw new Error(`Permission denied. Make sure the drive folder is shared with your Google account with edit permissions.`);
      }
      throw new Error(`Drive connection test failed: ${error.message}`);
    }
  }

  async uploadFile(fileBuffer, filename, mimeType = 'application/pdf') {
    try {
      const auth = await this.authService.getAuthClient();
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
    try {
      // For now, we'll use a simple approach - just store the PDF
      // Google Drive API doesn't provide direct OCR, but we could use Google Cloud Vision API
      logger.info(`📄 PDF stored: ${filename} (OCR not implemented in this version)`);
      
      return {
        text: `PDF file: ${filename} - OCR not implemented in OAuth2 version`,
        originalText: '',
        length: 0
      };
    } catch (error) {
      throw new Error(`PDF text conversion failed: ${error.message}`);
    }
  }
}
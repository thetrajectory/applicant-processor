import { google } from 'googleapis';
import { CONFIG } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { OAuth2AuthService } from './oauth-auth.js';

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
        fields: 'id, name, createdTime'
      });
      
      logger.info(`✅ Drive folder access successful: "${folder.data.name}"`);
      logger.info(`   Folder ID: ${CONFIG.GOOGLE_DRIVE_FOLDER_ID}`);
      
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
      const auth = await this.authService.getAuthClient();
      const drive = google.drive({ version: 'v3', auth });
      
      logger.info(`🔍 Starting OCR conversion for: ${filename}`);
      
      // Upload PDF with OCR enabled
      const { Readable } = await import('stream');
      const stream = new Readable();
      stream.push(fileBuffer);
      stream.push(null);
  
      // Upload directly as Google Doc to enable OCR
      const response = await drive.files.create({
        requestBody: {
          name: `ocr_${Date.now()}_${filename.replace('.pdf', '')}`,
          parents: [CONFIG.GOOGLE_DRIVE_FOLDER_ID],
          mimeType: 'application/vnd.google-apps.document'
        },
        media: {
          mimeType: 'application/pdf',
          body: stream
        },
        fields: 'id'
      });
  
      const docId = response.data.id;
      logger.info(`📝 PDF converted to Google Doc with OCR: ${docId}`);
  
      // Export as plain text
      const exportResponse = await drive.files.export({
        fileId: docId,
        mimeType: 'text/plain'
      });
  
      const extractedText = exportResponse.data;
      logger.info(`📖 Text extracted: ${extractedText.length} characters`);
  
      // Cleanup
      await drive.files.delete({ fileId: docId }).catch(err => 
        logger.warn(`Failed to delete temp Doc: ${err.message}`)
      );
  
      const formattedText = this.formatOCRResult(extractedText, filename);
      
      return {
        text: formattedText,
        originalText: extractedText,
        length: extractedText.length
      };
  
    } catch (error) {
      logger.error(`❌ OCR conversion failed for ${filename}:`, error.message);
      
      return {
        text: `OCR conversion failed for ${filename}: ${error.message}`,
        originalText: '',
        length: 0
      };
    }
  }

  formatOCRResult(extractedText, filename) {
    // Clean up the extracted text
    const cleanText = extractedText
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .replace(/\r/g, '')
      .trim();

    return `--- RESUME TEXT (Google Drive OCR) ---
Original File: ${filename}
Extraction Method: Google Drive OCR
Extracted Characters: ${cleanText.length}
Processing Date: ${new Date().toISOString()}

--- EXTRACTED CONTENT ---
${cleanText}

--- END OF RESUME ---`;
  }
}
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
      
      if (!credentials.client_email) {
        throw new Error('Google credentials missing client_email field');
      }
      
      logger.info(`   Service Account: ${credentials.client_email}`);
      logger.info(`   Project: ${credentials.project_id}`);
      
      this.auth = new google.auth.GoogleAuth({
        credentials, // Use the already parsed object, not raw JSON
        scopes: [
          'https://www.googleapis.com/auth/drive.file',
          'https://www.googleapis.com/auth/drive'
        ],
        subject: CONFIG.GMAIL_USER_EMAIL
      });
      
      this.drive = google.drive({ version: 'v3' });
      
      logger.info('📁 Google Drive service initialized successfully');
      
    } catch (error) {
      logger.error('❌ Drive service initialization error details:', {
        message: error.message,
        stack: error.stack,
        credentialsType: typeof CONFIG.GOOGLE_CREDENTIALS,
        hasClientEmail: !!(CONFIG.GOOGLE_CREDENTIALS && CONFIG.GOOGLE_CREDENTIALS.client_email)
      });
      throw new Error(`Drive service initialization failed: ${error.message}`);
    }
  }

  async testConnection() {
    try {
      logger.info('🔍 Testing Google Drive connection...');
      logger.info(`   Target folder: ${CONFIG.GOOGLE_DRIVE_FOLDER_ID}`);
      
      const auth = await this.auth.getClient();
      const drive = google.drive({ version: 'v3', auth });
      
      const response = await drive.files.get({ 
        fileId: CONFIG.GOOGLE_DRIVE_FOLDER_ID 
      });
      
      logger.info('✅ Drive connection successful');
      logger.info(`   Folder name: "${response.data.name}"`);
      logger.info(`   Folder type: ${response.data.mimeType}`);
      
      return true;
    } catch (error) {
      logger.error('❌ Drive connection test failed:', {
        message: error.message,
        code: error.code,
        status: error.status
      });
      
      if (error.code === 403) {
        logger.error('🚨 PERMISSION DENIED - Check:');
        logger.error(`   1. Folder shared with: ${CONFIG.GOOGLE_CREDENTIALS.client_email}`);
        logger.error('   2. Service account has Editor permissions');
        logger.error('   3. Domain-wide delegation configured');
      } else if (error.code === 404) {
        logger.error('🚨 FOLDER NOT FOUND - Check:');
        logger.error(`   1. Folder ID is correct: ${CONFIG.GOOGLE_DRIVE_FOLDER_ID}`);
        logger.error('   2. Folder exists and is accessible');
      }
      
      throw new Error(`Drive connection test failed: ${error.message}`);
    }
  }

  async uploadFile(fileBuffer, filename, mimeType = 'application/pdf') {
    try {
      const auth = await this.auth.getClient();
      const drive = google.drive({ version: 'v3', auth });
      
      // Clean filename
      const cleanFilename = filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
      
      const fileMetadata = {
        name: cleanFilename,
        parents: [CONFIG.GOOGLE_DRIVE_FOLDER_ID]
      };

      // Convert buffer to stream for upload
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
      logger.error('❌ Drive upload failed:', error);
      throw new Error(`Drive upload failed: ${error.message}`);
    }
  }

  async convertPDFToText(fileBuffer, filename) {
    const auth = await this.auth.getClient();
    const drive = google.drive({ version: 'v3', auth });
    
    let tempPdfId = null;
    let tempDocId = null;
    
    try {
      logger.info(`🔍 Starting Google Drive OCR for: ${filename}`);
      
      // Step 1: Upload PDF to Drive
      const tempFilename = `OCR_TEMP_${Date.now()}_${filename.replace(/[<>:"/\\|?*]/g, '_')}`;
      
      // Convert buffer to stream
      const { Readable } = await import('stream');
      const stream = new Readable();
      stream.push(fileBuffer);
      stream.push(null);
      
      const fileMetadata = {
        name: tempFilename,
        parents: [CONFIG.GOOGLE_DRIVE_FOLDER_ID]
      };

      const media = {
        mimeType: 'application/pdf',
        body: stream
      };

      const uploadResponse = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id'
      });

      tempPdfId = uploadResponse.data.id;
      logger.info(`📄 Temporary PDF uploaded: ${tempPdfId}`);

      // Step 2: Convert PDF to Google Doc with OCR
      const convertResponse = await drive.files.copy({
        fileId: tempPdfId,
        requestBody: {
          name: `OCR_DOC_${Date.now()}_${filename}`,
          mimeType: 'application/vnd.google-apps.document',
          parents: [CONFIG.GOOGLE_DRIVE_FOLDER_ID]
        },
        ocrLanguage: CONFIG.OCR_LANGUAGE || 'en'
      });

      tempDocId = convertResponse.data.id;
      logger.info(`📝 OCR document created: ${tempDocId}`);

      // Step 3: Export the document as plain text
      const textResponse = await drive.files.export({
        fileId: tempDocId,
        mimeType: 'text/plain'
      });

      const extractedText = textResponse.data;
      logger.info(`📖 OCR extraction completed: ${extractedText.length} characters`);

      // Step 4: Clean up temporary files
      await Promise.allSettled([
        drive.files.delete({ fileId: tempPdfId }),
        drive.files.delete({ fileId: tempDocId })
      ]);
      
      logger.info('🗑️ Temporary OCR files cleaned up');

      return {
        text: this.formatOCRText(extractedText, filename),
        originalText: extractedText,
        length: extractedText.length
      };

    } catch (error) {
      // Clean up any temporary files on error
      if (tempPdfId) {
        try {
          await drive.files.delete({ fileId: tempPdfId });
        } catch (cleanupError) {
          logger.warn('⚠️ Failed to cleanup temp PDF:', cleanupError.message);
        }
      }
      
      if (tempDocId) {
        try {
          await drive.files.delete({ fileId: tempDocId });
        } catch (cleanupError) {
          logger.warn('⚠️ Failed to cleanup temp Doc:', cleanupError.message);
        }
      }
      
      throw new Error(`Google Drive OCR failed: ${error.message}`);
    }
  }

  formatOCRText(extractedText, filename) {
    const cleanText = extractedText
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();

    return `--- RESUME TEXT (GOOGLE DRIVE OCR) ---
Original File: ${filename}
Extraction Method: Google Drive OCR
File Size: ${extractedText.length} characters
OCR Language: ${CONFIG.OCR_LANGUAGE || 'en'}
Processing Date: ${new Date().toISOString()}

--- EXTRACTED CONTENT ---
${cleanText}

--- END OF RESUME ---`;
  }
}
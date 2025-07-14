import { google } from 'googleapis';
import { CONFIG } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger();

export class DriveService {
  constructor() {
    try {
      const credentials = JSON.parse(CONFIG.GOOGLE_CREDENTIALS);
      
      this.auth = new google.auth.GoogleAuth({
        credentials,
        scopes: [
          'https://www.googleapis.com/auth/drive.file',
          'https://www.googleapis.com/auth/drive'
        ],
        subject: CONFIG.GMAIL_USER_EMAIL
      });
      
      this.drive = google.drive({ version: 'v3' });
      
    } catch (error) {
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
      
      // Clean filename
      const cleanFilename = filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
      
      const fileMetadata = {
        name: cleanFilename,
        parents: [CONFIG.GOOGLE_DRIVE_FOLDER_ID]
      };

      const media = {
        mimeType,
        body: fileBuffer
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
      const auth = await this.auth.getClient();
      const drive = google.drive({ version: 'v3', auth });
      
      // First upload the PDF
      const tempFilename = `OCR_TEMP_${Date.now()}_${filename}`;
      
      const fileMetadata = {
        name: tempFilename,
        parents: [CONFIG.GOOGLE_DRIVE_FOLDER_ID]
      };
      const media = {
        mimeType: 'application/pdf',
        body: fileBuffer
      };
 
      const uploadResponse = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id'
      });
 
      const pdfFileId = uploadResponse.data.id;
 
      try {
        // Convert PDF to Google Doc with OCR
        const convertResponse = await drive.files.copy({
          fileId: pdfFileId,
          requestBody: {
            name: `OCR_DOC_${Date.now()}`,
            mimeType: 'application/vnd.google-apps.document',
            parents: [CONFIG.GOOGLE_DRIVE_FOLDER_ID]
          },
          ocrLanguage: CONFIG.OCR_LANGUAGE || 'en'
        });
 
        const docFileId = convertResponse.data.id;
 
        // Export the document as plain text
        const textResponse = await drive.files.export({
          fileId: docFileId,
          mimeType: 'text/plain'
        });
 
        const extractedText = textResponse.data;
 
        // Clean up temporary files
        await Promise.all([
          drive.files.delete({ fileId: pdfFileId }),
          drive.files.delete({ fileId: docFileId })
        ]);
 
        logger.info(`📄 OCR extraction completed: ${extractedText.length} characters`);
        
        return {
          text: extractedText,
          length: extractedText.length
        };
 
      } catch (conversionError) {
        // Clean up PDF file if conversion fails
        await drive.files.delete({ fileId: pdfFileId }).catch(() => {});
        throw conversionError;
      }
 
    } catch (error) {
      throw new Error(`OCR conversion failed: ${error.message}`);
    }
  }
 }
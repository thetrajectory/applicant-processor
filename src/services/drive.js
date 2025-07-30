// src/services/drive.js - Enhanced version with multi-format OCR
import { google } from 'googleapis';
import { CONFIG } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { OAuth2AuthService } from './oauth-auth.js';

const logger = createLogger();

export class DriveService {
  constructor() {
    this.authService = new OAuth2AuthService();
    
    // Define supported formats for OCR
    this.supportedOCRFormats = {
      'application/pdf': { extension: 'pdf', method: 'convertToDoc' },
      'image/jpeg': { extension: 'jpg', method: 'convertToDoc' },
      'image/jpg': { extension: 'jpg', method: 'convertToDoc' },
      'image/png': { extension: 'png', method: 'convertToDoc' },
      'image/gif': { extension: 'gif', method: 'convertToDoc' },
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { extension: 'docx', method: 'convertToDoc' },
      'application/msword': { extension: 'doc', method: 'convertToDoc' },
      'text/plain': { extension: 'txt', method: 'directText' },
      'application/rtf': { extension: 'rtf', method: 'convertToDoc' }
    };
  }

  async testConnection() {
    try {
      const auth = await this.authService.getAuthClient();
      const drive = google.drive({ version: 'v3', auth });
      
      const folder = await drive.files.get({ 
        fileId: CONFIG.GOOGLE_DRIVE_FOLDER_ID,
        fields: 'id, name, createdTime'
      });
      
      logger.info(`✅ Drive folder access successful: "${folder.data.name}"`);
      logger.info(`   Folder ID: ${CONFIG.GOOGLE_DRIVE_FOLDER_ID}`);
      logger.info(`   Supported OCR formats: ${Object.keys(this.supportedOCRFormats).length}`);
      
      return true;
    } catch (error) {
      if (error.code === 404) {
        throw new Error(`Drive folder not found. Make sure the folder ID is correct and shared with your Google account.`);
      } else if (error.code === 403) {
        throw new Error(`Permission denied. Make sure the drive folder is shared with your Google account with edit permissions.`);
      }
      throw new Error(`Drive connection test failed: ${error.message}`);
    }
  }

  canProcessFile(mimeType, filename, fileSize = 0) {
    if (!this.supportedOCRFormats[mimeType]) {
      return { 
        canProcess: false, 
        reason: `Unsupported format: ${mimeType}`,
        supportedFormats: Object.keys(this.supportedOCRFormats)
      };
    }

    const maxSize = 2 * 1024 * 1024; // 2MB in bytes
    if (fileSize > maxSize) {
      return { 
        canProcess: false, 
        reason: `File too large: ${(fileSize / 1024 / 1024).toFixed(2)}MB (max: 2MB)`,
        maxSize: '2MB'
      };
    }

    return { 
      canProcess: true, 
      method: this.supportedOCRFormats[mimeType].method,
      extension: this.supportedOCRFormats[mimeType].extension
    };
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

  async convertFileToText(fileBuffer, filename, mimeType) {
    try {
      const canProcess = this.canProcessFile(mimeType, filename, fileBuffer.length);
      
      if (!canProcess.canProcess) {
        logger.warn(`⚠️ Cannot process ${filename}: ${canProcess.reason}`);
        return {
          text: `File cannot be processed: ${canProcess.reason}`,
          originalText: '',
          length: 0,
          processed: false,
          reason: canProcess.reason
        };
      }

      logger.info(`🔍 Starting OCR conversion for: ${filename} (${mimeType})`);

      if (canProcess.method === 'directText') {
        return await this.processTextFile(fileBuffer, filename);
      } else {
        return await this.processWithOCR(fileBuffer, filename, mimeType);
      }

    } catch (error) {
      logger.error(`❌ OCR conversion failed for ${filename}:`, error.message);
      
      return {
        text: `OCR conversion failed for ${filename}: ${error.message}`,
        originalText: '',
        length: 0,
        processed: false,
        error: error.message
      };
    }
  }

  async processTextFile(fileBuffer, filename) {
    try {
      const textContent = fileBuffer.toString('utf-8');
      
      logger.info(`📖 Text file processed: ${textContent.length} characters`);
      
      const formattedText = this.formatOCRResult(textContent, filename, 'Direct Text');
      
      return {
        text: formattedText,
        originalText: textContent,
        length: textContent.length,
        processed: true,
        method: 'direct_text'
      };
    } catch (error) {
      throw new Error(`Text file processing failed: ${error.message}`);
    }
  }

  async processWithOCR(fileBuffer, filename, mimeType) {
    try {
      const auth = await this.authService.getAuthClient();
      const drive = google.drive({ version: 'v3', auth });
      
      const { Readable } = await import('stream');
      const stream = new Readable();
      stream.push(fileBuffer);
      stream.push(null);

      const tempName = `ocr_${Date.now()}_${filename.replace(/\.[^/.]+$/, '')}`;

      logger.info(`📤 Uploading for OCR: ${tempName}`);

      const response = await drive.files.create({
        requestBody: {
          name: tempName,
          parents: [CONFIG.GOOGLE_DRIVE_FOLDER_ID],
          mimeType: 'application/vnd.google-apps.document'
        },
        media: {
          mimeType: mimeType,
          body: stream
        },
        fields: 'id,name'
      });

      const docId = response.data.id;
      logger.info(`📝 File converted to Google Doc with OCR: ${docId}`);

      await new Promise(resolve => setTimeout(resolve, 2000));

      const exportResponse = await drive.files.export({
        fileId: docId,
        mimeType: 'text/plain'
      });

      const extractedText = exportResponse.data;
      logger.info(`📖 Text extracted: ${extractedText.length} characters from ${mimeType}`);

      await drive.files.delete({ fileId: docId }).catch(err => 
        logger.warn(`Failed to delete temp Doc: ${err.message}`)
      );

      const formattedText = this.formatOCRResult(extractedText, filename, 'Google Drive OCR');
      
      return {
        text: formattedText,
        originalText: extractedText,
        length: extractedText.length,
        processed: true,
        method: 'google_drive_ocr',
        mimeType: mimeType
      };

    } catch (error) {
      throw new Error(`Google Drive OCR failed: ${error.message}`);
    }
  }

  async convertPDFToText(fileBuffer, filename) {
    return await this.convertFileToText(fileBuffer, filename, 'application/pdf');
  }

  formatOCRResult(extractedText, filename, method = 'Google Drive OCR') {
    const cleanText = extractedText
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .replace(/\r/g, '')
      .trim();

    return `--- RESUME TEXT (${method}) ---
Original File: ${filename}
Extraction Method: ${method}
Extracted Characters: ${cleanText.length}
Processing Date: ${new Date().toISOString()}

--- EXTRACTED CONTENT ---
${cleanText}

--- END OF RESUME ---`;
  }
}
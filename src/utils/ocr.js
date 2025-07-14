import { createLogger } from './logger.js';
import { CONFIG } from '../config.js';

const logger = createLogger();

export class OCRService {
  constructor() {
    // This service now relies entirely on Google Drive's OCR capabilities
    // which are accessed through the DriveService
  }

  async processPDF(pdfBuffer, filename) {
    try {
      logger.info(`📄 Processing PDF with Google Drive OCR: ${filename}`);
      
      // This method now serves as a wrapper/fallback
      // The actual OCR processing is done in DriveService.convertPDFToText()
      
      const result = this.formatOCRResult(
        'PDF processing requires Google Drive OCR - see DriveService.convertPDFToText()',
        filename
      );
      
      logger.warn('⚠️ Direct OCR processing called - use DriveService.convertPDFToText() instead');
      
      return result;
      
    } catch (error) {
      logger.error(`❌ OCR processing failed for ${filename}:`, error);
      throw new Error(`OCR processing failed: ${error.message}`);
    }
  }

  formatOCRResult(extractedText, filename) {
    const cleanText = extractedText
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();
    
    const result = `--- RESUME TEXT (GOOGLE DRIVE OCR) ---
Original File: ${filename}
Extraction Method: Google Drive OCR
Extracted Characters: ${cleanText.length}
Processing Date: ${new Date().toISOString()}

--- EXTRACTED CONTENT ---
${cleanText}

--- END OF RESUME ---`;
    
    return {
      text: result,
      originalText: cleanText,
      length: cleanText.length,
      filename
    };
  }
}
import { createLogger } from './logger.js';

const logger = createLogger();

export class OCRService {
  constructor() {
    // This service is now a placeholder - all OCR is handled by Google Drive
    logger.info('📄 OCR Service initialized - using Google Drive OCR only');
  }

  async processPDF(pdfBuffer, filename) {
    // This method is deprecated - OCR is now handled entirely by Google Drive
    logger.warn('⚠️ OCRService.processPDF is deprecated - use DriveService.convertPDFToText instead');
    
    return {
      text: `PDF file: ${filename} - processed via Google Drive OCR`,
      originalText: '',
      length: 0,
      filename
    };
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
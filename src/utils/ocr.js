import Tesseract from 'tesseract.js';
import pdfParse from 'pdf-parse';
import { CONFIG } from '../config.js';
import { createLogger } from './logger.js';

const logger = createLogger();

export class OCRService {
  constructor() {
    this.tesseract = Tesseract;
  }

  async processPDF(pdfBuffer, filename) {
    try {
      logger.info(`📄 Starting OCR processing for: ${filename}`);
      
      // First try to extract text directly from PDF
      let extractedText = await this.extractTextFromPDF(pdfBuffer);
      
      // If direct extraction fails or produces minimal text, use OCR
      if (!extractedText || extractedText.trim().length < 100) {
        logger.info('📄 Direct PDF text extraction insufficient, using OCR...');
        extractedText = await this.performOCR(pdfBuffer);
      }
      
      // Format the result
      const result = this.formatOCRResult(extractedText, filename);
      
      logger.info(`📖 OCR completed: ${result.text.length} characters extracted`);
      
      return result;
      
    } catch (error) {
      logger.error(`❌ OCR processing failed for ${filename}:`, error);
      throw new Error(`OCR processing failed: ${error.message}`);
    }
  }

  async extractTextFromPDF(pdfBuffer) {
    try {
      const data = await pdfParse(pdfBuffer);
      return data.text;
    } catch (error) {
      logger.warn(`⚠️ Direct PDF text extraction failed:`, error);
      return '';
    }
  }

  async performOCR(pdfBuffer) {
    try {
      // Convert PDF to image first (this is a simplified approach)
      // In production, you might want to use a more robust PDF to image conversion
      const { data: { text } } = await this.tesseract.recognize(
        pdfBuffer,
        CONFIG.OCR_LANGUAGE,
        {
          logger: m => {
            if (m.status === 'recognizing text') {
              logger.debug(`OCR progress: ${Math.round(m.progress * 100)}%`);
            }
          }
        }
      );
      
      return text;
    } catch (error) {
      logger.error(`❌ Tesseract OCR failed:`, error);
      throw error;
    }
  }

  formatOCRResult(extractedText, filename) {
    const cleanText = extractedText
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();
    
    const result = `--- RESUME TEXT (OCR EXTRACTED) ---
Original File: ${filename}
Extraction Method: ${cleanText.length > 100 ? 'Direct PDF' : 'OCR'}
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
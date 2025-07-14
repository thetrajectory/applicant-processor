import OpenAI from 'openai';
import { CONFIG } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger();

export class OpenAIService {
  constructor() {
    try {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: CONFIG.GPT_TIMEOUT
      });
    } catch (error) {
      throw new Error(`OpenAI initialization failed: ${error.message}`);
    }
  }

  async testConnection() {
    try {
      const response = await this.openai.chat.completions.create({
        model: CONFIG.GPT_MODEL,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 5
      });
      
      return response.choices.length > 0;
    } catch (error) {
      throw new Error(`OpenAI connection test failed: ${error.message}`);
    }
  }

  async extractContactInfo(resumeText) {
    if (!resumeText || resumeText.trim() === '') {
      logger.warn('⚠️ No resume text provided for GPT extraction');
      return { mobile_number: null, email: null, linkedin_url: null };
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: CONFIG.GPT_MODEL,
        messages: [
          {
            role: 'user',
            content: `${CONFIG.GPT_PROMPT}\n\n${resumeText}`
          }
        ],
        max_tokens: CONFIG.GPT_MAX_TOKENS,
        temperature: CONFIG.GPT_TEMPERATURE
      });

      let extractedText = response.choices[0].message.content.trim();
      
      // Clean up markdown code blocks if present
      if (extractedText.includes('```json')) {
        extractedText = extractedText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      } else if (extractedText.includes('```')) {
        extractedText = extractedText.replace(/```\s*/g, '');
      }
      
      // Parse JSON response
      const contactInfo = JSON.parse(extractedText);
      
      // Validate and return structured response
      const validatedInfo = {
        mobile_number: contactInfo.mobile_number || null,
        email: contactInfo.email || null,
        linkedin_url: contactInfo.linkedin_url || null
      };
      
      logger.info(`🤖 GPT extraction result: ${JSON.stringify(validatedInfo)}`);
      return validatedInfo;
      
    } catch (error) {
      logger.error(`❌ GPT extraction error:`, error);
      return { mobile_number: null, email: null, linkedin_url: null };
    }
  }

  async getUsage() {
    try {
      // Note: OpenAI doesn't provide usage stats in the API
      // This is a placeholder for potential future implementation
      return { tokens_used: 0, requests_made: 0 };
    } catch (error) {
      logger.error(`Error getting OpenAI usage:`, error);
      return { tokens_used: 0, requests_made: 0 };
    }
  }
}
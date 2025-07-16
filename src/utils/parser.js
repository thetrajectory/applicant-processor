import { createLogger } from './logger.js';

const logger = createLogger();

export class EmailParser {
  constructor() {
    this.linkedInPatterns = [
      /linkedin\.com/i,
      /jobs-noreply.*linkedin/i,
      /new application/i,
      /job application/i,
      /your job has a new applicant/i
    ];
  }

  isLinkedInApplication(message) {
    const subject = message.subject.toLowerCase();
    const body = message.body.toLowerCase();
    const from = message.from.toLowerCase();
    
    const isLinkedIn = this.linkedInPatterns.some(pattern => 
      pattern.test(subject) || pattern.test(body) || pattern.test(from)
    );
    
    if (isLinkedIn) {
      logger.debug(`✅ LinkedIn application detected: ${message.subject}`);
    } else {
      logger.debug(`❌ Not a LinkedIn application: ${message.subject}`);
    }
    
    return isLinkedIn;
  }

  parseLinkedInApplication(message) {
    logger.info(`📋 Parsing LinkedIn application: ${message.subject}`);
    
    const subject = message.subject;
    const emailBody = message.body;
    const htmlBody = message.htmlBody || '';
    
    const result = {
      name: null,
      title: null,
      location: null,
      expected_compensation: null,
      project_id: null,
      screening_questions: null
    };
    
    // Extract name from subject line
    const subjectNameMatch = subject.match(/from\s+(.+)$/i);
    if (subjectNameMatch) {
      result.name = subjectNameMatch[1].trim();
      logger.debug(`📝 Name extracted from subject: ${result.name}`);
    }
    
    // Extract title from subject (job position)
    const subjectTitleMatch = subject.match(/New application:\s*(.+?)\s+from/i);
    if (subjectTitleMatch) {
      result.title = subjectTitleMatch[1].trim();
      logger.debug(`💼 Title extracted from subject: ${result.title}`);
    }
    
    // Enhanced location extraction
    const locationPatterns = [
      /^([A-Za-z\s,.-]+(?:Indonesia|Malaysia|Singapore|Thailand|Philippines|Vietnam|India|Pakistan|Bangladesh))\s*$/im,
      /^([A-Za-z\s]+,\s*[A-Za-z\s]+,\s*[A-Za-z\s]+)\s*$/im,
      /^([A-Za-z\s]+,\s*[A-Za-z\s]+)\s*$/im,
      /Fullstack Developer\s*\n\s*([A-Za-z\s,.-]+)\s*\n/i
    ];
    
    for (const pattern of locationPatterns) {
      const locationMatch = emailBody.match(pattern) || htmlBody.match(pattern);
      if (locationMatch && locationMatch[1]) {
        const potentialLocation = locationMatch[1].trim();
        
        if (this.isValidLocation(potentialLocation)) {
          result.location = potentialLocation;
          logger.debug(`📍 Location extracted: ${result.location}`);
          break;
        }
      }
    }
    
    // Extract screening questions
    const screeningPatterns = [
      /Screening qualifications[:\s\n]+(.*?)(?=Skills match|View all|Current experience|Past experience|$)/is,
      /What is your expected monthly compensation[^?]*\?\s*([0-9,]+)/i,
      /(\d+\s+out of\s+\d+\s+preferred qualifications met.*?)(?=Skills match|View all|$)/is,
      /preferred qualifications met\s*(.*?)(?=Skills match|View all|Current experience|$)/is
    ];
    
    for (const pattern of screeningPatterns) {
      const screeningMatch = emailBody.match(pattern);
      if (screeningMatch && screeningMatch[1]) {
        let screeningText = screeningMatch[1].trim()
          .replace(/\s+/g, ' ')
          .replace(/\n+/g, '\n')
          .trim();
        
        if (screeningText.length > 5) {
          result.screening_questions = screeningText;
          logger.debug(`❓ Screening questions extracted: ${screeningText.substring(0, 100)}...`);
          break;
        }
      }
    }
    
    // Extract compensation
    const compensationPatterns = [
      /expected monthly compensation[^?]*\?\s*([0-9,]+)/i,
      /compensation[^0-9]*([0-9,]+)/i,
      /IDR[^0-9]*([0-9,]+)/i
    ];
    
    for (const pattern of compensationPatterns) {
      const compensationMatch = emailBody.match(pattern);
      if (compensationMatch && compensationMatch[1]) {
        result.expected_compensation = compensationMatch[1].trim();
        logger.debug(`💰 Compensation extracted: ${result.expected_compensation}`);
        break;
      }
    }
    
    // Extract project ID
    const projectIdMatch = htmlBody.match(/batchReview[^&]*project[^&]*3D(\d+)/i) ||
                          htmlBody.match(/project[=:](\d+)/i);
    if (projectIdMatch) {
      result.project_id = projectIdMatch[1];
      logger.debug(`🆔 Project ID extracted: ${result.project_id}`);
    }
    
    logger.info(`📋 Parsed data: ${JSON.stringify(result, null, 2)}`);
    return result;
  }

  isValidLocation(location) {
    if (!location || location.length < 3 || location.length > 100) return false;
    
    const invalidPatterns = [
      /developer/i,
      /engineer/i,
      /manager/i,
      /experience/i,
      /current/i,
      /past/i,
      /^\d+$/
    ];
    
    return !invalidPatterns.some(pattern => pattern.test(location));
  }
}
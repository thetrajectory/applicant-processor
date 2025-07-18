import { createLogger } from './logger.js';

const logger = createLogger();

export class EmailParser {
  constructor() {
    this.linkedInPatterns = [
      /linkedin\.com/i,
      /jobs-noreply.*linkedin/i,
      /new application/i,
      /job application/i,
      /your job has a new applicant/i,
      /applicant.*submitted/i
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
    
    // Log the full email content for debugging
    logger.debug('📧 Email Subject:', subject);
    logger.debug('📧 Email Body (first 500 chars):', emailBody.substring(0, 500));
    logger.debug('📧 HTML Body (first 500 chars):', htmlBody.substring(0, 500));
    
    const result = {
      name: null,
      title: null,
      location: null,
      expected_compensation: null,
      project_id: null,
      screening_questions: null
    };
    
    // Extract all fields with enhanced patterns
    result.name = this.extractName(subject, emailBody, htmlBody);
    result.title = this.extractJobTitle(subject, emailBody, htmlBody);
    result.location = this.extractLocation(emailBody, htmlBody);
    result.expected_compensation = this.extractCompensation(emailBody, htmlBody);
    result.project_id = this.extractProjectId(emailBody, htmlBody, subject);
    result.screening_questions = this.extractScreeningQuestions(emailBody, htmlBody);
    
    logger.info(`📋 Parsed data: ${JSON.stringify(result, null, 2)}`);
    return result;
  }

  extractName(subject, emailBody, htmlBody) {
    const namePatterns = [
      // From subject line - most common format
      /new application:\s*[^:]+(?:from|–|-)\s*([A-Z][a-z]+(?:\s+[a-z]+)*(?:\s+[A-Z][a-z]+)*)/i,
      /job application.*?(?:from|–|-)\s*([A-Z][a-z]+(?:\s+[a-z]+)*(?:\s+[A-Z][a-z]+)*)/i,
      /application.*?(?:from|–|-)\s*([A-Z][a-z]+(?:\s+[a-z]+)*(?:\s+[A-Z][a-z]+)*)/i,
      
      // From email body - various formats
      /^([A-Z][a-z]+(?:\s+[a-z]+)*(?:\s+[A-Z][a-z]+)*)\s*$/m,
      /candidate[:\s]*([A-Z][a-z]+(?:\s+[a-z]+)*(?:\s+[A-Z][a-z]+)*)/i,
      /applicant[:\s]*([A-Z][a-z]+(?:\s+[a-z]+)*(?:\s+[A-Z][a-z]+)*)/i,
      /from[:\s]*([A-Z][a-z]+(?:\s+[a-z]+)*(?:\s+[A-Z][a-z]+)*)/i,
      
      // Name on its own line
      /\n([A-Z][a-z]+(?:\s+[a-z]+)*(?:\s+[A-Z][a-z]+)*)\n/,
      
      // HTML patterns
      /<(?:strong|b|h1|h2|h3)[^>]*>([A-Z][a-z]+(?:\s+[a-z]+)*(?:\s+[A-Z][a-z]+)*)<\/(?:strong|b|h1|h2|h3)>/i,
      /<td[^>]*>([A-Z][a-z]+(?:\s+[a-z]+)*(?:\s+[A-Z][a-z]+)*)<\/td>/i
    ];

    for (const pattern of namePatterns) {
      const sources = [subject, emailBody, htmlBody];
      for (const source of sources) {
        const match = source.match(pattern);
        if (match && match[1]) {
          const name = match[1].trim();
          if (this.isValidName(name)) {
            logger.debug(`📝 Name extracted from pattern: ${pattern} -> ${name}`);
            return name;
          }
        }
      }
    }
    
    return null;
  }

  extractJobTitle(subject, emailBody, htmlBody) {
    const titlePatterns = [
      // From subject - most reliable
      /new application:\s*([^:]+?)(?:\s+(?:from|–|-|at))/i,
      /job application[:\s]*([^-–]+?)(?:\s+(?:from|–|-|at))/i,
      /application[:\s]*([^-–]+?)(?:\s+(?:from|–|-|at))/i,
      
      // From body - job title context
      /(?:position|job|role|title)[:\s]*([A-Za-z\s]+?)(?:\s+(?:at|with|for|in|\n|\||•))/i,
      /([A-Za-z\s]+?)\s+(?:position|role)\s+at/i,
      /job[:\s]*([A-Za-z\s]+?)(?:\n|\||•|at)/i,
      
      // HTML patterns
      /<(?:h1|h2|h3|strong|b)[^>]*>([^<]+?)(?:\s+(?:at|position|role|job))<\/(?:h1|h2|h3|strong|b)>/i,
      /<title[^>]*>([^<]+)<\/title>/i
    ];

    for (const pattern of titlePatterns) {
      const sources = [subject, emailBody, htmlBody];
      for (const source of sources) {
        const match = source.match(pattern);
        if (match && match[1]) {
          const title = match[1].trim();
          if (this.isValidJobTitle(title)) {
            logger.debug(`💼 Title extracted from pattern: ${pattern} -> ${title}`);
            return title;
          }
        }
      }
    }
    
    return null;
  }

  extractLocation(emailBody, htmlBody) {
    // Clean the text first to handle formatting issues
    const cleanBody = this.cleanTextForParsing(emailBody);
    const cleanHtml = this.cleanTextForParsing(htmlBody);
    
    // Define location patterns in smaller, manageable chunks
    const locationPatterns = [
      // International locations - City, Country format
      /(?:location|address|based|from|in|at)[:\s]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
      
      // Indonesian locations specifically
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*Indonesia)/i,
      /\b(Banten|Jakarta|West Java|East Java|Central Java|Yogyakarta|Bali|Sumatra|Kalimantan|Sulawesi|Papua|Aceh|North Sumatra|South Sumatra|Lampung|Bengkulu|Jambi|Riau|West Sumatra|Bangka Belitung|West Kalimantan|Central Kalimantan|South Kalimantan|East Kalimantan|North Kalimantan|North Sulawesi|Central Sulawesi|South Sulawesi|Southeast Sulawesi|Gorontalo|West Sulawesi|Maluku|North Maluku|West Papua),?\s*Indonesia\b/i,
      
      // Southeast Asian countries
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*(?:Singapore|Malaysia|Thailand|Philippines|Vietnam|Cambodia|Myanmar|Laos|Brunei))/i,
      
      // Major Asian countries
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*(?:Australia|New Zealand|Japan|South Korea|China|Hong Kong|Taiwan))/i,
      
      // Indian states (keeping existing patterns)
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*(?:Andhra Pradesh|Arunachal Pradesh|Assam|Bihar|Chhattisgarh|Goa|Gujarat|Haryana|Himachal Pradesh|Jharkhand|Karnataka|Kerala|Madhya Pradesh|Maharashtra|Manipur|Meghalaya|Mizoram|Nagaland|Odisha|Punjab|Rajasthan|Sikkim|Tamil Nadu|Telangana|Tripura|Uttar Pradesh|Uttarakhand|West Bengal|Delhi|NCR),?\s*India)/i,
      
      // Western countries
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*(?:United States|USA|Canada|United Kingdom|UK|Germany|France|Italy|Spain|Netherlands|Belgium|Sweden|Norway|Denmark|Finland|Switzerland|Austria|Poland|Czech Republic|Hungary|Romania|Bulgaria|Greece|Turkey|Russia|Ukraine))/i,
      
      // Americas and others
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*(?:Brazil|Argentina|Chile|Colombia|Peru|Mexico|South Africa|Egypt|Nigeria|Kenya|Morocco|Algeria|Tunisia))/i,
      
      // Major Indonesian cities without country
      /\b(Jakarta|Surabaya|Bandung|Medan|Semarang|Makassar|Palembang|Tangerang|Depok|Bekasi|Banten|Yogyakarta|Denpasar|Balikpapan|Samarinda|Manado|Pontianak|Banjarmasin|Pekanbaru|Padang|Batam|Bogor|Malang|Cilegon|Serang)\b/i,
      
      // Major global cities without country
      /\b(Singapore|Bangkok|Manila|Sydney|Melbourne|Tokyo|Seoul|Hong Kong|Taipei|Shanghai|Beijing|Mumbai|Delhi|Bangalore|Chennai|London|Paris|Berlin|Amsterdam|Stockholm|Oslo|Copenhagen|Helsinki|Zurich|Vienna|Warsaw|Prague|Budapest|Rome|Milan|Madrid|Barcelona|Brussels|Dublin|Lisbon|Moscow|Istanbul|Dubai|Tel Aviv|Cairo|Cape Town|Toronto|Vancouver|New York|Los Angeles|Chicago|San Francisco|Boston|Seattle)\b/i,
      
      // After name or profile info - more flexible
      /(?:^|\n)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*[,\n]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/im,
      
      // Pattern specifically for LinkedIn format: "Position at Company · Location"
      /[·•]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)*)\s*$/im,
      
      // Location after company name with bullet or separator
      /@[^·•\n]+[·•]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)*)/i,
      
      // In applicant details - more flexible
      /(?:applicant|candidate).*?(?:location|from|based|address)[:\s]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)*)/is,
      
      // Simple city names in context - more flexible
      /(?:from|in|at|based|location)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)*)\s*(?:,|$|\n|•|\||\.)/i,
      
      // HTML table data - more flexible
      /<td[^>]*>([^<]*(?:Indonesia|Singapore|Malaysia|Thailand|Philippines|Vietnam|Australia|Japan|Korea|China|India|USA|Canada|UK|Germany|France)[^<]*)<\/td>/i,
      
      // Standalone location with comma format
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/i
    ];
  
    const sources = [cleanBody, cleanHtml, emailBody, htmlBody];
    
    for (const source of sources) {
      for (const pattern of locationPatterns) {
        const match = source.match(pattern);
        if (match) {
          let location;
          
          // Handle different capture groups
          if (match[2] && match[1]) {
            // Two parts: City, Country or State, Country
            location = `${match[1].trim()}, ${match[2].trim()}`;
          } else if (match[1]) {
            // Single part
            location = match[1].trim();
          } else {
            continue;
          }
          
          location = this.cleanLocation(location);
          if (this.isValidLocation(location)) {
            logger.debug(`📍 Location extracted from pattern: ${pattern} -> ${location}`);
            return location;
          }
        }
      }
    }
    
    return null;
  }

  extractCompensation(emailBody, htmlBody) {
    // Clean the text to handle formatting
    const cleanBody = this.cleanTextForParsing(emailBody);
    const cleanHtml = this.cleanTextForParsing(htmlBody);
    
    const compensationPatterns = [
      // Current CTC patterns - most comprehensive
      /(?:current|annual|yearly|present)\s+(?:CTC|compensation|salary|package)[?\s:]*(?:INR|Rs\.?|₹|is)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:LPA|lakh|lakhs|lac|lacs|crore|crores|per\s+annum|PA)?/i,
      
      // What is your current CTC?
      /what\s+is\s+your\s+current\s+(?:annual\s+)?CTC[?\s:]*(?:INR|Rs\.?|₹)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:LPA|lakh|lakhs|lac|lacs|crore|crores)?/i,
      
      // CTC with amount
      /CTC[?\s:]*(?:INR|Rs\.?|₹)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:LPA|lakh|lakhs|lac|lacs|per\s+annum|PA)/i,
      
      // Expected salary
      /expected\s+(?:salary|compensation|CTC|package)[?\s:]*(?:INR|Rs\.?|₹)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:LPA|lakh|lakhs|lac|lacs|crore|crores|per\s+annum)?/i,
      
      // In screening questions context
      /(?:screening|question).*?(?:CTC|salary|compensation)[?\s:]*(?:INR|Rs\.?|₹)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:LPA|lakh|lakhs|lac|lacs|crore|crores)?/is,
      
      // Salary expectation
      /salary\s+expectation[?\s:]*(?:INR|Rs\.?|₹)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:LPA|lakh|lakhs|lac|lacs|crore|crores)?/i,
      
      // Simple amount with currency
      /(?:INR|Rs\.?|₹)\s*([0-9]+(?:[,\s][0-9]+)*(?:\.[0-9]+)?)\s*(?:LPA|lakh|lakhs|lac|lacs|per\s+annum|PA)/i,
      
      // Just numbers in CTC context (last resort)
      /CTC.*?([0-9]+(?:\.[0-9]+)?)/i,
      
      // Amount followed by LPA
      /([0-9]+(?:\.[0-9]+)?)\s*(?:LPA|lakh|lakhs|lac|lacs)/i
    ];

    const sources = [cleanBody, cleanHtml, emailBody, htmlBody];
    
    for (const source of sources) {
      for (const pattern of compensationPatterns) {
        const match = source.match(pattern);
        if (match && match[1]) {
          const compensation = this.cleanCompensation(match[1]);
          if (compensation && parseFloat(compensation) > 0) {
            logger.debug(`💰 Compensation extracted from pattern: ${pattern} -> ${compensation}`);
            return compensation;
          }
        }
      }
    }
    
    return null;
  }

  extractScreeningQuestions(emailBody, htmlBody) {
    // Clean the text to handle formatting
    const cleanBody = this.cleanTextForParsing(emailBody);
    const cleanHtml = this.cleanTextForParsing(htmlBody);
    
    const screeningPatterns = [
      // Enhanced screening questions patterns
      /((?:\d+\s+out\s+of\s+\d+\s+preferred\s+qualifications?\s+met).*?(?:CTC|compensation|salary|experience|years?).*?)(?=(?:skills|experience|education|contact|view\s+all|show\s+less|regards|best|thank)|$)/is,
      
      /screening\s+(?:qualifications?|questions?)[:\s\n]+(.*?)(?=(?:skills|experience|education|additional|contact|view\s+all|show\s+less|regards|best|thank)|$)/is,
      
      /(preferred\s+qualifications?.*?met.*?)(?=(?:skills|experience|education|additional|contact|view\s+all|show\s+less|regards|best|thank)|$)/is,
      
      /(qualifications?\s+met[:\s\n]+.*?)(?=(?:skills|experience|education|view\s+all|show\s+less|regards|best|thank)|$)/is,
      
      // Questions and answers format
      /((?:what\s+is|how\s+many|do\s+you|are\s+you|can\s+you).*?(?:CTC|experience|years?|willing|available).*?)(?=(?:skills|experience|education|contact|view\s+profile|regards|best|thank)|$)/gis,
      
      // CTC and experience info
      /(.*?(?:CTC|compensation|salary|experience|years?).*?)(?=(?:skills|education|contact|view\s+profile|regards|best|thank)|$)/is,
      
      // Broader screening section
      /(screening.*?)(?=(?:skills|education|contact|view\s+profile|additional|regards|best|thank)|$)/is
    ];

    const sources = [cleanBody, cleanHtml, emailBody, htmlBody];
    
    for (const source of sources) {
      for (const pattern of screeningPatterns) {
        const match = source.match(pattern);
        if (match && match[1]) {
          const questions = this.cleanScreeningQuestions(match[1]);
          if (questions && questions.length > 15) {  // Must be substantial
            logger.debug(`❓ Screening questions extracted from pattern: ${pattern} -> ${questions.substring(0, 100)}...`);
            return questions;
          }
        }
      }
    }
    
    return null;
  }

  extractProjectId(emailBody, htmlBody, subject) {
    const sources = [htmlBody, emailBody, subject];
    
    const projectIdPatterns = [
      // URL patterns - most comprehensive
      /(?:project|jobId|posting|job)[=:](\d{6,})/i,
      /linkedin\.com[^"'\s]*(?:project|posting|job|currentJobId)[=:](\d{6,})/i,
      /(?:tracking|view|redirect|apply)[^"'\s]*(?:project|job)[=:](\d{6,})/i,
      /currentJobId[=:](\d{6,})/i,
      /jobId[=:](\d{6,})/i,
      
      // In links and references
      /job\s+(?:id|reference|number|posting)[:\s#]*(\d{6,})/i,
      /project\s+(?:id|reference|number)[:\s#]*(\d{6,})/i,
      /posting\s+(?:id|reference|number)[:\s#]*(\d{6,})/i,
      /application\s+(?:id|reference|number)[:\s#]*(\d{6,})/i,
      
      // HTML href attributes
      /href=['"'][^'"]*(?:project|job|posting|currentJobId)[=:](\d{6,})/i,
      /href=['"'][^'"]*\/(\d{10,})['"]/i,  // Long numeric IDs in URLs
      
      // Simple numeric patterns in job context
      /(?:job|project|posting|application).*?(\d{8,})/i,
      
      // LinkedIn specific URL patterns
      /linkedin\.com\/jobs\/view\/(\d{6,})/i,
      /linkedin\.com\/[^"'\s]*\/(\d{10,})/i
    ];
    
    for (const source of sources) {
      for (const pattern of projectIdPatterns) {
        const match = source.match(pattern);
        if (match && match[1]) {
          const projectId = match[1];
          if (projectId.length >= 6 && projectId.length <= 15) {  // Reasonable length
            logger.debug(`🆔 Project ID extracted from pattern: ${pattern} -> ${projectId}`);
            return projectId;
          }
        }
      }
    }
    
    return null;
  }

  // Enhanced helper methods
  cleanTextForParsing(text) {
    if (!text) return '';
    
    return text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/<[^>]*>/g, ' ')  // Remove HTML tags
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .replace(/\r\n/g, '\n')    // Normalize line breaks
      .trim();
  }

  isValidName(name) {
    if (!name || name.length < 2 || name.length > 100) return false;
    
    const invalidPatterns = [
      /^(new|application|from|job|candidate|applicant|developer|engineer|manager|senior|junior|lead|position|role|title|at|with|for|in)$/i,
      /^\d+$/,
      /^[^a-zA-Z]*$/,
      /^(your|has|the|and|or|but|if|when|where|what|how|why|this|that|these|those)$/i
    ];
    
    // Must contain at least one alphabetic character
    if (!/[a-zA-Z]/.test(name)) return false;
    
    // Check against invalid patterns
    return !invalidPatterns.some(pattern => pattern.test(name.trim()));
  }

  isValidJobTitle(title) {
    if (!title || title.length < 3 || title.length > 150) return false;
    
    const validJobWords = /(?:developer|engineer|manager|analyst|consultant|designer|architect|programmer|specialist|coordinator|executive|director|lead|senior|junior|associate|intern|trainee|python|java|full\s*stack|backend|frontend|data|software|web|mobile|application|system|network|database|devops|qa|testing|product|project|technical|business)/i;
    
    const invalidWords = /^(new|application|from|job|at|with|for|in|the|and|or|but|your|has|this|that)$/i;
    
    return validJobWords.test(title) && !invalidWords.test(title.trim());
  }

  isValidLocation(location) {
    if (!location || location.length < 2 || location.length > 150) return false;
    
    const invalidPatterns = [
      /^(developer|engineer|manager|experience|current|past|software|python|java|react|skills|qualifications|screening|questions|answers|yes|no|true|false|senior|junior|lead|architect|designer|analyst|consultant|specialist|coordinator|executive|director|intern|trainee)$/i,
      /^\d+$/,
      /^[0-9\s,.-]+$/,
      /^(new|application|from|job|at|with|for|in|the|and|or|but|your|has|this|that|these|those|view|all|click|here|link|email|message|html|body|subject)$/i
    ];
    
    // Enhanced validation for international locations - broken into smaller patterns
    const locationKeywords = [
      // Southeast Asia
      /\b(?:indonesia|singapore|malaysia|thailand|philippines|vietnam|cambodia|myanmar|laos|brunei)\b/i,
      
      // East Asia & Pacific
      /\b(?:australia|new\s*zealand|japan|south\s*korea|korea|china|hong\s*kong|taiwan)\b/i,
      
      // South Asia
      /\b(?:india|pakistan|bangladesh|sri\s*lanka|nepal)\b/i,
      
      // Western countries
      /\b(?:united\s*states|usa|canada|united\s*kingdom|uk|britain|germany|france|italy|spain|netherlands|belgium|sweden|norway|denmark|finland|switzerland|austria|poland|czech|hungary|romania|bulgaria|greece|turkey|russia|ukraine)\b/i,
      
      // Americas & Africa
      /\b(?:brazil|argentina|chile|colombia|peru|mexico|south\s*africa|egypt|nigeria|kenya|morocco|algeria|tunisia)\b/i,
      
      // Location terms
      /\b(?:city|state|province|region|county|district)\b/i,
      
      // Indonesian locations
      /\b(?:banten|jakarta|west\s*java|east\s*java|central\s*java|yogyakarta|bali|sumatra|kalimantan|sulawesi|papua)\b/i,
      
      // Indian locations
      /\b(?:punjab|delhi|mumbai|bangalore|bengaluru|hyderabad|chennai|kolkata|pune|ahmedabad|karnataka|tamil\s*nadu|maharashtra|gujarat|andhra\s*pradesh|telangana|kerala|west\s*bengal|rajasthan|bihar|jharkhand|odisha|assam)\b/i,
      
      // Major global cities
      /\b(?:london|paris|berlin|amsterdam|tokyo|seoul|beijing|shanghai|sydney|melbourne|toronto|vancouver|new\s*york|los\s*angeles|chicago|san\s*francisco|boston|seattle)\b/i
    ];
    
    const hasValidLocationWords = locationKeywords.some(pattern => pattern.test(location));
    const hasCommaFormat = location.includes(',') && location.split(',').length >= 2;
    
    // Check if it contains alphabetic characters
    const hasAlphaChars = /[a-zA-Z]/.test(location);
    
    const isInvalid = invalidPatterns.some(pattern => pattern.test(location.trim()));
    
    return !isInvalid && hasAlphaChars && (hasValidLocationWords || hasCommaFormat);
  }

  cleanLocation(location) {
    return location
      .replace(/^[|\s\-•·]+/, '')        // Remove leading separators
      .replace(/[|\s\-•·]+$/, '')        // Remove trailing separators  
      .replace(/\s+/g, ' ')              // Normalize whitespace
      .replace(/[•\-\|·]/g, '')          // Remove bullet points and separators
      .replace(/,\s*,/g, ',')            // Remove double commas
      .replace(/\s*,\s*/g, ', ')         // Normalize comma spacing
      .replace(/\s+,/g, ',')             // Remove spaces before commas
      .replace(/,\s*$/, '')              // Remove trailing comma
      .trim();
  }

  cleanCompensation(compensation) {
    const cleaned = compensation
      .replace(/[,\s]/g, '')
      .replace(/[^\d.]/g, '');
    
    const num = parseFloat(cleaned);
    return num && num > 0 && num < 1000 ? cleaned : null;  // Reasonable range for lakhs
  }

  cleanScreeningQuestions(questions) {
    return questions
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .replace(/[•\-\|]/g, '')
      .replace(/^\s*screening\s*:?\s*/i, '')
      .trim();
  }
}
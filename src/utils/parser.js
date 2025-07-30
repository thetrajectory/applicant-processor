import { createLogger } from './logger.js';

const logger = createLogger();

export class EmailParser {
  constructor() {
    // Enhanced LinkedIn patterns
    this.linkedInPatterns = [
      /jobs-listings@linkedin\.com/i,
      /jobs-noreply@linkedin\.com/i,
      /noreply@linkedin\.com/i,
      /linkedin\.com/i,
      /new application/i,
      /job application/i,
      /your job has a new applicant/i,
      /application received/i,
      /application submitted/i,
      /thank you for applying/i,
      /your application/i,
      /we received your application/i,
      /application status/i,
      /applicant.*submitted/i,
      /candidate applied/i,
      /resume received/i,
      /cv received/i,
      /applied.*position/i,
      /applied.*role/i,
      /applied.*job/i,
      /linkedin.*application/i,
      /linkedin.*apply/i,
      /easy apply/i,
      /talent.*application/i,
      /recruitment.*application/i,
      /hiring.*application/i,
      /(?:job|position|role).*(?:application|apply|applied|candidate|resume|cv)/i,
      /(?:application|apply|applied|candidate|resume|cv).*(?:job|position|role)/i
    ];
    
    this.excludePatterns = [
      /linkedin.*premium.*upgrade/i,
      /linkedin.*subscription/i,
      /linkedin.*billing/i,
      /linkedin.*payment/i,
      /unsubscribe.*marketing/i,
      /promotional.*offer/i,
      /advertisement.*sponsored/i,
      /newsletter.*weekly/i,
      /(?:upgrade|subscribe|premium).*(?:now|today|offer)/i,
      /(?:billing|payment).*(?:failed|due|overdue)/i
    ];
  }

  isLinkedInApplication(message) {
    const subject = message.subject.toLowerCase();
    const body = message.body.toLowerCase();
    const htmlBody = (message.htmlBody || '').toLowerCase();
    const from = message.from.toLowerCase();
    
    const combinedText = `${subject} ${body} ${htmlBody} ${from}`;
    
    const isFromLinkedInJobs = /jobs-listings@linkedin\.com|jobs-noreply@linkedin\.com|noreply@linkedin\.com/i.test(from);
    
    if (isFromLinkedInJobs) {
      logger.debug(`✅ LinkedIn job domain detected: ${from}`);
      return true;
    }
    
    const hasApplicationSubject = /(?:new application|job application|your job has a new applicant|application.*from|applicant|candidate.*applied)/i.test(subject);
    
    if (hasApplicationSubject) {
      logger.debug(`✅ Application subject detected: ${subject}`);
      return true;
    }
    
    const isExcluded = this.excludePatterns.some(pattern => 
      pattern.test(combinedText)
    );
    
    if (isExcluded) {
      logger.debug(`❌ Excluded email (promotional): ${message.subject}`);
      return false;
    }
    
    const isLinkedIn = this.linkedInPatterns.some(pattern => 
      pattern.test(combinedText)
    );
    
    const hasJobKeywords = /(?:job|position|role|career|opportunity)/i.test(combinedText);
    const hasApplicationKeywords = /(?:application|apply|applied|candidate|resume|cv|applicant)/i.test(combinedText);
    const hasAttachments = message.attachments && message.attachments.length > 0;
    
    const isJobApplication = isLinkedIn || 
      (hasJobKeywords && hasApplicationKeywords) ||
      /(?:application.*for|applied.*to|thank you for applying|application received)/i.test(subject) ||
      (hasAttachments && hasJobKeywords);
    
    if (isJobApplication) {
      logger.debug(`✅ Job application detected: ${message.subject}`);
    } else {
      logger.debug(`❌ Not a job application: ${message.subject}`);
    }
    
    return isJobApplication;
  }

  parseLinkedInApplication(message) {
    logger.info(`📋 Parsing LinkedIn application: ${message.subject}`);
    
    const subject = message.subject;
    const emailBody = message.body;
    const htmlBody = message.htmlBody || '';
    
    logger.debug('📧 Email From:', message.from);
    logger.debug('📧 Email Subject:', subject);
    logger.debug('📧 Email Body (first 500 chars):', emailBody.substring(0, 500));
    
    const result = {
      name: null,
      title: null,
      location: null,
      expected_compensation: null,
      project_id: null,
      screening_questions: null
    };
    
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
      // 🚀 PRIORITY 1: From subject line - "New application: [Title] from [Name]"
      /new application:\s*[^:]+?from\s+([A-Z](?:\.\s*)?[A-Za-z]+(?:\s+[A-Z](?:\.\s*)?[A-Za-z]+)*)/i,
      /job application.*?from\s+([A-Z](?:\.\s*)?[A-Za-z]+(?:\s+[A-Z](?:\.\s*)?[A-Za-z]+)*)/i,
      /application.*?from\s+([A-Z](?:\.\s*)?[A-Za-z]+(?:\s+[A-Z](?:\.\s*)?[A-Za-z]+)*)/i,
      
      // 🚀 PRIORITY 2: LinkedIn email body format - "Name ConnectionLevel"
      /^([A-Z](?:\.\s*)?[A-Za-z]+(?:\s+[A-Z](?:\.\s*)?[A-Za-z]+)*)\s+(?:1st|2nd|3rd|\+)$/m,
      /\n([A-Z](?:\.\s*)?[A-Za-z]+(?:\s+[A-Z](?:\.\s*)?[A-Za-z]+)*)\s+(?:1st|2nd|3rd|\+)\n/,
      /([A-Z](?:\.\s*)?[A-Za-z]+(?:\s+[A-Z](?:\.\s*)?[A-Za-z]+)*)\s+(?:1st|2nd|3rd|\+)\s*$/m,
      
      // 🚀 PRIORITY 3: Name followed by job description
      /^([A-Z](?:\.\s*)?[A-Za-z]+(?:\s+[A-Z](?:\.\s*)?[A-Za-z]+)*)\s*\n.*(?:Strategic|Marketing|Development|Engineering|Management|Analysis|Design|Consulting)/im,
      
      // 🚀 PRIORITY 4: Clean standalone name (enhanced for initials)
      /^([A-Z](?:\.\s*)?[A-Za-z]+(?:\s+[A-Z](?:\.\s*)?[A-Za-z]+)*)\s*$/m,
      /\n([A-Z](?:\.\s*)?[A-Za-z]+(?:\s+[A-Z](?:\.\s*)?[A-Za-z]+)*)\n/,
      
      // 🚀 PRIORITY 5: HTML patterns
      /<(?:strong|b|h1|h2|h3)[^>]*>([A-Z](?:\.\s*)?[A-Za-z]+(?:\s+[A-Z](?:\.\s*)?[A-Za-z]+)*)<\/(?:strong|b|h1|h2|h3)>/i,
      
      // 🚀 NEW: Specific pattern for initials + names
      /\b([A-Z]\.\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/,
      
      // 🚀 NEW: Flexible name pattern for various formats
      /\b([A-Z](?:\.|[a-z]+)(?:\s+[A-Z](?:\.|[a-z]+))*(?:\s+[A-Z][a-z]+)+)\b/
    ];

    for (const pattern of namePatterns) {
      const sources = [subject, emailBody, htmlBody];
      for (const source of sources) {
        const match = source.match(pattern);
        if (match && match[1]) {
          const name = match[1].trim();
          if (this.isValidName(name)) {
            logger.debug(`📝 Name extracted: ${name}`);
            return name;
          }
        }
      }
    }
    
    return null;
  }

  extractJobTitle(subject, emailBody, htmlBody) {
    const titlePatterns = [
      // 🚀 PRIORITY 1: From subject line - "New application: [Title] from [Name]"
      /new application:\s*([^:]+?)\s+from\s+/i,
      /job application[:\s]*([^-–]+?)\s+from\s+/i,
      /application[:\s]*([^-–]+?)\s+from\s+/i,
      
      // 🚀 PRIORITY 2: After "Your job has a new applicant" in email body
      // "Head of Content at Transformative Ventures · Gurugram, Haryana, India"
      /your job has a new applicant\s*\n.*?\n([^·\n]+?)\s+at\s+[^·\n]+?(?:·|$)/i,
      
      // 🚀 PRIORITY 3: From subject after company location info
      // "Head of Content at Company · Location"
      /([A-Za-z\s]+?)\s+at\s+[^·\n]+?·/i,
      
      // 🚀 PRIORITY 4: Clean job title patterns
      /(?:Senior|Junior|Lead|Principal|Staff|Head of|Director of|VP of|Chief)\s+([A-Za-z\s]+?)(?:\s+(?:at|with|for|in|\n|\||•|·))/i,
      /(Full Stack|Backend|Frontend|Data|Software|Web|Mobile|Application|System|Network|Database|DevOps|QA|Product|Project|Technical|Business|Content|Marketing|Sales|Operations|Finance|HR|Legal)\s+(?:Developer|Engineer|Manager|Analyst|Director|Head|Lead|Specialist|Coordinator|Executive)(?:\s+(?:at|with|for|in|\n|\||•|·))/i,
      /(Python|Java|JavaScript|React|Angular|Node|PHP|Ruby|C\+\+|C#|Go|Kotlin|Swift)\s+(?:Developer|Engineer|Programmer)(?:\s+(?:at|with|for|in|\n|\||•|·))/i,
      
      // 🚀 PRIORITY 5: Title context patterns
      /(?:position|job|role|title)[:\s]*([A-Za-z\s]+?)(?:\s+(?:at|with|for|in|\n|\||•|·))/i,
      
      // 🚀 PRIORITY 6: HTML patterns
      /<(?:h1|h2|h3|strong|b)[^>]*>([^<]+?)(?:\s+(?:at|position|role|job))<\/(?:h1|h2|h3|strong|b)>/i,
    ];

    for (const pattern of titlePatterns) {
      const sources = [subject, emailBody, htmlBody];
      for (const source of sources) {
        const match = source.match(pattern);
        if (match && match[1]) {
          let title = match[1].trim();
          
          // Clean the title
          title = this.cleanJobTitle(title);
          
          if (this.isValidJobTitle(title)) {
            logger.debug(`💼 Title extracted: ${title}`);
            return title;
          }
        }
      }
    }
    
    return null;
  }

  extractLocation(emailBody, htmlBody) {
    const cleanBody = this.cleanTextForParsing(emailBody);
    const cleanHtml = this.cleanTextForParsing(htmlBody);
    
    const locationPatterns = [
      // 🚀 PRIORITY 1: EXACT LinkedIn format - location line after candidate info
      // Pattern: "Bengaluru, Karnataka, India" (standalone line after candidate description)
      /(?:Strategic Marketing|Marketing Transformation|Product Marketing|Excellence|Go-To-Market|Development|Engineering|Management|Analysis|Design|Consulting|Sales|Operations|Finance|HR|Legal|Technical|Business|Content)[^.\n]*\n\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*$/m,
      
      // 🚀 PRIORITY 2: Location after bullet or separator in email body
      // "Head of Content at Company · Gurugram, Haryana, India"
      /[·•]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*$/m,
      
      // 🚀 PRIORITY 3: Three-part location format (City, State, Country)
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*(?:India|Indonesia|Singapore|Malaysia|Thailand|Philippines|Vietnam|Australia|Japan|South Korea|China|Hong Kong|Taiwan|United States|USA|Canada|United Kingdom|UK|Germany|France|Italy|Spain|Netherlands|Belgium|Sweden|Norway|Denmark|Finland|Switzerland|Austria|Poland|Czech Republic|Hungary|Romania|Bulgaria|Greece|Turkey|Russia|Ukraine|Brazil|Argentina|Chile|Colombia|Peru|Mexico|South Africa|Egypt|Nigeria|Kenya|Morocco|Algeria|Tunisia))\b/,
      
      // 🚀 PRIORITY 4: Two-part location format (City, Country)  
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*(?:Afghanistan|Albania|Algeria|Argentina|Armenia|Australia|Austria|Azerbaijan|Bahrain|Bangladesh|Belarus|Belgium|Bolivia|Bosnia|Brazil|Bulgaria|Cambodia|Canada|Chile|China|Colombia|Croatia|Cuba|Cyprus|Czech Republic|Denmark|Ecuador|Egypt|Estonia|Ethiopia|Finland|France|Georgia|Germany|Ghana|Greece|Hungary|Iceland|India|Indonesia|Iran|Iraq|Ireland|Israel|Italy|Japan|Jordan|Kazakhstan|Kenya|Kuwait|Latvia|Lebanon|Lithuania|Luxembourg|Malaysia|Mexico|Morocco|Netherlands|New Zealand|Nigeria|Norway|Pakistan|Peru|Philippines|Poland|Portugal|Qatar|Romania|Russia|Saudi Arabia|Singapore|Slovakia|Slovenia|South Africa|South Korea|Spain|Sri Lanka|Sweden|Switzerland|Syria|Taiwan|Thailand|Turkey|Ukraine|United Arab Emirates|United Kingdom|United States|Uruguay|Venezuela|Vietnam|Yemen|Zimbabwe))\b/i,
      
      // 🚀 PRIORITY 5: Indian cities with state (very specific)
      /\b((?:Mumbai|Delhi|Bangalore|Bengaluru|Hyderabad|Chennai|Kolkata|Pune|Ahmedabad|Jaipur|Surat|Kanpur|Lucknow|Nagpur|Patna|Indore|Thane|Bhopal|Visakhapatnam|Vadodara|Ghaziabad|Ludhiana|Agra|Nashik|Faridabad|Meerut|Rajkot|Kalyan|Dombivli|Vasai|Virar|Varanasi|Srinagar|Aurangabad|Dhanbad|Amritsar|Navi Mumbai|Allahabad|Ranchi|Howrah|Coimbatore|Jabalpur|Gwalior|Vijayawada|Jodhpur|Madurai|Raipur|Kota|Guwahati|Chandigarh|Solapur|Hubballi|Dharwad|Tiruchirappalli|Bareilly|Mysore|Tiruppur|Gurgaon|Gurugram|Noida|Greater Noida),?\s*(?:Maharashtra|Delhi|Karnataka|Telangana|Tamil Nadu|West Bengal|Gujarat|Rajasthan|Uttar Pradesh|Madhya Pradesh|Bihar|Andhra Pradesh|Haryana|Punjab|Assam|Odisha|Kerala|Jharkhand|Uttarakhand|Himachal Pradesh|Tripura|Meghalaya|Manipur|Nagaland|Goa|Arunachal Pradesh|Mizoram|Sikkim|Jammu and Kashmir|Ladakh|Chandigarh)(?:,?\s*India)?)\b/i,
      
      // 🚀 PRIORITY 6: Location with clear context labels
      /(?:location|based in|from|lives in|city)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)*?)(?:\s*[|\n•·]|$)/i,
      
      // 🚀 PRIORITY 7: Clean line format (location on its own line) - more restrictive
      /^\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*$/m,
    ];

    const sources = [cleanBody, cleanHtml, emailBody, htmlBody];
    
    for (const source of sources) {
      for (let i = 0; i < locationPatterns.length; i++) {
        const pattern = locationPatterns[i];
        const match = source.match(pattern);
        if (match && match[1]) {
          let location = match[1].trim();
          
          // Clean the extracted location
          location = this.cleanLocation(location);
          
          // Validate the location
          if (this.isValidLocation(location)) {
            logger.debug(`📍 Location extracted from pattern ${i + 1}: ${location}`);
            return location;
          }
        }
      }
    }
    
    return null;
  }

  // 🚀 NEW: Clean job title method
  cleanJobTitle(title) {
    if (!title) return '';
    
    return title
      // Remove leading/trailing separators and whitespace
      .replace(/^[|\s\-•·,]+/, '')
      .replace(/[|\s\-•·,]+$/, '')
      
      // Remove noise words
      .replace(/\b(?:currently|presently|working|position|role|job|title|at|with|for|in|company|organization|firm|corp|inc|ltd|llc|pvt|private|limited)\b/gi, '')
      
      // Remove special characters except spaces and common title separators
      .replace(/[^\w\s&/-]/g, ' ')
      
      // Normalize spaces
      .replace(/\s+/g, ' ')
      .trim();
  }

  // 🚀 ENHANCED: Much better location cleaning - prevents headline contamination
  cleanLocation(location) {
    if (!location) return '';
    
    let cleaned = location
      // Remove leading/trailing separators and whitespace
      .replace(/^[|\s\-•·,]+/, '')
      .replace(/[|\s\-•·,]+$/, '')
      
      // 🚀 CRITICAL: Remove job-related terms that contaminate location
      .replace(/\b(?:strategic|marketing|transformation|product|excellence|go-to-market|development|engineering|programming|software|technical|business|management|analysis|design|consulting|sales|operations|finance|hr|human resources|legal|content|digital|social media|advertising|branding|communications|public relations|customer success|account management|project management|program management|quality assurance|data science|machine learning|artificial intelligence|cloud computing|cybersecurity|information technology|network administration|database administration|web development|mobile development|full stack|backend|frontend|devops|ui ux|user experience|user interface|graphic design|interior design|fashion design|industrial design|architecture|construction|real estate|logistics|supply chain|procurement|vendor management|contract negotiation|business development|partnership|alliance|corporate strategy|mergers acquisitions|investment banking|private equity|venture capital|asset management|portfolio management|risk management|compliance|audit|taxation|accounting|bookkeeping|payroll|benefits administration|recruitment|talent acquisition|learning development|organizational development|change management|leadership|executive|director|manager|supervisor|coordinator|specialist|analyst|associate|assistant|intern|trainee|consultant|freelancer|contractor|vendor|supplier|client|customer|partner|stakeholder|shareholder|investor|founder|entrepreneur|startup|enterprise|corporation|company|organization|institution|agency|government|nonprofit|ngo|foundation|university|college|school|hospital|clinic|pharmacy|laboratory|research|development|innovation|technology|science|mathematics|statistics|economics|finance|accounting|marketing|sales|operations|human resources|information technology|engineering|design|architecture|construction|manufacturing|production|quality|safety|environment|sustainability|energy|utilities|transportation|logistics|telecommunications|media|entertainment|gaming|sports|fitness|health|wellness|beauty|fashion|food|beverage|hospitality|tourism|travel|retail|wholesale|distribution|import|export|trade|commerce|banking|insurance|real estate|legal|law|justice|security|defense|military|police|fire|emergency|medical|healthcare|pharmaceutical|biotechnology|chemicals|materials|textiles|automotive|aerospace|marine|agriculture|forestry|mining|oil|gas|renewable|solar|wind|nuclear|water|waste|recycling|construction|infrastructure|urban planning|architecture|interior design|landscape|graphic design|web design|app development|game development|animation|video production|photography|journalism|writing|editing|translation|interpretation|education|training|coaching|mentoring|counseling|therapy|psychology|social work|community service|volunteering|charity|fundraising|event planning|project coordination|administration|secretarial|clerical|data entry|customer service|call center|help desk|technical support|maintenance|repair|installation|delivery|shipping|warehouse|inventory|procurement|purchasing|sourcing|negotiation|contract|legal|compliance|audit|risk|security|safety|quality|testing|inspection|certification|standards|regulations|policies|procedures|documentation|reporting|analysis|research|investigation|surveillance|monitoring|evaluation|assessment|measurement|metrics|kpi|roi|budget|forecast|planning|strategy|vision|mission|values|culture|ethics|governance|leadership|management|supervision|coordination|collaboration|teamwork|communication|presentation|negotiation|persuasion|influence|relationship|networking|partnership|alliance|merger|acquisition|divestiture|restructuring|transformation|change|innovation|creativity|problem solving|decision making|critical thinking|analytical|logical|mathematical|statistical|technical|scientific|research|development|design|engineering|architecture|construction|manufacturing|production|assembly|testing|quality|maintenance|repair|troubleshooting|debugging|optimization|improvement|enhancement|upgrade|migration|implementation|deployment|rollout|launch|release|delivery|support|service|customer|client|user|end user|stakeholder|vendor|supplier|partner|contractor|consultant|freelancer|temporary|permanent|full time|part time|contract|remote|hybrid|onsite|office|home|travel|international|domestic|local|regional|national|global|worldwide|enterprise|corporate|startup|small business|medium business|large business|public|private|government|nonprofit|education|healthcare|technology|finance|retail|manufacturing|service|consulting|agency|firm|company|organization|institution|association|foundation|trust|cooperative|partnership|sole proprietorship|llc|corporation|inc|ltd|co|llp|pllc|pa|pc)\b/gi, '')
      
      // Remove programming languages and technical terms
      .replace(/\b(?:Python|Java|JavaScript|React|Angular|Node|PHP|Ruby|C\+\+|C#|Go|Kotlin|Swift|HTML|CSS|SQL|MongoDB|MySQL|PostgreSQL|Redis|Docker|Kubernetes|AWS|Azure|GCP|Git|Jenkins|Linux|Windows|MacOS|Android|iOS|Django|Flask|Spring|Laravel|Express|Vue|Bootstrap|jQuery|TypeScript|Scala|Rust|Perl|R|MATLAB|Tableau|PowerBI|Salesforce|SAP|Oracle|Microsoft|Google|Apple|Meta|Facebook|Amazon|Netflix|Uber|Airbnb|Spotify|Tesla|Twitter|LinkedIn|Instagram|WhatsApp|TikTok|Snapchat|Pinterest|Reddit|YouTube|GitHub|Stack Overflow|Medium|Dev\.to)\b/gi, '')
      
      // Remove email/phone/website patterns
      .replace(/[\w\.-]+@[\w\.-]+\.\w+/g, '')
      .replace(/(?:\+\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g, '')
      .replace(/https?:\/\/[^\s]+/g, '')
      .replace(/www\.[^\s]+/g, '')
      
      // Remove special characters except commas, spaces, and hyphens
      .replace(/[^\w\s,.-]/g, ' ')
      
      // Normalize spaces and commas
      .replace(/\s+/g, ' ')
      .replace(/,\s*,/g, ',')
      .replace(/\s*,\s*/g, ', ')
      .replace(/\s+,/g, ',')
      .replace(/,\s*$/, '')
      .replace(/^\s*,/, '')
      
      // Remove standalone numbers and single characters
      .replace(/\b\d+\b/g, '')
      .replace(/\b[a-zA-Z]\b/g, '')
      
      // Final cleanup
      .replace(/\s+/g, ' ')
      .trim();

    // 🚀 CRITICAL: Additional validation - location should not contain job/skill terms
    const jobTermPattern = /\b(?:strategic|marketing|transformation|product|excellence|go-to-market|development|engineering|management|analysis|design|consulting|sales|operations|finance|hr|legal|content|technical|business|software|programming|coding|developer|engineer|manager|analyst|consultant|designer|specialist|coordinator|executive|director|lead|senior|junior|associate|intern|trainee|python|java|javascript|react|angular|node|php|ruby|html|css|sql|mongodb|mysql|postgresql|redis|docker|kubernetes|aws|azure|gcp|git|jenkins|linux|windows|macos|android|ios|django|flask|spring|laravel|express|vue|bootstrap|jquery|typescript|scala|rust|perl|matlab|tableau|powerbi|salesforce|sap|oracle|microsoft|google|apple|meta|facebook|amazon|netflix|uber|airbnb|spotify|tesla|twitter|linkedin|instagram|whatsapp|tiktok|snapchat|pinterest|reddit|youtube|github)\b/i;
    
    if (jobTermPattern.test(cleaned)) {
      logger.debug(`🚫 Rejected location due to job terms: ${cleaned}`);
      return '';
    }

    return cleaned;
  }

  // 🚀 ENHANCED: Better location validation to prevent job title contamination
  isValidLocation(location) {
    if (!location || location.length < 2 || location.length > 150) return false;
    
    // 🚀 CRITICAL: Exclude job/skill-related terms
    const invalidPatterns = [
      /^(strategic|marketing|transformation|product|excellence|go-to-market|development|engineering|management|analysis|design|consulting|sales|operations|finance|hr|human|resources|legal|content|technical|business|software|programming|coding|developer|engineer|manager|analyst|consultant|designer|specialist|coordinator|executive|director|lead|senior|junior|associate|intern|trainee|experience|current|past|skills|qualifications|screening|questions|answers|yes|no|true|false|python|java|javascript|react|angular|node|php|ruby|html|css|sql|mongodb|mysql|postgresql|redis|docker|kubernetes|aws|azure|gcp|git|jenkins|linux|windows|macos|android|ios|django|flask|spring|laravel|express|vue|bootstrap|jquery|typescript|scala|rust|perl|matlab|tableau|powerbi|salesforce|sap|oracle|microsoft|google|apple|meta|facebook|amazon|netflix|uber|airbnb|spotify|tesla|twitter|linkedin|instagram|whatsapp|tiktok|snapchat|pinterest|reddit|youtube|github|stack|overflow|medium|dev|to)$/i,
      /^\d+$/,
      /^[0-9\s,.-]+$/,
      /^(new|application|from|job|at|with|for|in|the|and|or|but|your|has|this|that|these|those|view|all|click|here|link|email|message|html|body|subject|candidate|applicant|resume|cv|portfolio|profile|about|contact|phone|mobile|telephone|website)$/i,
      /^(work|working|worked|experience|experienced|years?|months?|days?|time|period|duration|technologies?|tools?|frameworks?|libraries?|languages?|problem|solving|critical|thinking|leadership|team|collaboration|communication)$/i,
      // 🚀 NEW: Patterns that indicate job description contamination
      /\|/,  // Contains pipe character (job description separator)
      /excellence/i,
      /strategic.*marketing/i,
      /marketing.*transformation/i,
      /go.*to.*market/i,
      /product.*marketing/i
    ];
    
    // Check for invalid patterns
    const isInvalid = invalidPatterns.some(pattern => pattern.test(location.trim()));
   if (isInvalid) {
     logger.debug(`🚫 Invalid location pattern: ${location}`);
     return false;
   }
   
   // Must contain alphabetic characters
   if (!/[a-zA-Z]/.test(location)) return false;
   
   // 🚀 Enhanced: Global location validation with stricter rules
   const locationKeywords = [
     // Countries (most reliable)
     /\b(?:afghanistan|albania|algeria|argentina|armenia|australia|austria|azerbaijan|bahrain|bangladesh|belarus|belgium|bolivia|bosnia|brazil|bulgaria|cambodia|canada|chile|china|colombia|croatia|cuba|cyprus|czech|denmark|ecuador|egypt|estonia|ethiopia|finland|france|georgia|germany|ghana|greece|hungary|iceland|india|indonesia|iran|iraq|ireland|israel|italy|japan|jordan|kazakhstan|kenya|kuwait|latvia|lebanon|lithuania|luxembourg|malaysia|mexico|morocco|netherlands|new zealand|nigeria|norway|pakistan|peru|philippines|poland|portugal|qatar|romania|russia|saudi arabia|singapore|slovakia|slovenia|south africa|south korea|spain|sri lanka|sweden|switzerland|syria|taiwan|thailand|turkey|ukraine|united arab emirates|united kingdom|united states|uruguay|venezuela|vietnam|yemen|zimbabwe)\b/i,
     
     // US States
     /\b(?:alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\b/i,
     
     // Indian States (very specific)
     /\b(?:andhra pradesh|arunachal pradesh|assam|bihar|chhattisgarh|goa|gujarat|haryana|himachal pradesh|jharkhand|karnataka|kerala|madhya pradesh|maharashtra|manipur|meghalaya|mizoram|nagaland|odisha|punjab|rajasthan|sikkim|tamil nadu|telangana|tripura|uttar pradesh|uttarakhand|west bengal|delhi|chandigarh|dadra|daman|lakshadweep|puducherry|jammu|kashmir|ladakh)\b/i,
     
     // Format indicators (comma format is most reliable)
     /,/,  // Has comma (city, state/country format)
    
     // Major global cities (very specific)
     /\b(?:mumbai|delhi|bangalore|bengaluru|hyderabad|chennai|kolkata|pune|ahmedabad|jaipur|surat|kanpur|lucknow|nagpur|patna|indore|thane|bhopal|visakhapatnam|vadodara|ghaziabad|ludhiana|agra|nashik|faridabad|meerut|rajkot|gurgaon|gurugram|noida|greater noida|new york|los angeles|chicago|houston|phoenix|philadelphia|san antonio|san diego|dallas|san jose|austin|jacksonville|fort worth|columbus|charlotte|san francisco|indianapolis|seattle|denver|washington|boston|el paso|nashville|detroit|oklahoma city|portland|las vegas|memphis|louisville|baltimore|milwaukee|albuquerque|tucson|fresno|mesa|sacramento|atlanta|kansas city|colorado springs|miami|raleigh|omaha|long beach|virginia beach|oakland|minneapolis|tulsa|arlington|tampa|new orleans|wichita|cleveland|bakersfield|aurora|anaheim|honolulu|santa ana|riverside|corpus christi|lexington|stockton|henderson|saint paul|st louis|cincinnati|pittsburgh|greensboro|anchorage|plano|lincoln|orlando|irvine|newark|durham|chula vista|toledo|fort wayne|st petersburg|laredo|jersey city|chandler|madison|lubbock|scottsdale|reno|buffalo|gilbert|glendale|north las vegas|winston salem|chesapeake|norfolk|fremont|garland|irving|hialeah|richmond|boise|spokane|baton rouge|toronto|vancouver|montreal|calgary|edmonton|ottawa|winnipeg|quebec city|hamilton|kitchener|london|halifax|st catharines|windsor|oshawa|victoria|saskatoon|regina|sherbrooke|kelowna|barrie|guelph|kanata|abbotsford|trois rivieres|kingston|milton|moncton|white rock|nanaimo|brantford|chicoutimi|saint jean sur richelieu|thunder bay|chatham|sydney|berlin|munich|frankfurt|hamburg|cologne|stuttgart|dusseldorf|dortmund|essen|leipzig|bremen|dresden|hanover|nuremberg|duisburg|bochum|wuppertal|bielefeld|bonn|munster|mannheim|augsburg|wiesbaden|gelsenkirchen|aachen|monchengladbach|braunschweig|chemnitz|kiel|halle|magdeburg|freiburg|krefeld|lubeck|oberhausen|erfurt|mainz|rostock|kassel|hagen|paris|marseille|lyon|toulouse|nice|nantes|strasbourg|montpellier|bordeaux|lille|rennes|reims|le havre|saint etienne|toulon|angers|grenoble|dijon|nimes|aix en provence|brest|le mans|amiens|tours|limoges|clermont ferrand|villeurbanne|besancon|orleans|metz|rouen|mulhouse|perpignan|caen|boulogne billancourt|nancy|argenteuil|roubaix|tourcoing|nanterre|avignon|vitry sur seine|creteil|dunkerque|poitiers|asnieres sur seine|courbevoie|versailles|colombes|fort de france|aulnay sous bois|saint pierre|rueil malmaison|pau|aubervilliers|champigny sur marne|antibes|la rochelle|cannes|calais|beziers|colmar|bourges|drancy|merignac|saint nazaire|issy les moulineaux|noisy le grand|levallois perret|quimper|valence|antony|troyes|montrouge|pessac|ivry sur seine|cergy|clichy|lorient|niort|sarcelles|chambery|le cannet|evry|hyeres|neuilly sur seine|villejuif|epinay sur seine|meaux|frejus|bobigny|palaiseau|cholet|saint ouen|istres|creil|sartrouville|grasse|pontault combault|chatillon|clamart|draguignan|rosny sous bois|maisons alfort|gonesse|cagnes sur mer|franconville|savigny sur orge|bagneux|chatou|arras|tokyo|yokohama|osaka|nagoya|sapporo|fukuoka|kobe|kawasaki|kyoto|saitama|hiroshima|sendai|kitakyushu|chiba|sakai|niigata|hamamatsu|kumamoto|sagamihara|shizuoka|okayama|kanazawa|utsunomiya|matsuyama|kurashiki|yokosuka|toyohashi|toyonaka|machida|gifu|fujisawa|fukuyama|toyama|hirakata|kashiwa|nara|kawagoe|ichikawa|iwaki|naha|kagoshima|hachioji|amagasaki|akita|koriyama|takatsuki|kawaguchi|kochi|maebashi|tokorozawa|asahikawa|suita|matsudo|urawa|takasaki|kurume|ichihara|mito|anjo|atsugi|yamato|ageo|takamatsu|chofu|ota|kasugai|akashi|tsu|nobeoka|suzuka|isesaki|kumagaya|nagano|nagaoka|kasukabe|ube|yamagata|shimonoseki|takarazuka|otsu|hitachi|numazu|beijing|shanghai|guangzhou|shenzhen|chongqing|tianjin|chengdu|dongguan|nanjing|wuhan|xian|hangzhou|foshan|shenyang|qingdao|jinan|harbin|zhengzhou|kunming|dalian|taiyuan|hefei|urumqi|fuzhou|shijiazhuang|zhongshan|wenzhou|nanning|changchun|lanzhou|changsha|zibo|xuzhou|wuxi|suzhou|yantai|changzhou|shaoxing|ningbo|huaian|handan|zhenjiang|yangzhou|taizhou|luoyang|weifang|weihai|anshan|liuzhou|baotou|datong|jining|linyi|tangshan|yancheng|huzhou|xinxiang|jingzhou|zhaoqing|putian|jinhua|nantong|changshu|zhuhai|jiaxing|quanzhou|taian|dezhou|binzhou|cangzhou|dongying|rizhao|liaocheng|laiwu|lishui|huangshan|anqing|bengbu|bozhou|chizhou|chuzhou|fuyang|huaibei|huainan|luan|maanshan|tongling|wuhu|xuancheng|sydney|melbourne|brisbane|perth|adelaide|gold coast|canberra|newcastle|central coast|wollongong|logan city|geelong|hobart|townsville|cairns|darwin|launceston|bendigo|ballarat|mandurah|mackay|rockhampton|bunbury|bundaberg|coffs harbour|wagga wagga|hervey bay|mildura|shepparton|gladstone|tamworth|traralgon|orange|dubbo|geraldton|bathurst|kalgoorlie|warrnambool|albany|kempsey|devonport|mount gambier|lismore|nelson bay|warwick|kingaroy|whyalla|murray bridge|broken hill|port augusta|ceduna|coober pedy|seoul|busan|incheon|daegu|daejeon|gwangju|suwon|ulsan|changwon|goyang|yongin|bucheon|ansan|cheongju|jeonju|anyang|cheonan|pohang|uijeongbu|siheung|paju|gimhae|jeju|yangsan|gumi|asan|pyeongtaek|gunsan|gwangyang|mokpo|wonju|gangneung|chuncheon|sokcho|samcheok|donghae|taebaek|jeongeup|namwon|gimje|boryeong|seosan|nonsan|gongju|buyeo|geumsan|yeongi|hongseong|yesan|dangjin|taean|cheorwon|hwacheon|yanggu|inje|goseong|yeongwol|pyeongchang|jeongseon|uljin|yeongdeok|cheongsong|yeongyang|bonghwa|uiseong|gunwi|chilgok|seongju|gimcheon|goryeong|hapcheon|changnyeong|miryang|haman|changwon|gimhae|yangsan|ulsan|pohang|gyeongju|yeongcheon|andong|sangju|mungyeong|yecheon|cheongsong|yeongyang|bonghwa|ulleung|bangkok|chiang mai|phuket|pattaya|krabi|hua hin|koh samui|ayutthaya|sukhothai|chiang rai|udon thani|nakhon ratchasima|khon kaen|manila|cebu|davao|baguio|boracay|palawan|bohol|iloilo|cagayan de oro|zamboanga|kuala lumpur|george town|johor bahru|ipoh|shah alam|petaling jaya|klang|subang jaya|kota kinabalu|kuching|malacca|alor setar|seremban|kajang|ampang|putrajaya|cyberjaya|ho chi minh city|hanoi|da nang|hoi an|hue|nha trang|can tho|dalat|vung tau|halong|sapa|phnom penh|siem reap|battambang|sihanoukville|kampot|kep|yangon|mandalay|bagan|inle lake|naypyidaw|mawlamyine|taunggyi|pathein|monywa|meiktila|vientiane|luang prabang|pakse|savannakhet|thakhek|phonsavan|muang sing|bandar seri begawan|kuala belait|seria|tutong)\b/i
  ];
  
  const hasValidLocationWords = locationKeywords.some(pattern => pattern.test(location));
  const hasCommaFormat = location.includes(',') && location.split(',').length >= 2;
  const hasAlphaChars = /[a-zA-Z]/.test(location);
  
  // Must have either valid location keywords OR comma format (city, state/country)
  const isValidLocation = hasAlphaChars && (hasValidLocationWords || hasCommaFormat);
  
  if (!isValidLocation) {
    logger.debug(`🚫 Location validation failed: ${location}`);
  }
  
  return isValidLocation;
}

extractCompensation(emailBody, htmlBody) {
  const cleanBody = this.cleanTextForParsing(emailBody);
  const cleanHtml = this.cleanTextForParsing(htmlBody);
  
  const compensationPatterns = [
    /(?:current|annual|yearly|present)\s+(?:CTC|compensation|salary|package)[?\s:]*(?:INR|Rs\.?|₹|is)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:LPA|lakh|lakhs|lac|lacs|crore|crores|per\s+annum|PA)?/i,
    /what\s+is\s+your\s+current\s+(?:annual\s+)?CTC[?\s:]*(?:INR|Rs\.?|₹)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:LPA|lakh|lakhs|lac|lacs|crore|crores)?/i,
    /CTC[?\s:]*(?:INR|Rs\.?|₹)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:LPA|lakh|lakhs|lac|lacs|per\s+annum|PA)/i,
    /expected\s+(?:salary|compensation|CTC|package)[?\s:]*(?:INR|Rs\.?|₹)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:LPA|lakh|lakhs|lac|lacs|crore|crores|per\s+annum)?/i,
    /(?:screening|question).*?(?:CTC|salary|compensation)[?\s:]*(?:INR|Rs\.?|₹)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:LPA|lakh|lakhs|lac|lacs|crore|crores)?/is,
    /salary\s+expectation[?\s:]*(?:INR|Rs\.?|₹)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:LPA|lakh|lakhs|lac|lacs|crore|crores)?/i,
    /(?:INR|Rs\.?|₹)\s*([0-9]+(?:[,\s][0-9]+)*(?:\.[0-9]+)?)\s*(?:LPA|lakh|lakhs|lac|lacs|per\s+annum|PA)/i,
    /([0-9]+(?:\.[0-9]+)?)\s*(?:LPA|lakh|lakhs|lac|lacs)/i
  ];

  const sources = [cleanBody, cleanHtml, emailBody, htmlBody];
  
  for (const source of sources) {
    for (const pattern of compensationPatterns) {
      const match = source.match(pattern);
      if (match && match[1]) {
        const compensation = this.cleanCompensation(match[1]);
        if (compensation && parseFloat(compensation) > 0) {
          logger.debug(`💰 Compensation extracted: ${compensation}`);
          return compensation;
        }
      }
    }
  }
  
  return null;
}

extractScreeningQuestions(emailBody, htmlBody) {
  const cleanBody = this.cleanTextForParsing(emailBody);
  const cleanHtml = this.cleanTextForParsing(htmlBody);
  
  const screeningPatterns = [
    /((?:\d+\s+out\s+of\s+\d+\s+(?:preferred\s+)?qualifications?\s+met).*?)(?=(?:current experience|past experience|skills|education|view all|show less|view applicant|regards|best|thank)|$)/is,
    /screening\s+(?:qualifications?|questions?)[:\s\n]+(.*?)(?=(?:skills|experience|education|additional|contact|view\s+all|show\s+less|regards|best|thank)|$)/is,
    /(preferred\s+qualifications?.*?met.*?)(?=(?:skills|experience|education|additional|contact|view\s+all|show\s+less|regards|best|thank)|$)/is,
    /(qualifications?\s+met[:\s\n]+.*?)(?=(?:skills|experience|education|view\s+all|show\s+less|regards|best|thank)|$)/is,
    /(How many years of work experience do you have with.*?)(?=(?:current experience|past experience|skills|education|view all|show less|view applicant)|$)/is,
    /((?:what\s+is|how\s+many|do\s+you|are\s+you|can\s+you).*?(?:CTC|experience|years?|willing|available|python|programming|java|javascript|react|angular|node|php|ruby|html|css|sql|database|framework|library|technology|skill|qualification|certification|degree|education|training|course|bootcamp|university|college|school).*?)(?=(?:skills|experience|education|contact|view\s+profile|regards|best|thank)|$)/gis,
    /(.*?(?:CTC|compensation|salary|experience|years?).*?)(?=(?:skills|education|contact|view\s+profile|regards|best|thank)|$)/is,
    /(screening.*?)(?=(?:skills|education|contact|view\s+profile|additional|regards|best|thank)|$)/is
  ];

  const sources = [cleanBody, cleanHtml, emailBody, htmlBody];
  
  for (const source of sources) {
    for (const pattern of screeningPatterns) {
      const match = source.match(pattern);
      if (match && match[1]) {
        const questions = this.cleanScreeningQuestions(match[1]);
        if (questions && questions.length > 15) {
          logger.debug(`❓ Screening questions extracted: ${questions.substring(0, 100)}...`);
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
    /(?:project|jobId|posting|job)[=:](\d{6,})/i,
    /linkedin\.com[^"'\s]*(?:project|posting|job|currentJobId)[=:](\d{6,})/i,
    /(?:tracking|view|redirect|apply)[^"'\s]*(?:project|job)[=:](\d{6,})/i,
    /currentJobId[=:](\d{6,})/i,
    /jobId[=:](\d{6,})/i,
    /job\s+(?:id|reference|number|posting)[:\s#]*(\d{6,})/i,
    /project\s+(?:id|reference|number)[:\s#]*(\d{6,})/i,
    /posting\s+(?:id|reference|number)[:\s#]*(\d{6,})/i,
    /application\s+(?:id|reference|number)[:\s#]*(\d{6,})/i,
    /href=['"'][^'"]*(?:project|job|posting|currentJobId)[=:](\d{6,})/i,
    /href=['"'][^'"]*\/(\d{10,})['"]/i,
    /linkedin\.com\/jobs\/view\/(\d{6,})/i,
    /linkedin\.com\/[^"'\s]*\/(\d{10,})/i
  ];
  
  for (const source of sources) {
    for (const pattern of projectIdPatterns) {
      const match = source.match(pattern);
      if (match && match[1]) {
        const projectId = match[1];
        if (projectId.length >= 6 && projectId.length <= 15) {
          logger.debug(`🆔 Project ID extracted: ${projectId}`);
          return projectId;
        }
      }
    }
  }
  
  return null;
}

// 🚀 NEW: Enhanced email extraction from HTML content
extractEmailFromContent(content) {
  if (!content) return null;
  
  const emailPatterns = [
    // 🚀 CRITICAL: Hyperlink email extraction
    /<a[^>]+href=['"]mailto:([^'"]+)['"][^>]*>([^<]*)<\/a>/gi,
    /<a[^>]+href=['"]mailto:([^'"]+)['"][^>]*>/gi,
    
    // LinkedIn specific patterns
    /email[:\s]*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/gi,
    /contact[:\s]*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/gi,
    
    // Standard email patterns
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    
    // Within parentheses or brackets
    /\(([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\)/g,
    /\[([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\]/g,
    
    // After common words
    /(?:email|contact|reach|write)[:\s]+([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/gi
  ];

  for (const pattern of emailPatterns) {
    let match;
    pattern.lastIndex = 0; // Reset regex state
    
    while ((match = pattern.exec(content)) !== null) {
      const email = match[1] || match[0];
      
      if (this.isValidApplicantEmail(email)) {
        logger.debug(`📧 Email extracted: ${email}`);
        return email.toLowerCase().trim();
      }
    }
  }

  return null;
}

// 🚀 NEW: Validate applicant email (not system emails)
isValidApplicantEmail(email) {
  if (!email || typeof email !== 'string') return false;
  
  const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  
  // Basic validation
  if (!emailRegex.test(email)) return false;
  
  // Exclude system emails
  const excludePatterns = [
    /noreply|no-reply|donotreply/i,
    /linkedin\.com$/i,
    /jobs-listings@/i,
    /jobs-noreply@/i,
    /example\.com|test\.com|dummy/i,
    /notifications?@/i,
    /alerts?@/i,
    /system@/i
  ];
  
  const isSystemEmail = excludePatterns.some(pattern => pattern.test(email));
  return !isSystemEmail;
}

// Helper methods
cleanTextForParsing(text) {
  if (!text) return '';
  
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\r\n/g, '\n')
    .trim();
}

isValidName(name) {
 if (!name || name.length < 2 || name.length > 100) return false;
 
 const invalidPatterns = [
   /^(new|application|from|job|candidate|applicant|developer|engineer|manager|senior|junior|lead|position|role|title|at|with|for|in|strategic|marketing|transformation|product|excellence|go-to-market|development|engineering|management|analysis|design|consulting|sales|operations|finance|hr|legal|content|technical|business|software|programming|coding|wrong|world|south|north|east|west)$/i,
   /^\d+$/,
   /^[^a-zA-Z]*$/,
   /^(your|has|the|and|or|but|if|when|where|what|how|why|this|that|these|those)$/i,
   // 🚀 NEW: Filter out location-like terms that got mixed in
   /^(delhi|mumbai|bangalore|chennai|kolkata|hyderabad|pune|south|north|east|west|india|karnataka|maharashtra|tamil nadu|west bengal|gujarat|rajasthan)$/i
 ];
 
 // Must contain at least one letter
 if (!/[a-zA-Z]/.test(name)) return false;
 
 // 🚀 NEW: Allow names with initials (like "N. Bobo Meitei")
 const hasValidInitial = /^[A-Z]\.\s*[A-Z][a-z]/.test(name);
 const hasValidName = /^[A-Z][a-z]+/.test(name);
 
 if (!hasValidInitial && !hasValidName) return false;
 
 return !invalidPatterns.some(pattern => pattern.test(name.trim()));
}

isValidJobTitle(title) {
  if (!title || title.length < 3 || title.length > 150) return false;
  
  const validJobWords = /(?:head|director|chief|vice president|vp|president|ceo|coo|cfo|cto|cmo|cpo|manager|senior|junior|lead|principal|staff|associate|specialist|coordinator|executive|analyst|consultant|designer|architect|programmer|developer|engineer|scientist|researcher|advisor|strategist|planner|supervisor|administrator|officer|representative|agent|sales|marketing|operations|finance|accounting|human resources|hr|legal|compliance|audit|risk|security|safety|quality|testing|support|service|customer|client|product|project|program|technical|business|data|software|web|mobile|application|system|network|database|cloud|devops|qa|content|digital|social|media|communications|public|relations|brand|creative|design|user|experience|interface|frontend|backend|fullstack|machine|learning|artificial|intelligence|cybersecurity|information|technology|infrastructure|architecture|construction|manufacturing|production|logistics|supply|chain|procurement|vendor|contract|partnership|alliance|transformation|innovation|strategy|planning|research|development|growth|revenue|profit|performance|optimization|improvement|enhancement|leadership|team|collaboration|communication|presentation|negotiation|training|education|learning|coaching|mentoring|counseling|therapy|healthcare|medical|pharmaceutical|biotechnology|chemistry|biology|physics|mathematics|statistics|economics|psychology|sociology|anthropology|history|geography|literature|journalism|writing|editing|translation|interpretation|publishing|media|entertainment|gaming|sports|fitness|wellness|beauty|fashion|food|beverage|hospitality|tourism|travel|transportation|automotive|aerospace|marine|agriculture|forestry|mining|oil|gas|energy|utilities|telecommunications|broadcasting|film|television|music|art|photography|graphic|interior|landscape|industrial|fashion|jewelry|textile|furniture|architecture|urban|planning|environmental|sustainability|renewable|solar|wind|nuclear|water|waste|recycling)(?:\s+(?:head|director|chief|vice president|vp|president|ceo|coo|cfo|cto|cmo|cpo|manager|senior|junior|lead|principal|staff|associate|specialist|coordinator|executive|analyst|consultant|designer|architect|programmer|developer|engineer|scientist|researcher|advisor|strategist|planner|supervisor|administrator|officer|representative|agent))?/i;
  
  const invalidWords = /^(new|application|from|job|at|with|for|in|the|and|or|but|your|has|this|that|candidate|applicant|resume|cv|portfolio|profile|about|contact|skills|experience|education|qualifications|screening|questions|answers|currently|presently|working|position|role|title|company|organization|firm|corp|inc|ltd|llc|pvt|private|limited|strategic|marketing|transformation|excellence|go-to-market)$/i;
  
  return validJobWords.test(title) && !invalidWords.test(title.trim());
}

cleanCompensation(compensation) {
  const cleaned = compensation
    .replace(/[,\s]/g, '')
    .replace(/[^\d.]/g, '');
  
  const num = parseFloat(cleaned);
  return num && num > 0 && num < 1000 ? cleaned : null;
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
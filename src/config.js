export const CONFIG = {
    // Gmail Configuration
    BATCH_SIZE: parseInt(process.env.BATCH_SIZE) || 50,
    MAX_EMAIL_AGE_DAYS: parseInt(process.env.MAX_EMAIL_AGE_DAYS) || 7,
    
    // OCR Configuration
    OCR_LANGUAGE: 'eng',
    OCR_TIMEOUT: 30000, // 30 seconds
    
    // GPT Configuration
    GPT_MODEL: 'gpt-4o-mini',
    GPT_MAX_TOKENS: 150,
    GPT_TEMPERATURE: 0.1,
    GPT_TIMEOUT: 10000, // 10 seconds
    
    // Supabase Configuration
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY: process.env.SUPABASE_KEY,
    TABLE_NAME: 'applicant_details',
    PROCESSED_MESSAGES_TABLE: 'processed_messages',
    
    // Google Services
    GOOGLE_CREDENTIALS: process.env.GOOGLE_CREDENTIALS,
    GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID,
    GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID,
    GMAIL_USER_EMAIL: process.env.GMAIL_USER_EMAIL,
    
    // Application Settings
    DEBUG_MODE: process.env.DEBUG_MODE === 'true',
    ENABLE_OCR: process.env.ENABLE_OCR !== 'false',
    ENABLE_GPT: process.env.ENABLE_GPT !== 'false',
    
    // Sheet Headers
    SHEET_HEADERS: [
      'Name', 'Title', 'Location', 'Expected Compensation',
      'Project ID', 'Screening Questions', 'Resume Raw Text',
      'Resume Drive Link', 'Mobile Number', 'Email',
      'LinkedIn URL', 'Processed At', 'Source Message ID'
    ],
    
    // GPT Prompt
    GPT_PROMPT: `Extract the following information from this resume text and return ONLY a valid JSON object with these exact fields. Do not wrap the response in markdown code blocks or any other formatting.
  
        Return ONLY this JSON structure:
        {
            "mobile_number": "phone number in any format",
            "email": "email address", 
            "linkedin_url": "LinkedIn profile URL"
        }
        
        If any field is not found, use null. Return only the JSON object, no explanatory text, no markdown formatting, no code blocks.
        
        Resume text:`
};
  
  // Validate required environment variables
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_KEY',
    'OPENAI_API_KEY',
    'GOOGLE_CREDENTIALS',
    'GOOGLE_SHEET_ID',
    'GOOGLE_DRIVE_FOLDER_ID',
    'GMAIL_USER_EMAIL'
  ];
  
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }
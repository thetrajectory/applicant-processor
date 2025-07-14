import dotenv from 'dotenv';

// Load environment variables from .env file in development
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// Helper function to decode Google credentials
function getGoogleCredentials() {
  const credentials = process.env.GOOGLE_CREDENTIALS;
  
  if (!credentials) {
    throw new Error('GOOGLE_CREDENTIALS environment variable not set');
  }
  
  try {
    // Try to parse as JSON first
    const parsed = JSON.parse(credentials);
    
    // Verify it has required fields
    if (!parsed.client_email) {
      throw new Error('Google credentials missing client_email field');
    }
    
    console.log('✅ Google credentials parsed successfully');
    console.log(`   Service Account: ${parsed.client_email}`);
    console.log(`   Project ID: ${parsed.project_id}`);
    console.log(`   Client ID: ${parsed.client_id}`);
    
    return parsed;
  } catch (jsonError) {
    try {
      // If JSON parsing fails, try base64 decode
      console.log('⚠️ JSON parsing failed, trying base64 decode...');
      const decoded = Buffer.from(credentials, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded);
      
      if (!parsed.client_email) {
        throw new Error('Decoded Google credentials missing client_email field');
      }
      
      console.log('✅ Google credentials parsed as Base64');
      console.log(`   Service Account: ${parsed.client_email}`);
      
      return parsed;
    } catch (base64Error) {
      console.error('❌ Failed to parse Google credentials as JSON:', jsonError.message);
      console.error('❌ Failed to parse Google credentials as Base64:', base64Error.message);
      console.error('❌ Raw credentials length:', credentials.length);
      console.error('❌ First 100 chars:', credentials.substring(0, 100));
      throw new Error('Invalid GOOGLE_CREDENTIALS format. Must be valid JSON or base64-encoded JSON');
    }
  }
}

export const CONFIG = {
  // Environment detection
  IS_LOCAL: !process.env.GITHUB_ACTIONS,
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  IS_GITHUB_ACTIONS: !!process.env.GITHUB_ACTIONS,
  
  // Gmail Configuration
  BATCH_SIZE: parseInt(process.env.BATCH_SIZE) || (process.env.GITHUB_ACTIONS ? 50 : 5),
  MAX_EMAIL_AGE_DAYS: parseInt(process.env.MAX_EMAIL_AGE_DAYS) || (process.env.GITHUB_ACTIONS ? 7 : 30),
  
  // OCR Configuration
  OCR_LANGUAGE: 'eng',
  OCR_TIMEOUT: 30000,
  
  // GPT Configuration
  GPT_MODEL: 'gpt-4o-mini',
  GPT_MAX_TOKENS: 150,
  GPT_TEMPERATURE: 0.1,
  GPT_TIMEOUT: 15000,
  
  // Supabase Configuration
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_KEY,
  TABLE_NAME: process.env.GITHUB_ACTIONS ? 'applicant_details' : 'applicant_details_test',
  PROCESSED_MESSAGES_TABLE: process.env.GITHUB_ACTIONS ? 'processed_messages' : 'processed_messages_test',
  
  // Google Services - Call the helper function here
  GOOGLE_CREDENTIALS: getGoogleCredentials(),
  GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID,
  GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID,
  GMAIL_USER_EMAIL: process.env.GMAIL_USER_EMAIL,
  
  // Application Settings
  DEBUG_MODE: process.env.DEBUG_MODE === 'true' || !process.env.GITHUB_ACTIONS,
  ENABLE_OCR: process.env.ENABLE_OCR !== 'false',
  ENABLE_GPT: process.env.ENABLE_GPT !== 'false',
  
  // Local testing features
  DRY_RUN: process.env.DRY_RUN === 'true',
  TEST_MODE: process.env.TEST_MODE === 'true',
  
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

// Environment variable validation with better error handling
const requiredEnvVars = [
  { name: 'SUPABASE_URL', description: 'Supabase project URL' },
  { name: 'SUPABASE_KEY', description: 'Supabase service role key' },
  { name: 'OPENAI_API_KEY', description: 'OpenAI API key for GPT' },
  { name: 'GOOGLE_CREDENTIALS', description: 'Google service account JSON credentials' },
  { name: 'GOOGLE_SHEET_ID', description: 'Google Sheets ID for data storage' },
  { name: 'GOOGLE_DRIVE_FOLDER_ID', description: 'Google Drive folder ID for file storage' },
  { name: 'GMAIL_USER_EMAIL', description: 'Gmail user email to impersonate' }
];

// Check for missing environment variables
const missingVars = requiredEnvVars.filter(({ name }) => !process.env[name]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  console.error('');
  
  missingVars.forEach(({ name, description }) => {
    console.error(`   🔴 ${name}`);
    console.error(`      Description: ${description}`);
    console.error(`      Current value: ${process.env[name] ? '[SET]' : '[NOT SET]'}`);
    console.error('');
  });
  
  throw new Error(`Missing ${missingVars.length} required environment variable(s): ${missingVars.map(v => v.name).join(', ')}`);
}

// Success message for debugging
if (CONFIG.DEBUG_MODE && CONFIG.IS_LOCAL) {
  console.log('✅ Configuration loaded successfully');
  console.log(`   Environment: ${CONFIG.IS_GITHUB_ACTIONS ? 'GitHub Actions' : 'Local'}`);
  console.log(`   Debug Mode: ${CONFIG.DEBUG_MODE}`);
  console.log(`   Batch Size: ${CONFIG.BATCH_SIZE}`);
  console.log(`   All required environment variables are present`);
}
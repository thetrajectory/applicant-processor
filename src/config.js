import dotenv from 'dotenv';

// Load environment variables from .env file in development
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
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
  
  // OAuth2 Configuration
  GOOGLE_OAUTH_CONFIG: {
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
  },
  
  // Google Resources
  GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID,
  GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID,
  
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

// Environment variable validation
const requiredEnvVars = [
  { name: 'SUPABASE_URL', description: 'Supabase project URL' },
  { name: 'SUPABASE_KEY', description: 'Supabase service role key' },
  { name: 'OPENAI_API_KEY', description: 'OpenAI API key for GPT' },
  { name: 'GOOGLE_CLIENT_ID', description: 'Google OAuth2 client ID' },
  { name: 'GOOGLE_CLIENT_SECRET', description: 'Google OAuth2 client secret' },
  { name: 'GOOGLE_REFRESH_TOKEN', description: 'Google OAuth2 refresh token' },
  { name: 'GOOGLE_SHEET_ID', description: 'Google Sheets ID for data storage' },
  { name: 'GOOGLE_DRIVE_FOLDER_ID', description: 'Google Drive folder ID for file storage' }
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
  
  if (missingVars.some(v => v.name.includes('GOOGLE'))) {
    console.error('💡 To setup Google OAuth2 credentials:');
    console.error('   1. Run: npm run setup');
    console.error('   2. Follow the OAuth2 setup process');
    console.error('   3. Add the tokens to your environment');
    console.error('');
  }
  
  throw new Error(`Missing ${missingVars.length} required environment variable(s): ${missingVars.map(v => v.name).join(', ')}`);
}

// Success message for debugging
if (CONFIG.DEBUG_MODE && CONFIG.IS_LOCAL) {
  console.log('✅ Configuration loaded successfully');
  console.log(`   Environment: ${CONFIG.IS_GITHUB_ACTIONS ? 'GitHub Actions' : 'Local'}`);
  console.log(`   Debug Mode: ${CONFIG.DEBUG_MODE}`);
  console.log(`   Batch Size: ${CONFIG.BATCH_SIZE}`);
  console.log(`   OAuth2 Client ID: ${CONFIG.GOOGLE_OAUTH_CONFIG.client_id?.substring(0, 20)}...`);
  console.log(`   All required environment variables are present`);
}
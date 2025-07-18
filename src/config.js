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
  
  // Gmail Configuration - Enhanced for better parsing
  BATCH_SIZE: parseInt(process.env.BATCH_SIZE) || (process.env.GITHUB_ACTIONS ? 200 : 10),
  MAX_EMAIL_AGE_DAYS: parseInt(process.env.MAX_EMAIL_AGE_DAYS) || (process.env.GITHUB_ACTIONS ? 7 : 14),
  
  // OCR Configuration
  OCR_LANGUAGE: 'eng',
  OCR_TIMEOUT: 45000,  // Increased timeout
  
  // GPT Configuration - Enhanced for better extraction
  GPT_MODEL: 'gpt-4o-mini',
  GPT_MAX_TOKENS: 200,  // Increased for better extraction
  GPT_TEMPERATURE: 0.1,
  GPT_TIMEOUT: 20000,   // Increased timeout
  
  // Supabase Configuration
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_KEY,
  TABLE_NAME: 'applicant_details',  // Fixed table name
  
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
  
  // Enhanced GPT Prompt for better extraction
  GPT_PROMPT: `Extract contact information from this resume text. Return ONLY a valid JSON object with these exact fields:

{
  "mobile_number": "phone number (include country code if present, format: +91-9876543210 or 9876543210)",
  "email": "email address (must be valid email format)", 
  "linkedin_url": "LinkedIn profile URL (complete URL starting with https://)"
}

IMPORTANT RULES:
1. Return ONLY the JSON object, no markdown formatting, no code blocks, no explanatory text
2. If any field is not found, use null
3. For mobile_number: extract complete phone number with country code if available
4. For email: must be a valid email address format
5. For linkedin_url: must be complete LinkedIn profile URL

Resume text:`
};

// Environment variable validation - Enhanced
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

// Enhanced success message
if (CONFIG.DEBUG_MODE && CONFIG.IS_LOCAL) {
  console.log('✅ Enhanced configuration loaded successfully');
  console.log(`   Environment: ${CONFIG.IS_GITHUB_ACTIONS ? 'GitHub Actions' : 'Local'}`);
  console.log(`   Debug Mode: ${CONFIG.DEBUG_MODE}`);
  console.log(`   Batch Size: ${CONFIG.BATCH_SIZE}`);
  console.log(`   Max Email Age: ${CONFIG.MAX_EMAIL_AGE_DAYS} days`);
  console.log(`   OCR Enabled: ${CONFIG.ENABLE_OCR}`);
  console.log(`   GPT Enabled: ${CONFIG.ENABLE_GPT}`);
  console.log(`   OAuth2 Client ID: ${CONFIG.GOOGLE_OAUTH_CONFIG.client_id?.substring(0, 20)}...`);
  console.log(`   All required environment variables are present`);
}
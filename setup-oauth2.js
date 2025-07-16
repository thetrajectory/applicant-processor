import { config } from 'dotenv';
import { google } from 'googleapis';
import readline from 'readline';
import { createLogger } from './src/utils/logger.js';

// Explicitly load .env file
config();

const logger = createLogger();

async function setupOAuth2() {
  logger.info('🔐 OAuth2 Setup for Google APIs');
  logger.info('=====================================');
  
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    logger.error('❌ Missing OAuth2 credentials!');
    process.exit(1);
  }
  
  logger.info('✅ Credentials loaded:');
  logger.info(`   Client ID: ${process.env.GOOGLE_CLIENT_ID.substring(0, 20)}...`);
  logger.info(`   Client Secret: ${process.env.GOOGLE_CLIENT_SECRET.substring(0, 10)}...`);
  logger.info('');
  
  try {
    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'urn:ietf:wg:oauth:2.0:oob'
    );
    
    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });
    
    logger.info('📋 Setup Steps:');
    logger.info('1. Open the authorization URL in your browser');
    logger.info('2. Sign in with your Google account');
    logger.info('3. Grant the requested permissions');
    logger.info('4. Copy the authorization code from the success page');
    logger.info('5. Paste it below (codes expire in 10 minutes)');
    logger.info('');
    
    logger.info('🌐 Authorization URL:');
    logger.info('='.repeat(80));
    logger.info(authUrl);
    logger.info('='.repeat(80));
    logger.info('');
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const askForCode = () => {
      return new Promise((resolve) => {
        rl.question('📝 Enter the authorization code: ', (code) => {
          resolve(code.trim());
        });
      });
    };
    
    const code = await askForCode();
    
    if (!code) {
      logger.error('❌ No authorization code provided');
      rl.close();
      process.exit(1);
    }
    
    logger.info('🔄 Exchanging code for tokens...');
    logger.info(`🔍 Code: ${code.substring(0, 20)}...`);
    
    try {
      // Use the correct method for token exchange
      const tokenResponse = await oauth2Client.getToken(code);
      
      logger.info('🔍 Token response received');
      
      if (!tokenResponse || !tokenResponse.tokens) {
        throw new Error('No tokens in response');
      }
      
      const tokens = tokenResponse.tokens;
      
      logger.info('✅ Tokens extracted successfully');
      logger.info(`   Access token: ${tokens.access_token ? 'Present' : 'Missing'}`);
      logger.info(`   Refresh token: ${tokens.refresh_token ? 'Present' : 'Missing'}`);
      
      if (!tokens.refresh_token) {
        logger.error('❌ No refresh token received!');
        logger.error('');
        logger.error('🔧 To fix this:');
        logger.error('   1. Go to https://myaccount.google.com/permissions');
        logger.error('   2. Remove "Applicant Processor" if it exists');
        logger.error('   3. Run the setup again');
        logger.error('   4. Make sure to grant consent again');
        process.exit(1);
      }
      
      logger.info('');
      logger.info('✅ Setup successful!');
      logger.info('');
      logger.info('📋 Add this to your .env file:');
      logger.info('='.repeat(50));
      logger.info(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
      logger.info('='.repeat(50));
      
      // Test the token
      oauth2Client.setCredentials(tokens);
      
      logger.info('');
      logger.info('🧪 Testing the token...');
      
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      
      logger.info('✅ Token test successful!');
      logger.info(`   User: ${userInfo.data.name} (${userInfo.data.email})`);
      logger.info('');
      logger.info('🎉 OAuth2 setup completed successfully!');
      logger.info('');
      logger.info('💡 Next steps:');
      logger.info('   1. Add the GOOGLE_REFRESH_TOKEN to your .env file');
      logger.info('   2. Run: npm run health');
      logger.info('   3. Run: npm start');
      
    } catch (tokenError) {
      logger.error('❌ Token exchange failed:');
      logger.error(`   Error: ${tokenError.message}`);
      logger.error(`   Code: ${tokenError.code || 'N/A'}`);
      logger.error(`   Status: ${tokenError.status || 'N/A'}`);
      
      if (tokenError.response?.data) {
        logger.error(`   API Response: ${JSON.stringify(tokenError.response.data, null, 2)}`);
      }
      
      logger.error('');
      logger.error('🔧 Common causes:');
      logger.error('   - Authorization code expired (get a fresh one)');
      logger.error('   - Code already used (get a new one)');
      logger.error('   - Wrong OAuth2 client configuration');
      logger.error('   - System time is incorrect');
      
      process.exit(1);
    }
    
  } catch (error) {
    logger.error('❌ Setup failed:', error.message);
    logger.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    rl.close();
  }
}

setupOAuth2().catch(error => {
  logger.error('💥 Setup failed:', error);
  process.exit(1);
});
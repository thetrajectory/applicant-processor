import { google } from 'googleapis';
import { CONFIG } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger();

export class OAuth2AuthService {
  constructor() {
    logger.info('🔐 Initializing OAuth2 authentication service...');
    
    if (!CONFIG.GOOGLE_OAUTH_CONFIG.client_id || !CONFIG.GOOGLE_OAUTH_CONFIG.client_secret) {
      throw new Error('Google OAuth2 client ID and secret are required');
    }
    
    this.oauth2Client = new google.auth.OAuth2(
      CONFIG.GOOGLE_OAUTH_CONFIG.client_id,
      CONFIG.GOOGLE_OAUTH_CONFIG.client_secret,
      'urn:ietf:wg:oauth:2.0:oob'
    );

    if (CONFIG.GOOGLE_OAUTH_CONFIG.refresh_token) {
      this.oauth2Client.setCredentials({
        refresh_token: CONFIG.GOOGLE_OAUTH_CONFIG.refresh_token
      });
      logger.info('✅ OAuth2 credentials configured with refresh token');
    } else {
      logger.warn('⚠️ No refresh token found - run setup first');
    }
  }

  async getAuthClient() {
    try {
      if (!CONFIG.GOOGLE_OAUTH_CONFIG.refresh_token) {
        throw new Error('No refresh token available. Run setup first.');
      }

      const { token } = await this.oauth2Client.getAccessToken();
      
      if (!token) {
        throw new Error('Failed to get access token');
      }
      
      logger.debug('🔑 Access token obtained successfully');
      return this.oauth2Client;
    } catch (error) {
      logger.error('❌ OAuth2 authentication failed:', {
        message: error.message,
        hasRefreshToken: !!CONFIG.GOOGLE_OAUTH_CONFIG.refresh_token,
        clientId: CONFIG.GOOGLE_OAUTH_CONFIG.client_id?.substring(0, 20) + '...'
      });
      throw new Error(`OAuth2 authentication failed: ${error.message}`);
    }
  }

  async testConnection() {
    try {
      const auth = await this.getAuthClient();
      const oauth2 = google.oauth2({ version: 'v2', auth });
      
      const userInfo = await oauth2.userinfo.get();
      logger.info(`✅ OAuth2 authentication successful for: ${userInfo.data.email}`);
      logger.info(`   Name: ${userInfo.data.name}`);
      logger.info(`   Google ID: ${userInfo.data.id}`);
      
      return true;
    } catch (error) {
      throw new Error(`OAuth2 connection test failed: ${error.message}`);
    }
  }

  generateAuthUrl() {
    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });
  }

  async exchangeCodeForToken(code) {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      
      if (!tokens.refresh_token) {
        throw new Error('No refresh token received. Make sure to revoke previous access and try again.');
      }
      
      this.oauth2Client.setCredentials(tokens);
      
      logger.info('✅ Successfully obtained tokens');
      return tokens;
    } catch (error) {
      throw new Error(`Failed to exchange code for token: ${error.message}`);
    }
  }

  async refreshAccessToken() {
    try {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      this.oauth2Client.setCredentials(credentials);
      logger.debug('🔄 Access token refreshed successfully');
      return credentials;
    } catch (error) {
      throw new Error(`Failed to refresh access token: ${error.message}`);
    }
  }
}
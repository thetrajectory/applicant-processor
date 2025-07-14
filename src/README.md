# Applicant Processor

Automated LinkedIn job application processing system using GitHub Actions.

## Features

- 🔥 **Real-time Processing**: Runs every 30 minutes
- 📧 **Gmail Integration**: Automatically processes LinkedIn job applications
- 🤖 **AI-Powered**: Uses GPT to extract contact information
- 📄 **OCR Support**: Extracts text from PDF resumes
- 📊 **Google Sheets**: Stores data in organized spreadsheets
- 💾 **Supabase**: Persistent database storage
- 📁 **Drive Storage**: Automatic resume backup

## Setup

1. **Clone Repository**:
   ```bash
   git clone https://github.com/yourusername/applicant-processor.git
   cd applicant-processor
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Services**:
   - Set up Google Cloud Project with service account
   - Configure Supabase database
   - Add GitHub Secrets and Variables
   - Create Google Sheet and Drive folder

4. **Test Configuration**:
   ```bash
   npm run test
   ```

## Manual Execution

To run manually:
```bash
npm start
```

To run health check:
```bash
node src/health-check.js
```

## Monitoring

- Check GitHub Actions logs for processing details
- View artifacts for detailed processing reports
- Monitor Supabase dashboard for data insights

## Architecture

```
GitHub Actions (30min schedule)
├── Gmail API (fetch emails)
├── OCR Processing (extract text)
├── OpenAI GPT (extract contacts)
├── Google Sheets (store data)
├── Google Drive (store resumes)
└── Supabase (persistent storage)
```

## Support

For issues or questions, please open a GitHub issue.
```

## 10. **Deployment Instructions**

### **Step 1: Repository Setup**
```bash
# Create and setup repository
git init applicant-processor
cd applicant-processor

# Add all files (create the structure above first)
git add .
git commit -m "Initial commit: Applicant processor with GitHub Actions"

# Push to GitHub
git remote add origin https://github.com/yourusername/applicant-processor.git
git push -u origin main
```

### **Step 2: Service Account Setup**
```bash
# Create service account JSON and copy content
cat service-account.json | jq -c . # Copy output to GitHub Secrets
```

### **Step 3: Test Setup**
```bash
# Install dependencies locally for testing
npm install

# Run health check
node src/health-check.js

# Test single run
npm start
```

### **Step 4: Monitor First Run**
1. Go to GitHub Actions tab
2. Manually trigger workflow using "Run workflow"
3. Monitor logs and artifacts
4. Check Google Sheets and Supabase for data

### **Step 5: Production Monitoring**
- Set up GitHub Actions notifications
- Monitor Supabase usage
- Check Google API quotas
- Review processing logs regularly

## 11. **Key Advantages of This Setup**

✅ **No Downtime**: GitHub Actions handles infrastructure  
✅ **Scalable**: Can process hundreds of emails per run  
✅ **Cost Effective**: Free tier covers most usage  
✅ **Maintainable**: All code is version controlled  
✅ **Monitorable**: Built-in logging and reporting  
✅ **Secure**: Credentials stored in GitHub Secrets  
✅ **Flexible**: Easy to modify and extend  

## 12. **Cost Breakdown**

- **GitHub Actions**: Free (2000 minutes/month for private repos)
- **Google APIs**: Free tier + minimal usage costs
- **Supabase**: Free tier covers most usage
- **OpenAI**: ~$0.10-0.50 per 1000 processed emails
- **Total**: ~$5-20/month for processing 1000+ emails

This complete setup gives you a production-ready, scalable applicant processing system that runs automatically every 30 minutes with no downtime!
import { EmailParser } from './src/utils/parser.js';
import { createLogger } from './src/utils/logger.js';

const logger = createLogger();

// Test cases for enhanced parser
const testEmails = [
  {
    subject: "New application: Senior Python Developer from John Smith",
    body: `
Your job has a new applicant

John Smith
Senior Python Developer at Tech Corp
Bangalore, Karnataka, India

Screening qualifications:
3 out of 5 preferred qualifications met

What is your current annual CTC? 12 lakhs

Experience: 5 years in Python development
`,
    htmlBody: `
<div>
<strong>John Smith</strong><br>
Senior Python Developer<br>
Bangalore, Karnataka, India<br>
<br>
Screening Questions:<br>
Current CTC: 12,00,000 INR<br>
<a href="https://linkedin.com/jobs/view/project=123456">View Application</a>
</div>
`
  },
  {
    subject: "Job application: Full Stack Developer from Priya Sharma",
    body: `
New applicant for Full Stack Developer position

Candidate: Priya Sharma
Location: Mumbai, Maharashtra, India
Expected Compensation: 15 LPA

Screening Results:
4 out of 6 preferred qualifications met
Current annual CTC? 10 lakhs
Years of experience? 4 years
`,
    htmlBody: `
<h2>Full Stack Developer</h2>
<p><strong>Priya Sharma</strong></p>
<p>Mumbai, Maharashtra, India</p>
<p>CTC: ₹10,00,000</p>
<a href="https://www.linkedin.com/jobs/collections/recommended/?currentJobId=987654">View Details</a>
`
  }
];

async function testParser() {
  logger.info('🧪 Testing Enhanced Email Parser...');
  
  const parser = new EmailParser();
  
  for (let i = 0; i < testEmails.length; i++) {
    const testEmail = testEmails[i];
    logger.info(`\n📧 Testing email ${i + 1}: ${testEmail.subject}`);
    
    const isLinkedIn = parser.isLinkedInApplication(testEmail);
    logger.info(`   LinkedIn Detection: ${isLinkedIn ? '✅' : '❌'}`);
    
    if (isLinkedIn) {
      const parsed = parser.parseLinkedInApplication(testEmail);
      
      logger.info('   📋 Parsing Results:');
      logger.info(`     Name: ${parsed.name ? '✅ ' + parsed.name : '❌'}`);
      logger.info(`     Title: ${parsed.title ? '✅ ' + parsed.title : '❌'}`);
      logger.info(`     Location: ${parsed.location ? '✅ ' + parsed.location : '❌'}`);
      logger.info(`     Compensation: ${parsed.expected_compensation ? '✅ ' + parsed.expected_compensation : '❌'}`);
      logger.info(`     Project ID: ${parsed.project_id ? '✅ ' + parsed.project_id : '❌'}`);
      logger.info(`     Screening: ${parsed.screening_questions ? '✅ ' + parsed.screening_questions.substring(0, 50) + '...' : '❌'}`);
      
      // Calculate parsing score
      const fields = [parsed.name, parsed.title, parsed.location, parsed.expected_compensation, parsed.project_id, parsed.screening_questions];
      const successCount = fields.filter(f => f).length;
      const score = (successCount / fields.length * 100).toFixed(1);
      
      logger.info(`   📊 Parsing Score: ${score}% (${successCount}/${fields.length})`);
    }
  }
  
  logger.info('\n✅ Parser testing completed');
}

testParser().catch(error => {
  logger.error('❌ Parser test failed:', error);
});
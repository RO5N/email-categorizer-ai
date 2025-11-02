import OpenAI from 'openai';

interface EmailSummaryRequest {
  subject: string;
  from: string;
  to: string;
  body: string;
  snippet: string;
}

interface EmailSummary {
  summary: string;
  keyPoints: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  category: string;
  actionRequired: boolean;
  confidence: number;
}

class AIService {
  private openai: OpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Generate AI summary for an email
   */
  async summarizeEmail(emailData: EmailSummaryRequest): Promise<EmailSummary> {
    try {
      const prompt = this.buildSummaryPrompt(emailData);
      
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are an intelligent email assistant that analyzes and summarizes emails. Provide concise, actionable summaries in JSON format.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from OpenAI');
      }

      const parsed = JSON.parse(response) as EmailSummary;
      
      // Validate and set defaults
      return {
        summary: parsed.summary || 'Unable to generate summary',
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
        sentiment: ['positive', 'neutral', 'negative'].includes(parsed.sentiment) 
          ? parsed.sentiment 
          : 'neutral',
        category: parsed.category || 'General',
        actionRequired: Boolean(parsed.actionRequired),
        confidence: Math.min(Math.max(parsed.confidence || 0.5, 0), 1)
      };

    } catch (error) {
      console.error('Error generating AI summary:', error);
      
      // Return fallback summary
      return {
        summary: `Email from ${emailData.from} about "${emailData.subject}". ${emailData.snippet}`,
        keyPoints: [],
        sentiment: 'neutral',
        category: 'General',
        actionRequired: false,
        confidence: 0.1
      };
    }
  }

  /**
   * Build the prompt for email summarization
   */
  private buildSummaryPrompt(emailData: EmailSummaryRequest): string {
    return `
Analyze this email and provide a JSON response with the following structure:
{
  "summary": "A concise 1-2 sentence summary of the email's main purpose",
  "keyPoints": ["Key point 1", "Key point 2", "Key point 3"],
  "sentiment": "positive|neutral|negative",
  "category": "Work|Personal|Marketing|Newsletter|Support|Finance|Travel|Shopping|Social|Other",
  "actionRequired": true/false,
  "confidence": 0.0-1.0
}

Email Details:
- From: ${emailData.from}
- To: ${emailData.to}
- Subject: ${emailData.subject}
- Content: ${emailData.body.substring(0, 2000)}${emailData.body.length > 2000 ? '...' : ''}

Focus on:
1. What is the main purpose/request in this email?
2. What are the key actionable items or important information?
3. What category does this email belong to?
4. Does this email require any action from the recipient?
5. What is the overall sentiment/tone?

Provide a helpful, concise summary that would help someone quickly understand the email's importance and content.
    `.trim();
  }

  /**
   * Batch summarize multiple emails
   */
  async summarizeEmails(emails: EmailSummaryRequest[]): Promise<EmailSummary[]> {
    const summaries: EmailSummary[] = [];
    
    // Process emails in batches to avoid rate limits
    const batchSize = 3;
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      
      const batchPromises = batch.map(email => this.summarizeEmail(email));
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          summaries.push(result.value);
        } else {
          console.error(`Failed to summarize email ${i + index}:`, result.reason);
          // Add fallback summary
          summaries.push({
            summary: `Email from ${batch[index].from} about "${batch[index].subject}"`,
            keyPoints: [],
            sentiment: 'neutral',
            category: 'General',
            actionRequired: false,
            confidence: 0.1
          });
        }
      });

      // Add delay between batches to respect rate limits
      if (i + batchSize < emails.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return summaries;
  }

  /**
   * Test OpenAI connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello, this is a test. Please respond with "OK".' }],
        max_tokens: 10
      });
      
      return response.choices[0]?.message?.content?.includes('OK') || false;
    } catch (error) {
      console.error('OpenAI connection test failed:', error);
      return false;
    }
  }
}

export { AIService, EmailSummaryRequest, EmailSummary };

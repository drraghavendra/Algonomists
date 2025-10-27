import express from 'express';
import { WebsiteSDK } from '../index';
import { Algodv2, generateAccount } from 'algosdk';

// Example Express.js integration
async function createApp() {
  const app = express();

  // Initialize Algorand client
  const algodClient = new Algodv2('', 'https://testnet-api.algonode.cloud', '');

  // Website owner account
  const ownerAccount = generateAccount();

  // Configure Website SDK
  const websiteSDK = new WebsiteSDK({
    apiBaseUrl: 'https://api.agentweb.example.com',
    algodClient,
    ownerAccount,
    domain: 'example.com',
    basePaymentAmount: 1000, // 0.001 ALGO
    paymentRequired: true,
    supportedQueryTypes: ['extract_content', 'search', 'data_query']
  });

  // Register website
  try {
    const registration = await websiteSDK.registerWebsite();
    console.log('Website registered:', registration);
  } catch (error) {
    console.error('Registration failed:', error);
  }

  // Use agent middleware
  app.use(websiteSDK.createAgentMiddleware());

  // Agent-optimized routes
  app.get('/api/agent/content', (req, res) => {
    if (req.agentRequest) {
      // This is an agent request with verified payment
      const content = {
        title: 'Example Article',
        content: 'This is the main content of the article...',
        metadata: {
          author: 'John Doe',
          published: '2024-01-01',
          wordCount: 1500
        }
      };

      res.json(websiteSDK.createAgentResponse(content, {
        queryType: req.agentRequest.queryType,
        paymentAmount: req.agentRequest.paymentAmount
      }));
    } else {
      // Regular user request
      res.json({ message: 'Regular API response' });
    }
  });

  // Analytics endpoint for website owner
  app.get('/admin/analytics', async (req, res) => {
    try {
      const analytics = await websiteSDK.getAnalytics();
      res.json(analytics);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return app;
}

// Start server
createApp().then(app => {
  app.listen(3000, () => {
    console.log('Website running with agent integration on port 3000');
  });
});

export { createApp };
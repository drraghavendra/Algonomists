import { AgentWebSDK, QueryRequest } from '../index';
import { Algodv2, generateAccount } from 'algosdk';

// Example usage of the Agent SDK
async function main() {
  // Initialize Algorand client
  const algodClient = new Algodv2('', 'https://testnet-api.algonode.cloud', '');

  // Generate or use existing agent account
  const agentAccount = generateAccount();

  // Configure the SDK
  const agentSDK = new AgentWebSDK({
    apiBaseUrl: 'https://api.agentweb.example.com',
    algodClient,
    agentAccount,
    defaultPaymentAmount: 1000, // 0.001 ALGO
  });

  try {
    // Discover available websites
    const websites = await agentSDK.discoverWebsites();
    console.log('Available websites:', websites);

    // Get specific website info
    const websiteInfo = await agentSDK.getWebsiteInfo('example.com');
    console.log('Website info:', websiteInfo);

    // Execute a query with automatic payment
    const queryRequest: QueryRequest = {
      websiteUrl: 'https://example.com/data',
      queryType: 'extract_content',
      queryParameters: {
        selector: '.article-content',
        format: 'text'
      }
    };

    const result = await agentSDK.executeQuery(queryRequest);
    console.log('Query result:', result);

    // Check balance
    const balance = await agentSDK.getBalance();
    console.log('Agent balance:', balance);

  } catch (error) {
    console.error('Agent operation failed:', error);
  }
}

export { main };

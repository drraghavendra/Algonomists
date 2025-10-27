import { AgentWebSDK } from '@agentweb/agent-sdk';
import { Algodv2 } from 'algosdk';

// Initialize
const algodClient = new Algodv2('', 'https://testnet-api.algonode.cloud', '');
const agentSDK = new AgentWebSDK({
  apiBaseUrl: 'https://api.agentweb.example.com',
  algodClient,
  agentAccount: yourAlgorandAccount,
  defaultPaymentAmount: 1000,
});

// Execute queries with automatic payments
const result = await agentSDK.executeQuery({
  websiteUrl: 'https://example.com',
  queryType: 'extract_content',
  queryParameters: { selector: '.content' }
});
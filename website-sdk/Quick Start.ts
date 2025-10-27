import { WebsiteSDK } from '@agentweb/website-sdk';
import express from 'express';

const app = express();

const websiteSDK = new WebsiteSDK({
  apiBaseUrl: 'https://api.agentweb.example.com',
  algodClient: yourAlgodClient,
  ownerAccount: yourAlgorandAccount,
  domain: 'yourdomain.com',
  basePaymentAmount: 1000,
  paymentRequired: true
});

// Register website
await websiteSDK.registerWebsite();

// Use agent middleware
app.use(websiteSDK.createAgentMiddleware());

// Agent requests will now be automatically handled with payment verification
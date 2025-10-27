import { Algodv2, Account, makePaymentTxnWithSuggestedParams } from 'algosdk';
import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';

export interface AgentConfig {
  apiBaseUrl: string;
  algodClient: Algodv2;
  agentAccount: Account;
  defaultPaymentAmount: number;
}

export interface WebsiteInfo {
  domain: string;
  ownerAddress: string;
  asaId: number;
  ensSubname: string;
  isVerified: boolean;
  paymentRequired: boolean;
  basePaymentAmount: number;
}

export interface QueryRequest {
  websiteUrl: string;
  queryType: string;
  queryParameters: Record<string, any>;
  paymentAmount?: number;
  assetId?: number;
}

export interface QueryResponse {
  success: boolean;
  data: any;
  paymentStatus: string;
  sessionId: string;
  cost: number;
  timestamp: string;
}

export interface PaymentSession {
  sessionId: string;
  escrowAddress: string;
  amount: number;
  assetId: number;
  status: string;
}

export class AgentWebSDK {
  private config: AgentConfig;
  private httpClient: AxiosInstance;

  constructor(config: AgentConfig) {
    this.config = config;
    this.httpClient = axios.create({
      baseURL: config.apiBaseUrl,
      timeout: 30000,
    });
  }

  /**
   * Discover registered websites in the network
   */
  async discoverWebsites(domainFilter?: string): Promise<WebsiteInfo[]> {
    try {
      const response = await this.httpClient.get('/websites', {
        params: { domain: domainFilter }
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to discover websites: ${error.message}`);
    }
  }

  /**
   * Get specific website information
   */
  async getWebsiteInfo(domain: string): Promise<WebsiteInfo> {
    try {
      const response = await this.httpClient.get(`/websites/${domain}/info`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get website info: ${error.message}`);
    }
  }

  /**
   * Execute a query on a website with automatic payment handling
   */
  async executeQuery(request: QueryRequest): Promise<QueryResponse> {
    const sessionId = uuidv4();

    try {
      // Get website info to determine payment requirements
      const websiteInfo = await this.getWebsiteInfo(this.extractDomain(request.websiteUrl));
      
      // Prepare payment
      const paymentAmount = request.paymentAmount || websiteInfo.basePaymentAmount;
      const assetId = request.assetId || (websiteInfo.asaId > 0 ? websiteInfo.asaId : 0);

      if (websiteInfo.paymentRequired) {
        await this.initiatePayment(websiteInfo.ownerAddress, paymentAmount, assetId, sessionId);
      }

      // Execute the query
      const queryResponse = await this.httpClient.post('/agent/query', {
        agent_address: this.config.agentAccount.addr,
        website_domain: websiteInfo.domain,
        website_url: request.websiteUrl,
        query_type: request.queryType,
        query_parameters: request.queryParameters,
        payment_amount: paymentAmount,
        session_id: sessionId
      });

      if (websiteInfo.paymentRequired) {
        await this.completePayment(sessionId, websiteInfo.ownerAddress, paymentAmount);
      }

      return {
        success: true,
        data: queryResponse.data.query_result,
        paymentStatus: websiteInfo.paymentRequired ? 'completed' : 'not_required',
        sessionId,
        cost: websiteInfo.paymentRequired ? paymentAmount : 0,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      // If payment was initiated but query failed, refund
      await this.handleQueryFailure(sessionId);
      throw new Error(`Query execution failed: ${error.message}`);
    }
  }

  /**
   * Initiate payment for website access
   */
  private async initiatePayment(
    websiteAddress: string, 
    amount: number, 
    assetId: number, 
    sessionId: string
  ): Promise<PaymentSession> {
    try {
      const response = await this.httpClient.post('/payments/initiate', {
        agent_address: this.config.agentAccount.addr,
        website_address: websiteAddress,
        amount,
        asset_id: assetId,
        session_id: sessionId
      });

      const paymentSession = response.data;

      // Actually send the payment to escrow
      await this.sendPaymentToEscrow(
        paymentSession.escrowAddress, 
        amount, 
        assetId
      );

      return paymentSession;
    } catch (error) {
      throw new Error(`Payment initiation failed: ${error.message}`);
    }
  }

  /**
   * Send payment to escrow address
   */
  private async sendPaymentToEscrow(escrowAddress: string, amount: number, assetId: number): Promise<string> {
    try {
      const params = await this.config.algodClient.getTransactionParams().do();

      let transaction;
      if (assetId === 0) {
        // ALGO payment
        transaction = makePaymentTxnWithSuggestedParams(
          this.config.agentAccount.addr,
          escrowAddress,
          amount,
          undefined,
          undefined,
          params
        );
      } else {
        // ASA payment
        const { makeAssetTransferTxnWithSuggestedParams } = await import('algosdk');
        transaction = makeAssetTransferTxnWithSuggestedParams(
          this.config.agentAccount.addr,
          escrowAddress,
          undefined,
          undefined,
          amount,
          undefined,
          assetId,
          params
        );
      }

      const signedTxn = transaction.signTxn(this.config.agentAccount.sk);
      const tx = await this.config.algodClient.sendRawTransaction(signedTxn).do();
      
      await this.waitForConfirmation(tx.txId);
      return tx.txId;

    } catch (error) {
      throw new Error(`Payment to escrow failed: ${error.message}`);
    }
  }

  /**
   * Complete payment after successful query
   */
  private async completePayment(sessionId: string, websiteAddress: string, amount: number): Promise<void> {
    try {
      await this.httpClient.post('/payments/complete', {
        session_id: sessionId,
        website_address: websiteAddress,
        amount
      });
    } catch (error) {
      throw new Error(`Payment completion failed: ${error.message}`);
    }
  }

  /**
   * Handle query failure and cleanup payments
   */
  private async handleQueryFailure(sessionId: string): Promise<void> {
    try {
      // In a real implementation, this would trigger escrow refund
      await this.httpClient.post('/payments/cancel', {
        session_id: sessionId
      });
    } catch (error) {
      console.error('Failed to cancel payment session:', error);
    }
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const domain = new URL(url).hostname;
      return domain;
    } catch {
      return url;
    }
  }

  /**
   * Wait for transaction confirmation
   */
  private async waitForConfirmation(txId: string, timeout: number = 10000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const status = await this.config.algodClient.pendingTransactionInformation(txId).do();
        if (status['confirmed-round'] !== null && status['confirmed-round'] > 0) {
          return;
        }
      } catch (error) {
        // Continue waiting
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error(`Transaction confirmation timeout: ${txId}`);
  }

  /**
   * Get agent's balance for specific asset
   */
  async getBalance(assetId: number = 0): Promise<number> {
    try {
      const accountInfo = await this.config.algodClient
        .accountInformation(this.config.agentAccount.addr)
        .do();

      if (assetId === 0) {
        return accountInfo.amount;
      } else {
        const asset = accountInfo.assets.find((a: any) => a['asset-id'] === assetId);
        return asset ? asset.amount : 0;
      }
    } catch (error) {
      throw new Error(`Failed to get balance: ${error.message}`);
    }
  }

  /**
   * Get payment history for the agent
   */
  async getPaymentHistory(): Promise<any[]> {
    try {
      const response = await this.httpClient.get(`/analytics/agent/${this.config.agentAccount.addr}`);
      return response.data.payments;
    } catch (error) {
      throw new Error(`Failed to get payment history: ${error.message}`);
    }
  }
}
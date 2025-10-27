import { Algodv2, Account } from 'algosdk';
import axios, { AxiosInstance } from 'axios';
import { Request, Response, NextFunction } from 'express';

export interface WebsiteConfig {
  apiBaseUrl: string;
  algodClient: Algodv2;
  ownerAccount: Account;
  domain: string;
  basePaymentAmount: number;
  paymentRequired: boolean;
  supportedQueryTypes: string[];
}

export interface RegistrationResult {
  success: boolean;
  asaId: number;
  ensSubname: string;
  websiteAddress: string;
}

export interface AnalyticsData {
  totalRevenue: number;
  successfulPayments: number;
  popularQueries: string[];
  recentInteractions: any[];
}

export interface AgentRequest {
  agentAddress: string;
  queryType: string;
  queryParameters: Record<string, any>;
  sessionId: string;
  paymentAmount: number;
}

export class WebsiteSDK {
  private config: WebsiteConfig;
  private httpClient: AxiosInstance;
  private isRegistered: boolean = false;

  constructor(config: WebsiteConfig) {
    this.config = config;
    this.httpClient = axios.create({
      baseURL: config.apiBaseUrl,
      timeout: 30000,
    });
  }

  /**
   * Register website with the agent web infrastructure
   */
  async registerWebsite(verificationHeader: string = null): Promise<RegistrationResult> {
    try {
      // Generate verification header if not provided
      const header = verificationHeader || this.generateVerificationHeader();

      const response = await this.httpClient.post('/websites/register', {
        domain: this.config.domain,
        owner_address: this.config.ownerAccount.addr,
        verification_header: header,
        base_payment_amount: this.config.basePaymentAmount,
        payment_required: this.config.paymentRequired,
        supported_query_types: this.config.supportedQueryTypes
      });

      this.isRegistered = true;

      return {
        success: true,
        asaId: response.data.asa_id,
        ensSubname: response.data.ens_subname,
        websiteAddress: this.config.ownerAccount.addr
      };

    } catch (error) {
      throw new Error(`Website registration failed: ${error.message}`);
    }
  }

  /**
   * Generate verification header for website ownership
   */
  private generateVerificationHeader(): string {
    const timestamp = Date.now();
    const signature = this.config.ownerAccount.addr; // In production, this would be a proper signature
    return `agentweb-verification-${timestamp}-${signature}`;
  }

  /**
   * Express middleware to handle agent requests and payments
   */
  createAgentMiddleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      // Check if this is an agent request
      const agentSignature = req.headers['x-agentweb-signature'];
      const sessionId = req.headers['x-agentweb-session-id'];

      if (!agentSignature || !sessionId) {
        return next(); // Not an agent request, proceed normally
      }

      try {
        // Verify the agent request and payment
        const agentRequest: AgentRequest = {
          agentAddress: agentSignature,
          queryType: req.headers['x-query-type'] as string,
          queryParameters: JSON.parse(req.headers['x-query-parameters'] as string || '{}'),
          sessionId: sessionId as string,
          paymentAmount: parseInt(req.headers['x-payment-amount'] as string || '0')
        };

        // Validate payment if required
        if (this.config.paymentRequired) {
          const paymentVerified = await this.verifyPayment(
            agentRequest.sessionId, 
            agentRequest.paymentAmount
          );

          if (!paymentVerified) {
            return res.status(402).json({
              error: 'Payment required or verification failed',
              code: 'PAYMENT_REQUIRED'
            });
          }
        }

        // Attach agent request info to request object
        req.agentRequest = agentRequest;

        // Set response headers for agent
        res.set({
          'X-AgentWeb-Verification': this.generateVerificationHeader(),
          'X-AgentWeb-Supported-Queries': this.config.supportedQueryTypes.join(','),
          'X-AgentWeb-Payment-Required': this.config.paymentRequired.toString(),
          'X-AgentWeb-Base-Payment': this.config.basePaymentAmount.toString()
        });

        next();

      } catch (error) {
        console.error('Agent middleware error:', error);
        res.status(500).json({ error: 'Agent request processing failed' });
      }
    };
  }

  /**
   * Verify payment for agent request
   */
  private async verifyPayment(sessionId: string, amount: number): Promise<boolean> {
    try {
      const response = await this.httpClient.get(`/payments/session/${sessionId}`);
      const session = response.data;

      return session.status === 'completed' && 
             session.amount >= amount && 
             session.website_address === this.config.ownerAccount.addr;

    } catch (error) {
      console.error('Payment verification failed:', error);
      return false;
    }
  }

  /**
   * Get website analytics
   */
  async getAnalytics(): Promise<AnalyticsData> {
    try {
      const response = await this.httpClient.get(`/analytics/website/${this.config.domain}`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get analytics: ${error.message}`);
    }
  }

  /**
   * Update website configuration
   */
  async updateConfiguration(updates: Partial<WebsiteConfig>): Promise<void> {
    try {
      await this.httpClient.patch(`/websites/${this.config.domain}`, updates);
      
      // Update local config
      this.config = { ...this.config, ...updates };

    } catch (error) {
      throw new Error(`Failed to update configuration: ${error.message}`);
    }
  }

  /**
   * Withdraw accumulated revenue
   */
  async withdrawRevenue(amount: number, assetId: number = 0): Promise<string> {
    try {
      const response = await this.httpClient.post('/revenue/withdraw', {
        website_address: this.config.ownerAccount.addr,
        amount,
        asset_id: assetId
      });

      return response.data.transaction_id;

    } catch (error) {
      throw new Error(`Revenue withdrawal failed: ${error.message}`);
    }
  }

  /**
   * Get current revenue balance
   */
  async getRevenueBalance(assetId: number = 0): Promise<number> {
    try {
      const analytics = await this.getAnalytics();
      return analytics.totalRevenue;
    } catch (error) {
      throw new Error(`Failed to get revenue balance: ${error.message}`);
    }
  }

  /**
   * Check if website is registered
   */
  isWebsiteRegistered(): boolean {
    return this.isRegistered;
  }

  /**
   * Generate agent-optimized response
   */
  createAgentResponse(data: any, metadata: Record<string, any> = {}) {
    return {
      success: true,
      data: data,
      metadata: {
        timestamp: new Date().toISOString(),
        domain: this.config.domain,
        ...metadata
      },
      structure: this.inferDataStructure(data)
    };
  }

  /**
   * Infer data structure for agent consumption
   */
  private inferDataStructure(data: any): string {
    if (Array.isArray(data)) {
      return `array[${data.length}]`;
    } else if (typeof data === 'object' && data !== null) {
      return `object{${Object.keys(data).join(',')}}`;
    } else {
      return typeof data;
    }
  }
}

// Express type extensions
declare global {
  namespace Express {
    interface Request {
      agentRequest?: AgentRequest;
    }
  }
}
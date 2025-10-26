import React, { useState, useEffect } from 'react';
import { useAgent } from '../hooks/useAgent';
import { usePayments } from '../hooks/usePayments';
import { AgentInfo, PaymentHistory, WebsiteDiscovery } from './DashboardComponents';

interface AgentStats {
  totalPayments: number;
  totalSpent: number;
  reputation: number;
  activeSessions: number;
}

export const AgentDashboard: React.FC = () => {
  const { agent, isRegistered } = useAgent();
  const { paymentHistory, initiatePayment } = usePayments();
  const [stats, setStats] = useState<AgentStats | null>(null);

  useEffect(() => {
    if (agent) {
      setStats({
        totalPayments: paymentHistory.length,
        totalSpent: paymentHistory.reduce((sum, payment) => sum + payment.amount, 0),
        reputation: agent.reputation_score || 0,
        activeSessions: 1
      });
    }
  }, [agent, paymentHistory]);

  const handleQuickPayment = async (website: string, amount: number) => {
    try {
      await initiatePayment({
        website_address: website,
        amount: amount,
        asa_id: 31566704, // USDC ASA ID on Algorand
        content_hash: `access_${Date.now()}`
      });
    } catch (error) {
      console.error('Payment failed:', error);
    }
  };

  if (!isRegistered) {
    return <AgentRegistration />;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Agent Dashboard
              </h1>
              <p className="text-gray-600">
                Manage your AI agent activities and payments
              </p>
            </div>
            <div className="flex space-x-4">
              <div className="text-right">
                <p className="text-sm text-gray-500">Balance</p>
                <p className="text-xl font-semibold">
                  {stats?.totalSpent ? (stats.totalSpent / 1000000).toFixed(2) : '0'} USDC
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Reputation</p>
                <p className="text-xl font-semibold text-green-600">
                  {stats?.reputation || 0}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Agent Info */}
          <div className="lg:col-span-1 space-y-6">
            <AgentInfo agent={agent} stats={stats} />
          </div>

          {/* Middle Column - Payment History */}
          <div className="lg:col-span-1">
            <PaymentHistory 
              payments={paymentHistory} 
              onQuickPayment={handleQuickPayment}
            />
          </div>

          {/* Right Column - Website Discovery */}
          <div className="lg:col-span-1">
            <WebsiteDiscovery onQuickPayment={handleQuickPayment} />
          </div>
        </div>
      </div>
    </div>
  );
};

const AgentRegistration: React.FC = () => {
  const [agentId, setAgentId] = useState('');
  const [metadata, setMetadata] = useState('');
  const { registerAgent } = useAgent();

  const handleRegistration = async () => {
    try {
      await registerAgent({
        agent_id: agentId,
        public_key: 'demo_public_key', // In production, generate properly
        metadata: JSON.parse(metadata || '{}'),
        signature: 'demo_signature'
      });
    } catch (error) {
      console.error('Registration failed:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-lg shadow-sm p-8 max-w-md w-full">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Register Your AI Agent
        </h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Agent ID
            </label>
            <input
              type="text"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="unique-agent-id"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Agent Metadata (JSON)
            </label>
            <textarea
              value={metadata}
              onChange={(e) => setMetadata(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder='{"capabilities": ["web_browsing"], "provider": "your-company"}'
            />
          </div>
          
          <button
            onClick={handleRegistration}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Register Agent
          </button>
        </div>
        
        <div className="mt-6 p-4 bg-blue-50 rounded-md">
          <h3 className="text-sm font-medium text-blue-800 mb-2">
            How it works
          </h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• Your agent gets a unique identity on Algorand</li>
            <li>• Start making micropayments to access content</li>
            <li>• Build reputation across the agentic web</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
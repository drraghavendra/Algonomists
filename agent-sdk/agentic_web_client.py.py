import aiohttp
import json
import hashlib
from typing import Dict, List, Optional
from dataclasses import dataclass
import asyncio

@dataclass
class PaymentRequest:
    website_address: str
    amount: int  # in microUSDC
    content_hash: str
    session_token: str

@dataclass
class WebsiteInfo:
    domain: str
    ens_name: str
    reputation: int
    avg_payment: int
    category: str

class AgenticWebClient:
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.session_token = None
        self.agent_address = None
        
    async def initialize_agent(self, agent_id: str, private_key: str):
        """Initialize agent session"""
        # In production, this would create proper authentication
        self.agent_address = f"agent_{agent_id}"
        self.session_token = hashlib.sha256(f"{agent_id}_{private_key}".encode()).hexdigest()
        
    async def make_payment(self, website_domain: str, content_description: str) -> str:
        """Make micropayment to access website content"""
        try:
            # Get website info first
            website_info = await self.get_website_info(website_domain)
            
            # Calculate payment amount based on content type and reputation
            amount = self._calculate_payment_amount(website_info, content_description)
            
            payment_request = PaymentRequest(
                website_address=website_info.ens_name,
                amount=amount,
                content_hash=self._generate_content_hash(content_description),
                session_token=self.session_token
            )
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.base_url}/api/v1/payments/initiate",
                    json={
                        "agent_address": self.agent_address,
                        "website_address": payment_request.website_address,
                        "amount": payment_request.amount,
                        "asa_id": 31566704,  # USDC ASA on Algorand
                        "content_hash": payment_request.content_hash,
                        "session_token": payment_request.session_token
                    }
                ) as response:
                    if response.status == 200:
                        result = await response.json()
                        print(f"Payment successful: {result['transaction_id']}")
                        return result['transaction_id']
                    else:
                        error = await response.text()
                        raise Exception(f"Payment failed: {error}")
                        
        except Exception as e:
            print(f"Payment error: {str(e)}")
            raise
    
    async def get_website_info(self, domain: str) -> WebsiteInfo:
        """Get website information"""
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{self.base_url}/api/v1/websites/{domain}/info") as response:
                if response.status == 200:
                    data = await response.json()
                    return WebsiteInfo(
                        domain=data['domain'],
                        ens_name=data['ens_name'],
                        reputation=data['reputation_score'],
                        avg_payment=data.get('avg_payment', 5000),
                        category=data.get('category', 'general')
                    )
                else:
                    raise Exception(f"Website not found: {domain}")
    
    async def discover_websites(self, category: Optional[str] = None) -> List[WebsiteInfo]:
        """Discover websites by category"""
        async with aiohttp.ClientSession() as session:
            params = {"category": category} if category else {}
            async with session.get(f"{self.base_url}/api/v1/discovery/websites", params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    return [
                        WebsiteInfo(
                            domain=site['domain'],
                            ens_name=site['ens_name'],
                            reputation=site['reputation'],
                            avg_payment=site['avg_payment'],
                            category=site['category']
                        ) for site in data['websites']
                    ]
                else:
                    return []
    
    def _calculate_payment_amount(self, website_info: WebsiteInfo, content_description: str) -> int:
        """Calculate payment amount based on various factors"""
        base_amount = website_info.avg_payment
        
        # Adjust based on content type
        content_multiplier = 1.0
        if any(keyword in content_description.lower() for keyword in ['research', 'premium', 'exclusive']):
            content_multiplier = 2.0
        elif any(keyword in content_description.lower() for keyword in ['news', 'article']):
            content_multiplier = 1.0
        else:
            content_multiplier = 0.5
        
        # Adjust based on website reputation
        reputation_multiplier = website_info.reputation / 100.0
        
        final_amount = int(base_amount * content_multiplier * reputation_multiplier)
        
        # Ensure minimum payment
        return max(final_amount, 1000)  # Minimum 0.001 USDC
    
    def _generate_content_hash(self, content_description: str) -> str:
        """Generate content hash for tracking"""
        return hashlib.sha256(content_description.encode()).hexdigest()

# Example usage for AI agents
async def main():
    # Initialize agent
    agent = AgenticWebClient()
    await agent.initialize_agent("my-ai-agent-001", "demo-private-key")
    
    # Discover news websites
    news_websites = await agent.discover_websites(category="news")
    
    # Make payment to access content
    for website in news_websites[:3]:  # Access first 3 news sites
        try:
            tx_id = await agent.make_payment(
                website.domain,
                "Latest news articles and headlines"
            )
            print(f"Accessed {website.domain} with transaction {tx_id}")
            
            # Now the agent can safely scrape/access the content
            # Content provider is fairly compensated
            
        except Exception as e:
            print(f"Failed to access {website.domain}: {str(e)}")

if __name__ == "__main__":
    asyncio.run(main())
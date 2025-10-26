from flask import Flask, request, jsonify, Response
import json
import hashlib
from typing import Dict, Optional
import os

class AgenticWebIntegration:
    def __init__(self, website_domain: str, owner_address: str):
        self.website_domain = website_domain
        self.owner_address = owner_address
        self.registered = False
        
    def init_app(self, app: Flask):
        """Initialize Flask app with agentic web middleware"""
        
        @app.before_request
        def verify_agent_access():
            """Middleware to verify agent payments"""
            if request.path.startswith('/api/') or request.path == '/':
                return  # Skip for API routes and home page
                
            # Check for agent payment header
            payment_proof = request.headers.get('X-Agentic-Payment-Proof')
            agent_id = request.headers.get('X-Agentic-Agent-ID')
            
            if agent_id and not payment_proof:
                # Agent is accessing without payment
                return jsonify({
                    "error": "Payment required",
                    "message": "AI agents must make micropayment to access content",
                    "payment_endpoint": "/.well-known/agentic-payment"
                }), 402
            
            if payment_proof and agent_id:
                # Verify payment proof
                is_verified = self.verify_payment_proof(agent_id, payment_proof)
                if not is_verified:
                    return jsonify({
                        "error": "Invalid payment proof",
                        "message": "Payment verification failed"
                    }), 403
            
    def verify_payment_proof(self, agent_id: str, payment_proof: str) -> bool:
        """Verify that agent has made payment for content access"""
        # In production, this would verify on-chain transaction
        # For demo, we'll accept any proof that starts with "valid_"
        return payment_proof.startswith("valid_")
    
    def create_payment_challenge(self, agent_id: str, content_value: int) -> Dict:
        """Create payment challenge for agent"""
        challenge_id = hashlib.sha256(f"{agent_id}_{content_value}_{os.urandom(16)}".encode()).hexdigest()
        
        return {
            "challenge_id": challenge_id,
            "amount": content_value,
            "website_address": self.owner_address,
            "asa_id": 31566704,  # USDC on Algorand
            "expires_in": 300  # 5 minutes
        }

# Flask integration example
app = Flask(__name__)

# Initialize agentic web integration
web_integration = AgenticWebIntegration(
    website_domain="news.example.com",
    owner_address="WEBSITE_ALGORAND_ADDRESS"
)
web_integration.init_app(app)

@app.route('/')
def home():
    return """
    <html>
        <head>
            <title>Example News Site</title>
            <meta name="agentic-payment-required" content="true">
            <meta name="agentic-content-value" content="5000">
        </head>
        <body>
            <h1>Welcome to Example News</h1>
            <p>This content is available for AI agents through micropayments.</p>
        </body>
    </html>
    """

@app.route('/.well-known/agentic-payment')
def payment_info():
    """Endpoint for agents to get payment information"""
    return jsonify({
        "website_name": "Example News",
        "website_address": web_integration.owner_address,
        "supported_assets": [31566704],  # USDC
        "base_content_value": 5000,  # microUSDC
        "ens_name": "news_example_com.agentic.eth"
    })

@app.route('/api/content/articles')
def get_articles():
    """API endpoint that requires payment verification"""
    payment_proof = request.headers.get('X-Agentic-Payment-Proof')
    agent_id = request.headers.get('X-Agentic-Agent-ID')
    
    if not payment_proof or not web_integration.verify_payment_proof(agent_id, payment_proof):
        return jsonify({"error": "Payment required"}), 402
    
    # Return content since payment is verified
    articles = [
        {
            "title": "Breaking News Story",
            "content": "Full article content here...",
            "timestamp": "2024-01-15T10:00:00Z"
        }
    ]
    
    return jsonify({"articles": articles})

if __name__ == '__main__':
    app.run(port=5000, debug=True)
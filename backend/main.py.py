from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, List
import json
import asyncio

from services.algorand_client import AlgorandClient
from services.identity_manager import IdentityManager
from services.payment_processor import PaymentProcessor
from services.verification_service import VerificationService

app = FastAPI(title="Agentic Web Infrastructure", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
algorand_client = AlgorandClient()
identity_manager = IdentityManager()
payment_processor = PaymentProcessor(algorand_client)
verification_service = VerificationService()

class PaymentRequest(BaseModel):
    agent_address: str
    website_address: str
    amount: int
    asa_id: int  # USDC ASA ID on Algorand
    content_hash: str
    session_token: str

class WebsiteRegistration(BaseModel):
    domain: str
    owner_address: str
    verification_proof: str

class AgentRegistration(BaseModel):
    agent_id: str
    public_key: str
    metadata: Dict
    signature: str

@app.get("/")
async def root():
    return {"message": "Agentic Web Infrastructure API", "status": "active"}

@app.post("/api/v1/payments/initiate")
async def initiate_payment(payment_request: PaymentRequest):
    """Initiate micropayment from agent to website"""
    try:
        # Verify session and permissions
        is_valid = await verification_service.verify_agent_session(
            payment_request.agent_address,
            payment_request.session_token
        )
        
        if not is_valid:
            raise HTTPException(status_code=401, detail="Invalid session")
        
        # Process payment on Algorand
        tx_id = await payment_processor.process_micropayment(
            agent_address=payment_request.agent_address,
            website_address=payment_request.website_address,
            amount=payment_request.amount,
            asa_id=payment_request.asa_id,
            content_hash=payment_request.content_hash
        )
        
        return {
            "transaction_id": tx_id,
            "status": "pending",
            "amount": payment_request.amount,
            "asa_id": payment_request.asa_id
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/v1/websites/register")
async def register_website(registration: WebsiteRegistration):
    """Register a website for receiving payments"""
    try:
        # Verify domain ownership
        is_verified = await verification_service.verify_domain_ownership(
            registration.domain,
            registration.owner_address,
            registration.verification_proof
        )
        
        if not is_verified:
            raise HTTPException(status_code=400, detail="Domain ownership verification failed")
        
        # Register on Algorand contract
        tx_id = await identity_manager.register_website(
            domain=registration.domain,
            owner_address=registration.owner_address
        )
        
        # Create ENS subname
        ens_name = await identity_manager.create_ens_subname(registration.domain)
        
        return {
            "transaction_id": tx_id,
            "ens_name": ens_name,
            "status": "registered"
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/v1/agents/register")
async def register_agent(registration: AgentRegistration):
    """Register an AI agent"""
    try:
        # Verify agent signature
        is_valid = identity_manager.verify_agent_signature(
            registration.agent_id,
            registration.public_key,
            registration.signature
        )
        
        if not is_valid:
            raise HTTPException(status_code=400, detail="Invalid agent signature")
        
        # Register on Algorand
        tx_id = await identity_manager.register_agent(
            agent_id=registration.agent_id,
            public_key=registration.public_key,
            metadata=registration.metadata
        )
        
        return {
            "transaction_id": tx_id,
            "agent_id": registration.agent_id,
            "status": "registered"
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/v1/websites/{domain}/info")
async def get_website_info(domain: str):
    """Get website payment information and reputation"""
    try:
        info = await identity_manager.get_website_info(domain)
        return info
    except Exception as e:
        raise HTTPException(status_code=404, detail="Website not found")

@app.get("/api/v1/agents/{agent_id}/info")
async def get_agent_info(agent_id: str):
    """Get agent information and reputation"""
    try:
        info = await identity_manager.get_agent_info(agent_id)
        return info
    except Exception as e:
        raise HTTPException(status_code=404, detail="Agent not found")

@app.get("/api/v1/discovery/websites")
async def discover_websites(
    category: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
):
    """Discover registered websites with filtering"""
    try:
        websites = await identity_manager.discover_websites(
            category=category,
            limit=limit,
            offset=offset
        )
        return {"websites": websites, "total": len(websites)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
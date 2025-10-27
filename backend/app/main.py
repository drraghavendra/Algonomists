from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import List, Optional
import json
import os

from . import models, schemas, database
from .algorand_client import AlgorandClient
from .gemini_integration import GeminiClient

app = FastAPI(title="Agent Web Infrastructure API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize clients
algorand_client = AlgorandClient()
gemini_client = GeminiClient()

@app.on_event("startup")
async def startup():
    await database.init_db()

@app.get("/")
async def root():
    return {"message": "Agent Web Infrastructure API"}

@app.post("/websites/register", response_model=schemas.WebsiteRegistration)
async def register_website(registration: schemas.WebsiteRegistrationCreate):
    """Register a website for agent payments"""
    try:
        # Verify website ownership via header response
        verification_result = await gemini_client.verify_website_ownership(
            registration.domain,
            registration.verification_header
        )
        
        if not verification_result:
            raise HTTPException(status_code=400, detail="Website ownership verification failed")
        
        # Create ASA for website payments
        asa_id = await algorand_client.create_website_asa(
            registration.domain,
            registration.owner_address
        )
        
        # Register in ENS-like registry
        subname = await algorand_client.register_ens_subname(
            registration.domain,
            registration.owner_address
        )
        
        website_reg = models.WebsiteRegistration(
            domain=registration.domain,
            owner_address=registration.owner_address,
            asa_id=asa_id,
            ens_subname=subname,
            is_verified=True
        )
        
        await database.save_website_registration(website_reg)
        
        return website_reg
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/payments/initiate", response_model=schemas.PaymentSession)
async def initiate_payment(payment: schemas.PaymentInitiation):
    """Initiate a payment session for agent access"""
    try:
        # Create payment escrow
        escrow_address = await algorand_client.create_payment_escrow(
            payment.agent_address,
            payment.website_address,
            payment.amount,
            payment.asset_id
        )
        
        payment_session = models.PaymentSession(
            agent_address=payment.agent_address,
            website_address=payment.website_address,
            amount=payment.amount,
            asset_id=payment.asset_id,
            escrow_address=escrow_address,
            status="pending"
        )
        
        await database.save_payment_session(payment_session)
        
        return payment_session
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/payments/complete", response_model=schemas.PaymentSession)
async def complete_payment(completion: schemas.PaymentCompletion):
    """Complete a payment and release funds to website"""
    try:
        # Verify payment in escrow
        payment_verified = await algorand_client.verify_escrow_payment(
            completion.escrow_address,
            completion.amount
        )
        
        if not payment_verified:
            raise HTTPException(status_code=400, detail="Payment verification failed")
        
        # Release funds to website
        tx_id = await algorand_client.release_escrow_funds(
            completion.escrow_address,
            completion.website_address
        )
        
        # Update payment session
        payment_session = await database.get_payment_session(completion.session_id)
        payment_session.status = "completed"
        payment_session.tx_id = tx_id
        
        await database.update_payment_session(payment_session)
        
        return payment_session
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/websites/{domain}/info")
async def get_website_info(domain: str):
    """Get website registration and payment info"""
    website = await database.get_website_by_domain(domain)
    if not website:
        raise HTTPException(status_code=404, detail="Website not found")
    
    return website

@app.post("/agent/query")
async def agent_query(query: schemas.AgentQuery):
    """Process agent query with integrated payments"""
    try:
        # Verify website registration
        website = await database.get_website_by_domain(query.website_domain)
        if not website:
            raise HTTPException(status_code=404, detail="Website not registered")
        
        # Process payment
        payment_session = schemas.PaymentInitiation(
            agent_address=query.agent_address,
            website_address=website.owner_address,
            amount=query.payment_amount,
            asset_id=website.asa_id
        )
        
        payment_result = await initiate_payment(payment_session)
        
        # Execute agent query via Gemini
        query_result = await gemini_client.process_agent_query(
            query.website_url,
            query.query_type,
            query.query_parameters
        )
        
        # Complete payment
        completion = schemas.PaymentCompletion(
            session_id=payment_result.id,
            escrow_address=payment_result.escrow_address,
            website_address=website.owner_address,
            amount=query.payment_amount
        )
        
        await complete_payment(completion)
        
        return {
            "query_result": query_result,
            "payment_status": "completed",
            "session_id": payment_result.id
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/analytics/website/{domain}")
async def get_website_analytics(domain: str):
    """Get analytics for website payments and agent interactions"""
    analytics = await database.get_website_analytics(domain)
    return analytics

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
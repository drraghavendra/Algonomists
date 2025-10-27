from typing import List, Optional
import json
from . import models

# In-memory database for demo (replace with PostgreSQL in production)
website_registrations = {}
payment_sessions = {}
agent_interactions = {}

async def init_db():
    """Initialize database (in production, this would setup PostgreSQL)"""
    print("Database initialized")

async def save_website_registration(registration: models.WebsiteRegistration):
    """Save website registration"""
    website_registrations[registration.domain] = registration
    return registration

async def get_website_by_domain(domain: str) -> Optional[models.WebsiteRegistration]:
    """Get website by domain"""
    return website_registrations.get(domain)

async def save_payment_session(session: models.PaymentSession):
    """Save payment session"""
    payment_sessions[session.id] = session
    return session

async def get_payment_session(session_id: str) -> Optional[models.PaymentSession]:
    """Get payment session by ID"""
    return payment_sessions.get(session_id)

async def update_payment_session(session: models.PaymentSession):
    """Update payment session"""
    payment_sessions[session.id] = session
    return session

async def save_agent_interaction(interaction: models.AgentInteraction):
    """Save agent interaction"""
    agent_interactions[interaction.id] = interaction
    return interaction

async def get_website_analytics(domain: str) -> dict:
    """Get analytics for website"""
    # Calculate analytics from stored data
    website_payments = [p for p in payment_sessions.values() 
                       if p.website_address == website_registrations.get(domain).owner_address]
    
    total_payments = len(website_payments)
    total_revenue = sum(p.amount for p in website_payments)
    
    website_interactions = [i for i in agent_interactions.values() 
                          if i.website_domain == domain]
    
    successful_interactions = len([i for i in website_interactions if i.result_data])
    failed_interactions = len([i for i in website_interactions if not i.result_data])
    
    return {
        "total_payments": total_payments,
        "total_revenue": total_revenue,
        "successful_interactions": successful_interactions,
        "failed_interactions": failed_interactions,
        "popular_queries": [],
        "revenue_by_asset": {"ALGO": total_revenue}
    }
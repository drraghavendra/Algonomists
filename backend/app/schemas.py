from pydantic import BaseModel, validator
from typing import Optional, Dict, Any, List
from decimal import Decimal

class WebsiteRegistrationCreate(BaseModel):
    domain: str
    owner_address: str
    verification_header: str

class WebsiteRegistration(BaseModel):
    domain: str
    owner_address: str
    asa_id: Optional[int]
    ens_subname: Optional[str]
    is_verified: bool

class PaymentInitiation(BaseModel):
    agent_address: str
    website_address: str
    amount: int
    asset_id: int

class PaymentCompletion(BaseModel):
    session_id: str
    escrow_address: str
    website_address: str
    amount: int

class AgentQuery(BaseModel):
    agent_address: str
    website_domain: str
    website_url: str
    query_type: str
    query_parameters: Dict[str, Any]
    payment_amount: int

    @validator('payment_amount')
    def validate_amount(cls, v):
        if v <= 0:
            raise ValueError('Payment amount must be positive')
        return v

class AnalyticsResponse(BaseModel):
    total_payments: int
    total_revenue: int
    successful_interactions: int
    failed_interactions: int
    popular_queries: List[Dict[str, Any]]
    revenue_by_asset: Dict[str, int]
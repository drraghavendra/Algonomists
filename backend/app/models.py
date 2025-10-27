from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime
import uuid

class WebsiteRegistration(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    domain: str
    owner_address: str
    asa_id: Optional[int] = None
    ens_subname: Optional[str] = None
    is_verified: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        from_attributes = True

class PaymentSession(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_address: str
    website_address: str
    amount: int
    asset_id: int  # 0 for ALGO, >0 for ASA
    escrow_address: str
    tx_id: Optional[str] = None
    status: str  # pending, completed, failed
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None

class AgentInteraction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_address: str
    website_domain: str
    query_type: str
    payment_amount: int
    payment_asset: int
    result_data: Optional[Dict[str, Any]] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
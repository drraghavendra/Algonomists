from algosdk import account, mnemonic, encoding
from algosdk.v2client import algod
from algosdk.future import transaction
from algosdk.abi import Contract
import json
import os
import asyncio
from typing import Optional, Dict, Any

class AlgorandClient:
    def __init__(self):
        self.algod_address = os.getenv("ALGOD_ADDRESS", "https://testnet-api.algonode.cloud")
        self.algod_token = os.getenv("ALGOD_TOKEN", "")
        self.algod_client = algod.AlgodClient(self.algod_token, self.algod_address)
        
        self.indexer_address = os.getenv("INDEXER_ADDRESS", "https://testnet-idx.algonode.cloud")
        
        # Load contracts
        self.payment_escrow_contract = self._load_contract("payment_escrow")
        self.website_registry_contract = self._load_contract("website_registry")
    
    def _load_contract(self, contract_name: str) -> Optional[Contract]:
        """Load ABI contract definition"""
        try:
            contract_path = f"contracts/{contract_name}.json"
            with open(contract_path, 'r') as f:
                contract_dict = json.load(f)
            return Contract.from_dict(contract_dict)
        except FileNotFoundError:
            print(f"Contract {contract_name} not found")
            return None
    
    async def create_website_asa(self, domain: str, owner_address: str) -> int:
        """Create ASA for website payments"""
        try:
            params = self.algod_client.suggested_params()
            
            txn = transaction.AssetConfigTxn(
                sender=owner_address,
                sp=params,
                total=1000000,  # 1M tokens
                decimals=6,
                default_frozen=False,
                unit_name=domain[:8].upper(),
                asset_name=f"{domain} Access Token",
                manager=owner_address,
                reserve=owner_address,
                freeze=owner_address,
                clawback=owner_address,
                url=f"https://{domain}/metadata.json",
                metadata_hash=b''
            )
            
            # Note: In production, this would be signed by the owner
            # For demo, we return a mock ASA ID
            return 123456  # Mock ASA ID
            
        except Exception as e:
            print(f"Error creating ASA: {e}")
            raise
    
    async def create_payment_escrow(self, agent_address: str, website_address: str, 
                                  amount: int, asset_id: int) -> str:
        """Create payment escrow smart contract"""
        try:
            # Generate escrow account
            escrow_private_key, escrow_address = account.generate_account()
            
            # Fund escrow with minimum balance (in production)
            # For demo, return the address
            return escrow_address
            
        except Exception as e:
            print(f"Error creating escrow: {e}")
            raise
    
    async def verify_escrow_payment(self, escrow_address: str, expected_amount: int) -> bool:
        """Verify payment in escrow account"""
        try:
            account_info = self.algod_client.account_info(escrow_address)
            balance = account_info.get('amount', 0)
            
            return balance >= expected_amount
            
        except Exception as e:
            print(f"Error verifying escrow: {e}")
            return False
    
    async def release_escrow_funds(self, escrow_address: str, website_address: str) -> str:
        """Release escrow funds to website"""
        try:
            params = self.algod_client.suggested_params()
            
            # Create transaction from escrow to website
            txn = transaction.PaymentTxn(
                sender=escrow_address,
                sp=params,
                receiver=website_address,
                amt=1000000,  # 1 ALGO for demo
                note=b"Agent payment release"
            )
            
            # In production, this would be signed with escrow private key
            # For demo, return mock transaction ID
            return "mock_tx_id_123456"
            
        except Exception as e:
            print(f"Error releasing funds: {e}")
            raise
    
    async def register_ens_subname(self, domain: str, owner_address: str) -> str:
        """Register ENS-like subname for website"""
        # This would integrate with Algorand Name Service or similar
        # For demo, return formatted subname
        clean_domain = domain.replace('.', '-')
        return f"{clean_domain}.agentweb.alg"
    
    async def get_account_balance(self, address: str, asset_id: int = 0) -> int:
        """Get account balance for ALGO or ASA"""
        try:
            account_info = self.algod_client.account_info(address)
            
            if asset_id == 0:
                return account_info.get('amount', 0)
            else:
                for asset in account_info.get('assets', []):
                    if asset['asset-id'] == asset_id:
                        return asset['amount']
                return 0
                
        except Exception as e:
            print(f"Error getting balance: {e}")
            return 0
    
    async def send_payment(self, sender_private_key: str, receiver: str, 
                          amount: int, asset_id: int = 0) -> str:
        """Send payment transaction"""
        try:
            sender_address = account.address_from_private_key(sender_private_key)
            params = self.algod_client.suggested_params()
            
            if asset_id == 0:
                txn = transaction.PaymentTxn(
                    sender=sender_address,
                    sp=params,
                    receiver=receiver,
                    amt=amount
                )
            else:
                txn = transaction.AssetTransferTxn(
                    sender=sender_address,
                    sp=params,
                    receiver=receiver,
                    amt=amount,
                    index=asset_id
                )
            
            signed_txn = txn.sign(sender_private_key)
            tx_id = self.algod_client.send_transaction(signed_txn)
            
            return tx_id
            
        except Exception as e:
            print(f"Error sending payment: {e}")
            raise
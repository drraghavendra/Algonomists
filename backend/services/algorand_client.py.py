from algosdk import account, encoding
from algosdk.v2client import algod
from algosdk.future import transaction
from algosdk.abi import Contract
import json
import asyncio
import os
from typing import Dict, Any, Optional

class AlgorandClient:
    def __init__(self):
        self.algod_address = os.getenv("ALGOD_ADDRESS", "https://testnet-api.algonode.cloud")
        self.algod_token = os.getenv("ALGOD_TOKEN", "")
        self.algod_client = algod.AlgodClient(self.algod_token, self.algod_address)
        
        # Load contracts
        self.micropayment_contract = self._load_contract("asa_micropayments")
        self.agent_registry_contract = self._load_contract("agent_registry")
    
    def _load_contract(self, contract_name: str) -> Contract:
        """Load ABI and create contract object"""
        with open(f"contracts/{contract_name}.abi", "r") as f:
            abi = json.load(f)
        return Contract(abi)
    
    async def process_micropayment(
        self,
        agent_address: str,
        website_address: str,
        amount: int,
        asa_id: int,
        content_hash: str
    ) -> str:
        """Process micropayment using ASA"""
        try:
            # Get suggested params
            params = self.algod_client.suggested_params()
            
            # Create application call transaction
            app_args = [
                "payment".encode(),
                amount.to_bytes(8, 'big'),
                asa_id.to_bytes(8, 'big')
            ]
            
            txn = transaction.ApplicationCallTxn(
                sender=agent_address,
                sp=params,
                index=self.micropayment_contract.app_id,
                on_complete=transaction.OnComplete.NoOpOC,
                app_args=app_args,
                accounts=[website_address],
                foreign_assets=[asa_id]
            )
            
            # Note: In production, agent would sign this transaction
            # For demo, we're using a simplified flow
            
            # Send transaction
            tx_id = self.algod_client.send_transaction(txn)
            
            # Wait for confirmation
            await self._wait_for_confirmation(tx_id)
            
            return tx_id
            
        except Exception as e:
            raise Exception(f"Payment processing failed: {str(e)}")
    
    async def register_website(self, domain: str, owner_address: str) -> str:
        """Register website on Algorand contract"""
        try:
            params = self.algod_client.suggested_params()
            
            app_args = [
                "register_website".encode(),
                domain.encode()
            ]
            
            txn = transaction.ApplicationCallTxn(
                sender=owner_address,
                sp=params,
                index=self.micropayment_contract.app_id,
                on_complete=transaction.OnComplete.NoOpOC,
                app_args=app_args,
                accounts=[owner_address]
            )
            
            tx_id = self.algod_client.send_transaction(txn)
            await self._wait_for_confirmation(tx_id)
            
            return tx_id
            
        except Exception as e:
            raise Exception(f"Website registration failed: {str(e)}")
    
    async def register_agent(self, agent_id: str, public_key: str, metadata: Dict) -> str:
        """Register agent on Algorand contract"""
        try:
            params = self.algod_client.suggested_params()
            
            # Store metadata on IPFS and get hash
            metadata_hash = await self._store_metadata_on_ipfs(metadata)
            
            app_args = [
                "register_agent".encode(),
                agent_id.encode(),
                metadata_hash.encode()
            ]
            
            txn = transaction.ApplicationCallTxn(
                sender=public_key,
                sp=params,
                index=self.agent_registry_contract.app_id,
                on_complete=transaction.OnComplete.NoOpOC,
                app_args=app_args
            )
            
            tx_id = self.algod_client.send_transaction(txn)
            await self._wait_for_confirmation(tx_id)
            
            return tx_id
            
        except Exception as e:
            raise Exception(f"Agent registration failed: {str(e)}")
    
    async def _wait_for_confirmation(self, tx_id: str, timeout: int = 10):
        """Wait for transaction confirmation"""
        last_round = self.algod_client.status()["last-round"]
        current_round = last_round + 1
        
        while current_round < last_round + timeout:
            try:
                pending_txn = self.algod_client.pending_transaction_info(tx_id)
                if pending_txn.get("confirmed-round", 0) > 0:
                    return pending_txn
                elif pending_txn["pool-error"]:
                    raise Exception(f"Transaction failed: {pending_txn['pool-error']}")
            except Exception as e:
                pass
            
            await asyncio.sleep(1)
            current_round += 1
        
        raise Exception("Transaction confirmation timeout")
    
    async def _store_metadata_on_ipfs(self, metadata: Dict) -> str:
        """Store metadata on IPFS and return hash"""
        # Implementation would integrate with IPFS
        # For demo, return a mock hash
        return f"Qm{hash(json.dumps(metadata))}"
    
    def get_balance(self, address: str, asa_id: Optional[int] = None) -> int:
        """Get account balance for ALGO or ASA"""
        account_info = self.algod_client.account_info(address)
        
        if asa_id is None:
            return account_info.get("amount", 0)
        else:
            for asset in account_info.get("assets", []):
                if asset["asset-id"] == asa_id:
                    return asset["amount"]
            return 0
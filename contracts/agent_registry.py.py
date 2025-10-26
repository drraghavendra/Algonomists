from pyteal import *

def approval_program():
    # Agent Registry Contract
    
    on_creation = Seq([
        AppGlobalPut(Bytes("admin"), Txn.sender()),
        AppGlobalPut(Bytes("agent_count"), Int(0)),
        Return(Int(1))
    ])
    
    def register_agent():
        agent_address = Txn.sender()
        agent_id = Txn.application_args[1]  # Unique agent identifier
        metadata_hash = Txn.application_args[2]  # IPFS hash of agent metadata
        
        return Seq([
            # Check if agent already registered
            agent_key = Concat(Bytes("agent_"), agent_id),
            Assert(AppGlobalGet(agent_key) == Int(0)),
            
            # Register agent
            AppGlobalPut(agent_key, agent_address),
            AppGlobalPut(Bytes("agent_count"), AppGlobalGet(Bytes("agent_count")) + Int(1)),
            
            # Store agent metadata
            AppLocalPut(agent_address, Bytes("registered"), Int(1)),
            AppLocalPut(agent_address, Bytes("agent_id"), agent_id),
            AppLocalPut(agent_address, Bytes("metadata_hash"), metadata_hash),
            AppLocalPut(agent_address, Bytes("reputation"), Int(100)),  # Initial reputation score
            
            Return(Int(1))
        ])
    
    def update_reputation():
        agent_address = Txn.accounts[1]
        reputation_change = Btoi(Txn.application_args[1])
        
        return Seq([
            Assert(Txn.sender() == AppGlobalGet(Bytes("admin"))),
            
            current_reputation = AppLocalGet(agent_address, Bytes("reputation")),
            new_reputation = current_reputation + reputation_change,
            
            # Ensure reputation stays within bounds
            adjusted_reputation = If(new_reputation < Int(0), Int(0), 
                                   If(new_reputation > Int(1000), Int(1000), new_reputation)),
            
            AppLocalPut(agent_address, Bytes("reputation"), adjusted_reputation),
            Return(Int(1))
        ])
    
    handle_noop = Cond(
        [Txn.application_args[0] == Bytes("register_agent"), register_agent()],
        [Txn.application_args[0] == Bytes("update_reputation"), update_reputation()],
    )
    
    program = Cond(
        [Txn.application_id() == Int(0), on_creation],
        [Txn.on_completion() == OnComplete.NoOp, handle_noop],
        [Txn.on_completion() == OnComplete.UpdateApplication, Return(Txn.sender() == AppGlobalGet(Bytes("admin")))],
        [Txn.on_completion() == OnComplete.DeleteApplication, Return(Txn.sender() == AppGlobalGet(Bytes("admin")))],
        [Txn.on_completion() == OnComplete.CloseOut, Return(Int(1))],
        [Txn.on_completion() == OnComplete.OptIn, Return(Int(1))],
    )
    
    return program

def clear_state_program():
    return Return(Int(1))
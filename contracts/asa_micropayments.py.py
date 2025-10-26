from pyteal import *

def approval_program():
    # Constants
    platform_fee = Int(100)  # 1% in basis points
    fee_denominator = Int(10000)
    min_payment = Int(1000)  # Minimum micropayment amount
    
    # On deployment
    on_creation = Seq([
        AppGlobalPut(Bytes("admin"), Txn.sender()),
        AppGlobalPut(Bytes("platform_fee"), platform_fee),
        AppGlobalPut(Bytes("total_volume"), Int(0)),
        AppGlobalPut(Bytes("total_transactions"), Int(0)),
        Return(Int(1))
    ])
    
    # Handle payment from agent to website
    def handle_payment():
        website = Txn.accounts[1]  # Website account
        agent = Txn.sender()       # Agent account
        payment_amount = Btoi(Txn.application_args[1])
        asa_id = Btoi(Txn.application_args[2])
        
        # Calculate fees
        platform_fee_amount = payment_amount * AppGlobalGet(Bytes("platform_fee")) / fee_denominator
        website_amount = payment_amount - platform_fee_amount
        
        return Seq([
            Assert(payment_amount >= min_payment),
            Assert(Txn.group_index() == Int(0)),
            
            # Transfer payment to website (minus platform fee)
            InnerTxnBuilder.Begin(),
            InnerTxnBuilder.SetFields({
                TxnField.type_enum: TxnType.AssetTransfer,
                TxnField.xfer_asset: asa_id,
                TxnField.asset_amount: website_amount,
                TxnField.sender: Global.current_application_address(),
                TxnField.asset_receiver: website,
            }),
            InnerTxnBuilder.Next(),
            
            # Transfer platform fee
            InnerTxnBuilder.SetFields({
                TxnField.type_enum: TxnType.AssetTransfer,
                TxnField.xfer_asset: asa_id,
                TxnField.asset_amount: platform_fee_amount,
                TxnField.sender: Global.current_application_address(),
                TxnField.asset_receiver: AppGlobalGet(Bytes("admin")),
            }),
            InnerTxnBuilder.Submit(),
            
            # Update statistics
            AppGlobalPut(Bytes("total_volume"), AppGlobalGet(Bytes("total_volume")) + payment_amount),
            AppGlobalPut(Bytes("total_transactions"), AppGlobalGet(Bytes("total_transactions")) + Int(1)),
            
            Return(Int(1))
        ])
    
    # Register website
    def register_website():
        website_address = Txn.accounts[1]
        website_domain = Txn.application_args[1]
        
        return Seq([
            Assert(Txn.sender() == AppGlobalGet(Bytes("admin"))),
            
            # Store website registration
            AppLocalPut(website_address, Bytes("registered"), Int(1)),
            AppLocalPut(website_address, Bytes("domain"), website_domain),
            AppLocalPut(website_address, Bytes("total_earned"), Int(0)),
            
            Return(Int(1))
        ])
    
    # Main router
    handle_noop = Cond(
        [Txn.application_args[0] == Bytes("payment"), handle_payment()],
        [Txn.application_args[0] == Bytes("register_website"), register_website()],
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

if __name__ == "__main__":
    with open("asa_micropayments_approval.teal", "w") as f:
        compiled = compileTeal(approval_program(), mode=Mode.Application, version=6)
        f.write(compiled)
    
    with open("asa_micropayments_clear.teal", "w") as f:
        compiled = compileTeal(clear_state_program(), mode=Mode.Application, version=6)
        f.write(compiled)
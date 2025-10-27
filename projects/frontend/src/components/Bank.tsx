import { useEffect, useMemo, useState } from 'react'
import { useWallet } from '@txnlab/use-wallet-react'
import { useSnackbar } from 'notistack'
import algosdk, { getApplicationAddress, makePaymentTxnWithSuggestedParamsFromObject } from 'algosdk'
import { AlgorandClient, microAlgos } from '@algorandfoundation/algokit-utils'
import { BankClient, BankFactory } from '../contracts/Bank'
import { getAlgodConfigFromViteEnvironment, getIndexerConfigFromViteEnvironment } from '../utils/network/getAlgoClientConfigs'

interface BankProps {
  openModal: boolean
  closeModal: () => void
}

type Statement = {
  id: string
  round: number
  amount: number
  type: 'deposit' | 'withdrawal'
  sender: string
  receiver: string
  timestamp?: number
}

const Bank = ({ openModal, closeModal }: BankProps) => {
  const { enqueueSnackbar } = useSnackbar()
  const { activeAddress, transactionSigner } = useWallet()
  const algodConfig = getAlgodConfigFromViteEnvironment()
  const indexerConfig = getIndexerConfigFromViteEnvironment()
  const algorand = useMemo(() => AlgorandClient.fromConfig({ algodConfig, indexerConfig }), [algodConfig, indexerConfig])
  const [appId, setAppId] = useState<number | ''>(1002)
  const [deploying, setDeploying] = useState<boolean>(false)
  const [depositAmount, setDepositAmount] = useState<string>('')
  const [memo, setMemo] = useState<string>('')
  const [withdrawAmount, setWithdrawAmount] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [statements, setStatements] = useState<Statement[]>([])
  const [depositors, setDepositors] = useState<Array<{ address: string; amount: string }>>([])

  useEffect(() => {
    algorand.setDefaultSigner(transactionSigner)
  }, [algorand, transactionSigner])

  const appAddress = useMemo(() => (appId && appId > 0 ? String(getApplicationAddress(appId)) : ''), [appId])

  const refreshStatements = async () => {
    try {
      if (!appId || !activeAddress) return
      const idx = algorand.client.indexer
      const appAddr = String(getApplicationAddress(appId))
      const allTransactions: Statement[] = []
      
      console.log('Searching for app transactions with app ID:', appId)
      
      // Search for application call transactions from user
      const appTxRes = await idx
        .searchForTransactions()
        .address(activeAddress)
        .txType('appl')
        .do()
      
      console.log('App call transactions found:', appTxRes.transactions?.length || 0)
      
      // Process application call transactions (deposits/withdrawals)
      const appTransactions = (appTxRes.transactions || [])
        .filter((t: any) => {
          // Filter for transactions calling our specific app
          const isOurApp = t.applicationTransaction && 
                          Number(t.applicationTransaction.applicationId) === Number(appId)
          console.log('Checking transaction:', t.id, {
            hasAppTxn: !!t.applicationTransaction,
            appId: t.applicationTransaction?.applicationId,
            targetAppId: Number(appId),
            isOurApp,
            sender: t.sender,
            activeAddress
          })
          return isOurApp
        })
        .map((t: any) => {
        // Determine transaction type from logs or method name
        let amount = 1 // Default amount
        let type: 'deposit' | 'withdrawal' = 'deposit'
        
        // Check logs for method name
        if (t.logs && t.logs.length > 0) {
          const logStr = t.logs.join(' ')
          if (logStr.includes('withdraw') || logStr.includes('Withdraw')) {
            type = 'withdrawal'
          }
        }
        
        // Check inner transactions for actual payment amounts
        if (t.innerTxns && t.innerTxns.length > 0) {
          console.log('Inner transactions for', t.id, ':', t.innerTxns)
          for (const innerTxn of t.innerTxns) {
            if (innerTxn.paymentTransaction) {
              amount = Number(innerTxn.paymentTransaction.amount) / 1000000
              // If there's an inner payment from app to user, it's definitely a withdrawal
              if (innerTxn.sender === appAddr && innerTxn.paymentTransaction.receiver === activeAddress) {
                type = 'withdrawal'
              }
              console.log('Found payment in inner txn:', { amount, type, sender: innerTxn.sender, receiver: innerTxn.paymentTransaction.receiver })
              break
            }
          }
        }
        
        // If no inner transactions found but it's a withdraw call, still show it
        console.log('Transaction', t.id, 'type:', type, 'amount:', amount)
        
        return {
          id: t.id,
          round: Number(t.confirmedRound || t['confirmed-round']),
          amount,
          type,
          sender: t.sender,
          receiver: appAddr,
          timestamp: Number(t.roundTime || t['round-time']),
        }
      })
      
      allTransactions.push(...appTransactions)
      
      // Also search for direct payment transactions to/from app address
      const payTxRes = await idx
        .searchForTransactions()
        .address(appAddr)
        .txType('pay')
        .do()
      
      console.log('Payment transactions found:', payTxRes.transactions?.length || 0)
      
      const paymentTransactions = (payTxRes.transactions || [])
        .filter((t: any) => {
          // Only include withdrawals (app to user) and exclude deposits (user to app) 
          // since deposits are already captured in app transactions
          return (t.sender === appAddr && t.paymentTransaction?.receiver === activeAddress)
        })
        .map((t: any) => ({
          id: t.id,
          round: Number(t.confirmedRound || t['confirmed-round']),
          amount: Number(t.paymentTransaction.amount) / 1000000,
          type: t.sender === activeAddress ? 'deposit' as const : 'withdrawal' as const,
          sender: t.sender,
          receiver: t.paymentTransaction.receiver,
          timestamp: Number(t.roundTime || t['round-time']),
        }))
      
      allTransactions.push(...paymentTransactions)
      
      console.log('Total relevant transactions:', allTransactions.length)
      setStatements(allTransactions.sort((a, b) => b.round - a.round))
    } catch (e) {
      console.error('Error in refreshStatements:', e)
      enqueueSnackbar(`Error loading statements: ${(e as Error).message}`, { variant: 'error' })
    }
  }

  const refreshDepositors = async () => {
    try {
      if (!appId) return
      const algod = algorand.client.algod
      const boxes = await algod.getApplicationBoxes(appId).do()
      const list = [] as Array<{ address: string; amount: string }>
      for (const b of boxes.boxes as Array<{ name: Uint8Array }>) {
        // Skip empty or non-account keys if any
        const nameBytes: Uint8Array = b.name
        if (nameBytes.length !== 32) continue
        const box = await algod.getApplicationBoxByName(appId, nameBytes).do()
        const addr = algosdk.encodeAddress(nameBytes)
        const valueBuf: Uint8Array = box.value
        // UInt64 big-endian
        const amountMicroAlgos = BigInt(new DataView(Buffer.from(valueBuf).buffer).getBigUint64(0, false))
        const amountAlgos = (Number(amountMicroAlgos) / 1000000).toString()
        list.push({ address: addr, amount: amountAlgos })
      }
      setDepositors(list)
    } catch (e) {
      enqueueSnackbar(`Error loading depositors: ${(e as Error).message}`, { variant: 'error' })
    }
  }

  useEffect(() => {
    void refreshStatements()
    void refreshDepositors()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, activeAddress])

  const deposit = async () => {
    try {
      if (!activeAddress || activeAddress.trim() === '') throw new Error('Please connect your wallet first')
      if (!transactionSigner) throw new Error('Wallet signer unavailable')
      if (!appId || appId <= 0) throw new Error('Enter valid App ID')
      const amountAlgos = Number(depositAmount)
      if (!amountAlgos || amountAlgos <= 0) throw new Error('Enter amount in Algos')
      const amountMicroAlgos = Math.round(amountAlgos * 1000000) // Convert to microAlgos
      setLoading(true)

      const sp = await algorand.client.algod.getTransactionParams().do()
      const appAddr = getApplicationAddress(appId)
      
      if (!algosdk.isValidAddress(activeAddress)) throw new Error('Invalid wallet address')
      if (!algosdk.isValidAddress(String(appAddr))) throw new Error('Invalid app address; check App ID')
      
      const payTxn = makePaymentTxnWithSuggestedParamsFromObject({
        sender: activeAddress,
        receiver: appAddr,
        amount: amountMicroAlgos,
        suggestedParams: sp,
      })

      const client = new BankClient({ 
        appId: BigInt(appId), 
        algorand, 
        defaultSigner: transactionSigner 
      })
      
      const res = await client.send.deposit({ 
        args: { 
          memo: memo || '', 
          payTxn: { txn: payTxn, signer: transactionSigner } 
        }, 
        sender: activeAddress 
      })
      
      const confirmedRound = (res.confirmation as any)?.['confirmed-round']
      enqueueSnackbar(`Deposited successfully in round ${confirmedRound}`, { variant: 'success' })
      setDepositAmount('')
      setMemo('')
      void refreshStatements()
      void refreshDepositors()
    } catch (e) {
      enqueueSnackbar(`Deposit failed: ${(e as Error).message}`, { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const withdraw = async () => {
    try {
      if (!activeAddress || activeAddress.trim() === '') throw new Error('Please connect your wallet first')
      if (!transactionSigner) throw new Error('Wallet signer unavailable')
      if (!appId || appId <= 0) throw new Error('Enter valid App ID')
      const amount = Number(withdrawAmount)
      if (!amount || amount <= 0) throw new Error('Enter amount in Algos')
      const amountMicroAlgos = Math.round(amount * 1000000) // Convert to microAlgos
      setLoading(true)

      const client = new BankClient({ 
        appId: BigInt(appId), 
        algorand, 
        defaultSigner: transactionSigner 
      })
      
      const res = await client.send.withdraw({ 
        args: { amount: amountMicroAlgos }, 
        sender: activeAddress,
        extraFee: microAlgos(2000)
      })
      
      const confirmedRound = (res.confirmation as any)?.['confirmed-round']
      enqueueSnackbar(`Withdraw executed in round ${confirmedRound}`, { variant: 'success' })
      setWithdrawAmount('')
      void refreshStatements()
      void refreshDepositors()
    } catch (e) {
      enqueueSnackbar(`Withdraw failed: ${(e as Error).message}`, { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const deployContract = async () => {
    try {
      if (!activeAddress) throw new Error('Connect wallet')
      setDeploying(true)
      const factory = new BankFactory({ defaultSender: activeAddress, algorand })
      const result = await factory.send.create.bare()
      const newId = Number(result.appClient.appId)
      setAppId(newId)
      enqueueSnackbar(`Bank deployed. App ID: ${newId}`, { variant: 'success' })
    } catch (e) {
      enqueueSnackbar(`Deploy failed: ${(e as Error).message}`, { variant: 'error' })
    } finally {
      setDeploying(false)
    }
  }

  return (
    <dialog id="bank_modal" className={`modal ${openModal ? 'modal-open' : ''} bg-black/50`}>
      <form method="dialog" className="modal-box max-w-6xl w-full h-[90vh] p-0 bg-gradient-to-br from-slate-50 to-slate-100">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold text-slate-800">Bank Dashboard</h3>
              <p className="text-sm text-slate-600 mt-1">Algorand Smart Contract Banking Interface</p>
            </div>
            <button 
              className="btn btn-sm btn-circle btn-ghost text-slate-500 hover:text-slate-700" 
              onClick={closeModal}
              disabled={loading}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* App Configuration Section */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
            <h4 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
              <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
              Application Configuration
            </h4>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Application ID</label>
                  <input 
                    className="input input-bordered w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                    type="number" 
                    value={appId} 
                    onChange={(e) => setAppId(e.target.value === '' ? '' : Number(e.target.value))} 
                    placeholder="Enter deployed Bank App ID" 
                  />
                </div>
                
                {appAddress && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <label className="block text-sm font-medium text-blue-800 mb-2">Application Address</label>
                    <div className="text-sm text-blue-700 break-all font-mono bg-white p-2 rounded border">
                      {appAddress}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex flex-col justify-center">
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <h5 className="font-medium text-slate-700 mb-2">Deploy New Contract</h5>
                  <button 
                    className={`btn btn-accent w-full ${deploying ? 'loading' : ''}`} 
                    disabled={deploying || !activeAddress} 
                    onClick={(e) => { e.preventDefault(); void deployContract() }}
                  >
                    {deploying ? 'Deploying...' : 'Deploy Bank Contract'}
                  </button>
                  <p className="text-xs text-slate-500 mt-2 text-center">Or enter an existing App ID above</p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Deposit Panel */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h4 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                Deposit Funds
              </h4>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Memo (Optional)</label>
                  <input 
                    className="input input-bordered w-full focus:ring-2 focus:ring-green-500 focus:border-green-500" 
                    placeholder="Add a memo for this deposit" 
                    value={memo} 
                    onChange={(e) => setMemo(e.target.value)} 
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Amount (ALGO)</label>
                  <input 
                    className="input input-bordered w-full focus:ring-2 focus:ring-green-500 focus:border-green-500" 
                    placeholder="0.000000" 
                    type="number" 
                    step="0.000001" 
                    value={depositAmount} 
                    onChange={(e) => setDepositAmount(e.target.value)} 
                  />
                </div>
                
                <button 
                  className={`btn btn-primary w-full ${loading ? 'loading' : ''}`} 
                  disabled={loading || !activeAddress || !appId} 
                  onClick={(e) => { e.preventDefault(); void deposit() }}
                >
                  {loading ? 'Processing...' : 'Deposit ALGO'}
                </button>
              </div>
            </div>

            {/* Withdraw Panel */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h4 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
                <span className="w-2 h-2 bg-orange-500 rounded-full mr-3"></span>
                Withdraw Funds
              </h4>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Amount (ALGO)</label>
                  <input 
                    className="input input-bordered w-full focus:ring-2 focus:ring-orange-500 focus:border-orange-500" 
                    placeholder="0.000000" 
                    type="number" 
                    step="0.000001" 
                    value={withdrawAmount} 
                    onChange={(e) => setWithdrawAmount(e.target.value)} 
                  />
                </div>
                
                <button 
                  className={`btn btn-secondary w-full ${loading ? 'loading' : ''}`} 
                  disabled={loading || !activeAddress || !appId} 
                  onClick={(e) => { e.preventDefault(); void withdraw() }}
                >
                  {loading ? 'Processing...' : 'Withdraw ALGO'}
                </button>
              </div>
            </div>
          </div>

          {/* Status Area */}
          {loading && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-center">
                <div className="loading loading-spinner loading-sm text-blue-600 mr-3"></div>
                <span className="text-blue-800 font-medium">Processing transaction...</span>
              </div>
            </div>
          )}

          {/* Data Tables */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Statements Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="p-6 border-b border-slate-200">
                <h4 className="text-lg font-semibold text-slate-800 flex items-center">
                  <span className="w-2 h-2 bg-purple-500 rounded-full mr-3"></span>
                  Transaction Statements
                </h4>
                <p className="text-sm text-slate-600 mt-1">Your recent deposits and withdrawals</p>
              </div>
              
              <div className="max-h-80 overflow-y-auto">
                {statements.length === 0 ? (
                  <div className="p-6 text-center text-slate-500">
                    <div className="text-4xl mb-2">📊</div>
                    <p>No transactions found</p>
                    <p className="text-sm">Your transaction history will appear here</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {statements.map((s) => (
                      <div key={s.id} className="p-4 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className={`w-3 h-3 rounded-full ${s.type === 'deposit' ? 'bg-green-500' : 'bg-orange-500'}`}></div>
                            <div>
                              <span className={`font-medium capitalize ${s.type === 'deposit' ? 'text-green-700' : 'text-orange-700'}`}>
                                {s.type}
                              </span>
                              <p className="text-sm text-slate-600">Round {s.round}</p>
                            </div>
                          </div>
                          <a 
                            href={`https://lora.algokit.io/testnet/transaction/${s.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm btn-outline btn-primary"
                          >
                            View on Explorer
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Depositors Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="p-6 border-b border-slate-200">
                <h4 className="text-lg font-semibold text-slate-800 flex items-center">
                  <span className="w-2 h-2 bg-indigo-500 rounded-full mr-3"></span>
                  Depositors
                </h4>
                <p className="text-sm text-slate-600 mt-1">Current account balances</p>
              </div>
              
              <div className="max-h-80 overflow-y-auto">
                {depositors.length === 0 ? (
                  <div className="p-6 text-center text-slate-500">
                    <div className="text-4xl mb-2">👥</div>
                    <p>No depositors yet</p>
                    <p className="text-sm">Account balances will appear here</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {depositors.map((d) => (
                      <div key={d.address} className="p-4 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-mono text-slate-600 truncate">
                              {d.address}
                            </p>
                          </div>
                          <div className="ml-4 flex-shrink-0">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800">
                              {d.amount} ALGO
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 rounded-b-2xl">
          <div className="flex items-center justify-between">
            <button 
              className="btn btn-outline" 
              onClick={(e) => { e.preventDefault(); void refreshStatements(); void refreshDepositors() }}
              disabled={loading}
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh Data
            </button>
            <button 
              className="btn btn-primary" 
              onClick={closeModal} 
              disabled={loading}
            >
              Close Dashboard
            </button>
          </div>
        </div>
      </form>
    </dialog>
  )
}

export default Bank



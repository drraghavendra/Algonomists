import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { useWallet } from '@txnlab/use-wallet-react'
import { useSnackbar } from 'notistack'
import { useMemo, useState } from 'react'
import { getAlgodConfigFromViteEnvironment } from '../utils/network/getAlgoClientConfigs'

interface CreateASAProps {
  openModal: boolean
  closeModal: () => void
}

const CreateASA = ({ openModal, closeModal }: CreateASAProps) => {
  const { activeAddress, transactionSigner } = useWallet()
  const { enqueueSnackbar } = useSnackbar()
  const [name, setName] = useState('MyToken')
  const [unit, setUnit] = useState('MTK')
  const [decimals, setDecimals] = useState('6')
  const [total, setTotal] = useState('1000000')
  const [loading, setLoading] = useState(false)

  const algorand = useMemo(() => {
    const algodConfig = getAlgodConfigFromViteEnvironment()
    const client = AlgorandClient.fromConfig({ algodConfig })
    client.setDefaultSigner(transactionSigner)
    return client
  }, [transactionSigner])

  const onCreate = async () => {
    if (!activeAddress) return enqueueSnackbar('Connect a wallet first', { variant: 'error' })
    setLoading(true)
    try {
      const result = await algorand.send.assetCreate({
        sender: activeAddress,
        total: BigInt(total),
        decimals: Number(decimals),
        unitName: unit,
        assetName: name,
        manager: activeAddress,
        reserve: activeAddress,
        freeze: activeAddress,
        clawback: activeAddress,
        defaultFrozen: false,
      })
      enqueueSnackbar(`ASA created. ID: ${result.assetId}`, { variant: 'success' })
      closeModal()
    } catch (e) {
      enqueueSnackbar((e as Error).message, { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <dialog id="create_asa_modal" className={`modal ${openModal ? 'modal-open' : ''}`}>
      <div className="modal-box max-w-2xl bg-gradient-to-br from-slate-800/95 to-slate-900/95 backdrop-blur-sm border border-slate-700/50 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-3xl font-bold text-white mb-2">
              <span className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                Create Token
              </span>
            </h3>
            <p className="text-gray-400 text-sm">Deploy a new Algorand Standard Asset (ASA)</p>
          </div>
          <button 
            onClick={closeModal} 
            disabled={loading}
            className="text-gray-400 hover:text-white transition-colors duration-200 disabled:opacity-50"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form method="dialog" className="space-y-6">
          {/* Token Name */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-300">
              Token Name
            </label>
            <input 
              className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all duration-200" 
              placeholder="Enter token name (e.g., My Loyalty Token)" 
              value={name} 
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-gray-500">The full name of your token as it will appear in wallets</p>
          </div>

          {/* Unit/Symbol */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-300">
              Unit/Symbol
            </label>
            <input 
              className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all duration-200" 
              placeholder="Enter symbol (e.g., MLT)" 
              value={unit} 
              onChange={(e) => setUnit(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-gray-500">Short symbol for your token (typically 3-5 characters)</p>
          </div>

          {/* Decimals */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-300">
              Decimals
            </label>
            <input 
              className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all duration-200" 
              placeholder="Enter decimal places (e.g., 6)" 
              value={decimals} 
              onChange={(e) => setDecimals(e.target.value)}
              type="number"
              min="0"
              max="19"
              disabled={loading}
            />
            <p className="text-xs text-gray-500">Number of decimal places (0-19). 6 is recommended for most tokens</p>
          </div>

          {/* Total Supply */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-300">
              Total Supply (Base Units)
            </label>
            <input 
              className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all duration-200" 
              placeholder="Enter total supply in base units" 
              value={total} 
              onChange={(e) => setTotal(e.target.value)}
              type="number"
              min="1"
              disabled={loading}
            />
            <p className="text-xs text-gray-500">Total supply in base units (before decimal conversion)</p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 pt-6">
            <button 
              type="button"
              className="flex-1 px-6 py-3 bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600 disabled:from-gray-600 disabled:to-gray-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center"
              onClick={onCreate} 
              disabled={loading || !name.trim() || !unit.trim() || !decimals || !total}
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating Token...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Create Token
                </>
              )}
            </button>
            <button 
              type="button"
              className="px-6 py-3 bg-slate-700/50 hover:bg-slate-600/50 text-gray-300 hover:text-white font-semibold rounded-xl border border-slate-600/50 hover:border-slate-500/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={closeModal} 
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}

export default CreateASA


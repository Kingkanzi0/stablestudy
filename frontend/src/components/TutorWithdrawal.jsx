import { useState } from 'react'
import { useAccount } from 'wagmi'
import './TutorWithdrawal.css'

function TutorWithdrawal({ balance, onWithdraw, onClose }) {
  const { address } = useAccount()
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleWithdraw = async () => {
    const withdrawAmount = parseFloat(amount)
    
    if (withdrawAmount <= 0) {
      setError('Amount must be greater than 0')
      return
    }
    
    if (withdrawAmount > balance) {
      setError(`Insufficient balance. Available: ${balance} USDC`)
      return
    }
    
    setLoading(true)
    setError('')
    
    try {
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      onWithdraw(withdrawAmount)
      alert(`✅ Withdrawal Successful!\n\nAmount: ${withdrawAmount} USDC\nWallet: ${address?.slice(0, 10)}...${address?.slice(-8)}\n\nFunds will arrive shortly.`)
      onClose()
    } catch (err) {
      setError('Withdrawal failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content withdrawal-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        
        <div className="modal-header">
          <span className="modal-icon">💰</span>
          <h2>Withdraw Earnings</h2>
          <p className="modal-subtitle">Transfer your USDC earnings to your wallet</p>
        </div>

        <div className="withdrawal-body">
          <div className="balance-display">
            <span className="balance-label">Available Balance</span>
            <span className="balance-amount">{balance} USDC</span>
          </div>

          <div className="form-group">
            <label>Amount to Withdraw (USDC)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Max ${balance} USDC`}
              min="0.1"
              max={balance}
              step="0.1"
            />
          </div>

          {error && (
            <div className="error-message">
              ⚠️ {error}
            </div>
          )}

          <div className="withdrawal-info">
            <div className="info-row">
              <span>Withdraw to</span>
              <span className="info-value">{address?.slice(0, 10)}...{address?.slice(-8)}</span>
            </div>
            <div className="info-row">
              <span>Network</span>
              <span className="info-value">⚡ Arc Testnet</span>
            </div>
            <div className="info-row">
              <span>Processing Time</span>
              <span className="info-value">~2-5 minutes</span>
            </div>
          </div>

          <button 
            className="withdraw-btn"
            onClick={handleWithdraw}
            disabled={loading || !amount || parseFloat(amount) <= 0}
          >
            {loading ? '⏳ Processing...' : `💸 Withdraw ${amount || '0'} USDC`}
          </button>

          <p className="withdrawal-note">
            ⚡ Withdrawals are processed instantly on Arc Testnet
            <br />
            <span className="network-info">• No additional fees</span>
          </p>
        </div>
      </div>
    </div>
  )
}

export default TutorWithdrawal

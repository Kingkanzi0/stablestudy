import { useState } from 'react'
import './PaymentModal.css'

function PaymentModal({ course, studentAddress, onClose, onPaymentComplete }) {
  const [loading, setLoading] = useState(false)
  const [txHash, setTxHash] = useState('')
  const [error, setError] = useState('')
  const [showDetails, setShowDetails] = useState(false)

  // Calculate fees (10% platform fee)
  const platformFee = (course.price * 10) / 100
  const tutorAmount = course.price - platformFee

  const handlePayment = async () => {
    setLoading(true)
    setError('')
    
    try {
      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Generate mock transaction hash
      const mockTx = '0x' + Array(64).fill(0).map(() => 
        Math.floor(Math.random() * 16).toString(16)
      ).join('')
      
      setTxHash(mockTx)
      
      // Simulate payment confirmation
      setTimeout(() => {
        onPaymentComplete(mockTx, 'pay_' + Math.random().toString(36).substr(2, 9))
        onClose()
      }, 1500)
      
    } catch (err) {
      setError('Payment failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        
        <div className="modal-header">
          <span className="modal-icon">💳</span>
          <h2>Pay with USDC</h2>
        </div>

        <div className="modal-body">
          <div className="payment-details">
            <div className="payment-row">
              <span>Course</span>
              <span className="payment-value">{course.title}</span>
            </div>
            <div className="payment-row">
              <span>Amount</span>
              <span className="payment-price">{course.price} USDC</span>
            </div>
            
            <div className="payment-section">
              <div 
                className="section-header"
                onClick={() => setShowDetails(!showDetails)}
                style={{ cursor: 'pointer' }}
              >
                <span>📊 Fee Breakdown</span>
                <span>{showDetails ? '▼' : '▶'}</span>
              </div>
              {showDetails && (
                <div className="fee-details">
                  <div className="fee-row">
                    <span>Course Price</span>
                    <span>{course.price} USDC</span>
                  </div>
                  <div className="fee-row fee-highlight">
                    <span>Platform Fee (10%)</span>
                    <span>{platformFee.toFixed(2)} USDC</span>
                  </div>
                  <div className="fee-row">
                    <span>Tutor receives</span>
                    <span className="tutor-amount">{tutorAmount.toFixed(2)} USDC</span>
                  </div>
                </div>
              )}
            </div>

            <div className="payment-row highlight">
              <span>Total to Pay</span>
              <span className="payment-price">{course.price} USDC</span>
            </div>
            <div className="payment-row">
              <span>Network</span>
              <span className="payment-value">⚡ Arc Testnet</span>
            </div>
          </div>

          {error && (
            <div className="payment-error">
              ⚠️ {error}
            </div>
          )}

          {txHash && (
            <div className="payment-success">
              ✅ Payment confirmed!
              <br />
              <span className="tx-hash">Tx: {txHash.slice(0, 20)}...</span>
            </div>
          )}

          <button 
            className="payment-btn"
            onClick={handlePayment}
            disabled={loading || txHash}
          >
            {loading ? '⏳ Processing...' : txHash ? '✅ Confirmed' : `🔗 Pay ${course.price} USDC`}
          </button>

          <p className="payment-note">
            ⚡ 1 USDC = $1 on Arc Testnet
            <br />
            <span className="network-info">• 10% platform fee supports the ecosystem</span>
            <br />
            <span className="network-info">• Instant confirmation • No hidden fees</span>
          </p>
        </div>
      </div>
    </div>
  )
}

export default PaymentModal

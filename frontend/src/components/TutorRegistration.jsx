import { useState } from 'react'
import { useAccount } from 'wagmi'
import './TutorRegistration.css'

function TutorRegistration({ onRegister, onClose }) {
  const { address } = useAccount()
  const [formData, setFormData] = useState({
    fullName: '',
    title: '',
    experienceYears: '',
    subjects: '',
    hourlyRate: '1',
    bio: ''
  })
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(1)
  const [registrationFee, setRegistrationFee] = useState(0.1)

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      // Simulate registration and fee payment
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const tutorData = {
        ...formData,
        walletAddress: address,
        subjects: formData.subjects.split(',').map(s => s.trim()),
        experienceYears: parseInt(formData.experienceYears),
        hourlyRate: parseFloat(formData.hourlyRate)
      }
      
      onRegister(tutorData)
      
      alert(`✅ Tutor Registration Successful!\n\nRegistration Fee: ${registrationFee} USDC\nWelcome to StableStudy!`)
      onClose()
    } catch (error) {
      alert('Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content tutor-registration" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        
        <div className="modal-header">
          <span className="modal-icon">👨‍🏫</span>
          <h2>Become a Tutor</h2>
          <p className="modal-subtitle">Register and start earning USDC</p>
        </div>

        <div className="registration-steps">
          <div className={`step ${step >= 1 ? 'active' : ''}`}>
            <span className="step-number">1</span>
            <span className="step-label">Profile</span>
          </div>
          <div className={`step ${step >= 2 ? 'active' : ''}`}>
            <span className="step-number">2</span>
            <span className="step-label">Expertise</span>
          </div>
          <div className={`step ${step >= 3 ? 'active' : ''}`}>
            <span className="step-number">3</span>
            <span className="step-label">Payment</span>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {step === 1 && (
            <div className="form-section">
              <div className="form-group">
                <label>Full Name *</label>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  placeholder="John Doe"
                  required
                />
              </div>
              <div className="form-group">
                <label>Professional Title *</label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  placeholder="Senior Web3 Developer"
                  required
                />
              </div>
              <div className="form-group">
                <label>Bio</label>
                <textarea
                  name="bio"
                  value={formData.bio}
                  onChange={handleInputChange}
                  placeholder="Tell students about yourself and your teaching style..."
                  rows="3"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="form-section">
              <div className="form-group">
                <label>Years of Experience *</label>
                <input
                  type="number"
                  name="experienceYears"
                  value={formData.experienceYears}
                  onChange={handleInputChange}
                  placeholder="5"
                  min="0"
                  required
                />
              </div>
              <div className="form-group">
                <label>Subjects (comma separated) *</label>
                <input
                  type="text"
                  name="subjects"
                  value={formData.subjects}
                  onChange={handleInputChange}
                  placeholder="Web3, Solidity, DeFi, Smart Contracts"
                  required
                />
              </div>
              <div className="form-group">
                <label>Hourly Rate (USDC) *</label>
                <input
                  type="number"
                  name="hourlyRate"
                  value={formData.hourlyRate}
                  onChange={handleInputChange}
                  placeholder="1"
                  min="0.5"
                  step="0.5"
                  required
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="form-section payment-section">
              <div className="payment-summary">
                <h3>Registration Summary</h3>
                <div className="summary-row">
                  <span>Registration Fee</span>
                  <span className="fee-amount">{registrationFee} USDC</span>
                </div>
                <div className="summary-row">
                  <span>Network</span>
                  <span className="network-label">⚡ Arc Testnet</span>
                </div>
                <div className="summary-row total">
                  <span>Total</span>
                  <span className="total-amount">{registrationFee} USDC</span>
                </div>
              </div>
              <div className="wallet-info">
                <p>📱 Connected Wallet</p>
                <span className="wallet-address">{address?.slice(0, 10)}...{address?.slice(-8)}</span>
              </div>
              <button 
                type="submit" 
                className="register-btn"
                disabled={loading}
              >
                {loading ? '⏳ Processing...' : `🔗 Register (${registrationFee} USDC)`}
              </button>
            </div>
          )}

          <div className="form-navigation">
            {step > 1 && (
              <button type="button" onClick={() => setStep(step - 1)} className="back-btn">
                ← Back
              </button>
            )}
            {step < 3 && (
              <button type="button" onClick={() => setStep(step + 1)} className="next-btn">
                Next →
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

export default TutorRegistration

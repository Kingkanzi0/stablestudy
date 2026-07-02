import { useState, useEffect } from 'react'
import TutorRegistration from './TutorRegistration'
import TutorWithdrawal from './TutorWithdrawal'
import './TutorDashboard.css'

function TutorDashboard({ address }) {
  const [isRegistered, setIsRegistered] = useState(false)
  const [tutorData, setTutorData] = useState(null)
  const [balance, setBalance] = useState(0)
  const [showRegistration, setShowRegistration] = useState(false)
  const [showWithdrawal, setShowWithdrawal] = useState(false)
  const [earnings, setEarnings] = useState({
    total: 0,
    available: 0,
    pending: 0
  })
  const [students, setStudents] = useState([])

  useEffect(() => {
    // Check if tutor is registered
    const checkRegistration = async () => {
      try {
        const response = await fetch(`http://localhost:5001/api/tutors/${address}`)
        if (response.ok) {
          const data = await response.json()
          setIsRegistered(true)
          setTutorData(data)
          setBalance(data.balance || 0)
          setEarnings({
            total: data.totalEarned || 0,
            available: data.balance || 0,
            pending: 0
          })
        }
      } catch (error) {
        // Tutor not found
        setIsRegistered(false)
      }
    }
    
    if (address) {
      checkRegistration()
    }
  }, [address])

  const handleRegister = (data) => {
    setIsRegistered(true)
    setTutorData(data)
  }

  const handleWithdraw = (amount) => {
    setBalance(prev => prev - amount)
    setEarnings(prev => ({
      ...prev,
      available: prev.available - amount
    }))
  }

  if (!isRegistered) {
    return (
      <div className="tutor-dashboard">
        <div className="tutor-hero">
          <div className="tutor-hero-content">
            <span className="tutor-hero-icon">👨‍🏫</span>
            <h2>Become a Tutor</h2>
            <p>Share your knowledge and earn USDC</p>
            <ul className="tutor-benefits">
              <li>💰 Earn 1-2 USDC per student</li>
              <li>🌍 Teach students worldwide</li>
              <li>📈 10% platform fee</li>
              <li>⚡ Instant withdrawals</li>
            </ul>
            <button 
              className="register-tutor-btn"
              onClick={() => setShowRegistration(true)}
            >
              Register Now (0.1 USDC)
            </button>
          </div>
        </div>

        {showRegistration && (
          <TutorRegistration
            onRegister={handleRegister}
            onClose={() => setShowRegistration(false)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="tutor-dashboard registered">
      <div className="tutor-header">
        <div className="tutor-profile">
          <div className="tutor-avatar-large">👨‍🏫</div>
          <div className="tutor-info">
            <h3>{tutorData?.fullName || 'Tutor'}</h3>
            <p>{tutorData?.title || 'Expert Tutor'}</p>
            <span className="tutor-subjects">
              {tutorData?.subjects?.join(' • ') || 'Web3, DeFi, Smart Contracts'}
            </span>
          </div>
        </div>
        <button 
          className="withdraw-nav-btn"
          onClick={() => setShowWithdrawal(true)}
        >
          💰 Withdraw
        </button>
      </div>

      <div className="tutor-stats-grid">
        <div className="stat-card">
          <span className="stat-icon">💰</span>
          <div className="stat-content">
            <span className="stat-number">{balance} USDC</span>
            <span className="stat-label">Available Balance</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">📚</span>
          <div className="stat-content">
            <span className="stat-number">{students.length}</span>
            <span className="stat-label">Students</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">⭐</span>
          <div className="stat-content">
            <span className="stat-number">4.9</span>
            <span className="stat-label">Rating</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">📈</span>
          <div className="stat-content">
            <span className="stat-number">{earnings.total} USDC</span>
            <span className="stat-label">Total Earned</span>
          </div>
        </div>
      </div>

      <div className="tutor-courses">
        <h4>📚 Your Courses</h4>
        <div className="tutor-course-list">
          <div className="tutor-course-item">
            <div className="course-info">
              <span className="course-name">Web3 Development</span>
              <span className="course-students">12 students</span>
            </div>
            <span className="course-earnings">+18 USDC</span>
          </div>
          <div className="tutor-course-item">
            <div className="course-info">
              <span className="course-name">Smart Contracts</span>
              <span className="course-students">8 students</span>
            </div>
            <span className="course-earnings">+16 USDC</span>
          </div>
        </div>
      </div>

      {showWithdrawal && (
        <TutorWithdrawal
          balance={balance}
          onWithdraw={handleWithdraw}
          onClose={() => setShowWithdrawal(false)}
        />
      )}
    </div>
  )
}

export default TutorDashboard

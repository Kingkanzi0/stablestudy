import { useState, useEffect } from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectKitProvider, ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { config } from './config/wagmi'
import PaymentModal from './components/PaymentModal'
import Dashboard from './components/Dashboard'
import TutorDashboard from './components/TutorDashboard'
import paymentService from './services/paymentService'
import './App.css'

const queryClient = new QueryClient()

function AppContent() {
  const { address, isConnected } = useAccount()
  const [showPayment, setShowPayment] = useState(false)
  const [showDashboard, setShowDashboard] = useState(false)
  const [showTutorDashboard, setShowTutorDashboard] = useState(false)
  const [selectedCourse, setSelectedCourse] = useState(null)
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [enrolledCourses, setEnrolledCourses] = useState([])

  useEffect(() => {
    const loadCourses = async () => {
      try {
        const data = await paymentService.getCourses()
        setCourses(data)
      } catch (error) {
        setCourses([
          { id: 1, title: 'Web3 Development', tutor: '0x348a...6462', price: 1, students: 45, rating: 4.9 },
          { id: 2, title: 'DeFi Strategies', tutor: '0x348a...6462', price: 1.5, students: 32, rating: 4.8 },
          { id: 3, title: 'Smart Contracts', tutor: '0x348a...6462', price: 2, students: 28, rating: 4.9 },
          { id: 4, title: 'Arc Integration', tutor: '0x348a...6462', price: 1.5, students: 19, rating: 4.7 },
        ])
      } finally {
        setLoading(false)
      }
    }
    loadCourses()
  }, [])

  const handleEnroll = (course) => {
    if (!isConnected) {
      alert('Please connect your wallet first!')
      return
    }
    setSelectedCourse(course)
    setShowPayment(true)
  }

  const handlePaymentComplete = async (txHash, paymentId) => {
    try {
      setEnrolledCourses([...enrolledCourses, selectedCourse])
      alert(`✅ Payment confirmed!\nTx: ${txHash}\nYou are now enrolled!`)
      setShowDashboard(true)
    } catch (error) {
      alert('Payment confirmation failed. Please contact support.')
    }
  }

  return (
    <div className="app">
      <nav className="navbar">
        <div className="nav-container">
          <div className="nav-logo">
            <span className="logo-icon">📚</span>
            <span className="logo-text">StableStudy</span>
            <span className="logo-badge">BETA</span>
          </div>
          <div className="nav-links">
            <a href="#courses">Courses</a>
            {isConnected && (
              <>
                <button className="nav-dashboard-btn" onClick={() => setShowDashboard(!showDashboard)}>
                  📊 Student
                </button>
                <button className="nav-dashboard-btn tutor-btn" onClick={() => setShowTutorDashboard(!showTutorDashboard)}>
                  👨‍🏫 Tutor
                </button>
              </>
            )}
          </div>
          <ConnectKitButton />
        </div>
      </nav>

      <section className="hero-section">
        <div className="hero-container">
          <div className="hero-content">
            <div className="hero-badge">
              <span>⚡ Arc Testnet • 1-2 USDC per course</span>
            </div>
            <h1 className="hero-title">
              Learn Anything.
              <br />
              <span className="hero-highlight">Pay with USDC.</span>
            </h1>
            <p className="hero-description">
              Connect with expert tutors worldwide and pay instantly 
              with USDC on the Arc Testnet. Courses start at just 1 USDC!
            </p>
            <div className="hero-buttons">
              <button className="btn-primary" onClick={() => document.getElementById('courses').scrollIntoView()}>
                🎓 Browse Courses
              </button>
              <button className="btn-secondary" onClick={() => setShowTutorDashboard(true)}>
                👨‍🏫 Become a Tutor
              </button>
            </div>
            <div className="hero-stats">
              <div className="stat-item">
                <span className="stat-number">500+</span>
                <span className="stat-label">Active Students</span>
              </div>
              <div className="stat-divider"></div>
              <div className="stat-item">
                <span className="stat-number">150+</span>
                <span className="stat-label">Expert Tutors</span>
              </div>
              <div className="stat-divider"></div>
              <div className="stat-item">
                <span className="stat-number">$50K+</span>
                <span className="stat-label">USDC Paid</span>
              </div>
            </div>
          </div>
          <div className="hero-visual">
            <div className="visual-card">
              <div className="visual-header">
                <span className="visual-dot red"></span>
                <span className="visual-dot yellow"></span>
                <span className="visual-dot green"></span>
              </div>
              <div className="visual-content">
                {courses.slice(0, 3).map((course, index) => (
                  <div 
                    key={course.id} 
                    className={`visual-row ${index === 2 ? 'highlight' : ''}`}
                    onClick={() => handleEnroll(course)}
                    style={{ cursor: 'pointer' }}
                  >
                    <span>{course.title}</span>
                    <span className="visual-price">{course.price} USDC</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="courses-section" id="courses">
        <div className="courses-container">
          <div className="section-header">
            <h2>📚 Available Courses</h2>
            <p>Pay 1-2 USDC and start learning today</p>
          </div>
          <div className="courses-grid">
            {loading ? (
              <div className="loading">Loading courses...</div>
            ) : (
              courses.map(course => (
                <div key={course.id} className="course-card">
                  <div className="course-badge">
                    <span className="course-price">{course.price} USDC</span>
                  </div>
                  <h3>{course.title}</h3>
                  <p className="course-tutor">👨‍🏫 {course.tutor}</p>
                  <div className="course-meta">
                    <span>👥 {course.students} students</span>
                    <span>⭐ {course.rating}</span>
                  </div>
                  <button 
                    className="enroll-btn"
                    onClick={() => handleEnroll(course)}
                  >
                    Enroll Now - {course.price} USDC
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {isConnected && showDashboard && (
        <Dashboard 
          address={address} 
          enrolledCourses={enrolledCourses}
          setEnrolledCourses={setEnrolledCourses}
        />
      )}

      {isConnected && showTutorDashboard && (
        <TutorDashboard address={address} />
      )}

      <section className="features-section" id="features">
        <div className="features-container">
          <div className="section-header">
            <h2>Why StableStudy?</h2>
            <p>Built for the future of education on Web3</p>
          </div>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">💎</div>
              <h3>Instant Payments</h3>
              <p>Pay tutors instantly with USDC. No banks, no delays.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🔒</div>
              <h3>Secure & Transparent</h3>
              <p>All transactions recorded on-chain. Full transparency.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🌍</div>
              <h3>Global Access</h3>
              <p>Connect with tutors and students from anywhere.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📈</div>
              <h3>10% Platform Fee</h3>
              <p>Sustainable platform with 10% fee on tutor earnings.</p>
            </div>
          </div>
        </div>
      </section>

      {showPayment && selectedCourse && (
        <PaymentModal 
          course={selectedCourse}
          studentAddress={address}
          onClose={() => setShowPayment(false)}
          onPaymentComplete={handlePaymentComplete}
        />
      )}

      <footer className="footer">
        <div className="footer-container">
          <div className="footer-content">
            <div>
              <h3>📚 StableStudy</h3>
              <p>Learn with Stablecoins on Arc.io</p>
            </div>
            <div className="footer-links">
              <a href="#">Privacy</a>
              <a href="#">Terms</a>
              <a href="#">Support</a>
              <a href="#">GitHub</a>
            </div>
          </div>
          <div className="footer-bottom">
            <span>🏛️ Vault: 0x348acf8ff6F8F878718d72a0662099916734642</span>
            <span className="network-badge">⚡ Arc Testnet • 1-2 USDC • 10% Fee</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider>
          <AppContent />
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export default App

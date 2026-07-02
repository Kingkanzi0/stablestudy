import { useState } from 'react'
import './Dashboard.css'

function Dashboard({ address, enrolledCourses = [], setEnrolledCourses }) {
  const [activeTab, setActiveTab] = useState('courses')
  const [courses] = useState([
    { id: 1, title: 'Web3 Development', tutor: '0x348a...6462', price: 1, students: 45, rating: 4.9 },
    { id: 2, title: 'DeFi Strategies', tutor: '0x348a...6462', price: 1.5, students: 32, rating: 4.8 },
    { id: 3, title: 'Smart Contracts', tutor: '0x348a...6462', price: 2, students: 28, rating: 4.9 },
    { id: 4, title: 'Arc Integration', tutor: '0x348a...6462', price: 1.5, students: 19, rating: 4.7 },
  ])

  const enrollCourse = (course) => {
    if (!enrolledCourses.find(c => c.id === course.id)) {
      setEnrolledCourses([...enrolledCourses, { ...course, enrolledAt: new Date() }])
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="dashboard-user">
          <span className="user-avatar">👤</span>
          <div>
            <h3>Welcome back!</h3>
            <p className="user-address">{address?.slice(0, 10)}...{address?.slice(-8)}</p>
          </div>
        </div>
        <div className="dashboard-stats">
          <div className="stat-badge">
            <span>💰 {enrolledCourses.length * 1.5} USDC</span>
            <span className="stat-label">Spent</span>
          </div>
          <div className="stat-badge">
            <span>📚 {enrolledCourses.length}</span>
            <span className="stat-label">Enrolled</span>
          </div>
        </div>
      </div>

      <div className="dashboard-tabs">
        <button 
          className={`tab ${activeTab === 'courses' ? 'active' : ''}`}
          onClick={() => setActiveTab('courses')}
        >
          📚 Available Courses
        </button>
        <button 
          className={`tab ${activeTab === 'enrolled' ? 'active' : ''}`}
          onClick={() => setActiveTab('enrolled')}
        >
          🎓 My Courses
        </button>
        <button 
          className={`tab ${activeTab === 'tutors' ? 'active' : ''}`}
          onClick={() => setActiveTab('tutors')}
        >
          👨‍🏫 Find Tutors
        </button>
      </div>

      {activeTab === 'courses' && (
        <div className="courses-grid">
          {courses.map(course => (
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
                onClick={() => enrollCourse(course)}
              >
                Enroll Now
              </button>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'enrolled' && (
        <div className="enrolled-grid">
          {enrolledCourses.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">📖</span>
              <h3>No courses enrolled yet</h3>
              <p>Browse courses and start learning!</p>
            </div>
          ) : (
            enrolledCourses.map(course => (
              <div key={course.id} className="course-card enrolled">
                <div className="course-status">✅ Enrolled</div>
                <h3>{course.title}</h3>
                <p className="course-tutor">👨‍🏫 {course.tutor}</p>
                <div className="course-meta">
                  <span>⏳ In Progress</span>
                </div>
                <button className="continue-btn">Continue Learning</button>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'tutors' && (
        <div className="tutors-grid">
          <div className="tutor-card">
            <div className="tutor-avatar">👨‍🏫</div>
            <h3>Expert Developer</h3>
            <p className="tutor-specialty">Web3 & Smart Contracts</p>
            <div className="tutor-stats">
              <span>⭐ 4.9 (45 reviews)</span>
              <span>💰 1 USDC/hr</span>
            </div>
            <button className="tutor-btn">Book Session</button>
          </div>
          <div className="tutor-card">
            <div className="tutor-avatar">👩‍🏫</div>
            <h3>DeFi Specialist</h3>
            <p className="tutor-specialty">DeFi & Yield Strategies</p>
            <div className="tutor-stats">
              <span>⭐ 4.8 (32 reviews)</span>
              <span>💰 1.5 USDC/hr</span>
            </div>
            <button className="tutor-btn">Book Session</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard

import { Link, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Explore from './pages/Explore'
import CourseDetail from './pages/CourseDetail'
import Learn from './pages/Learn'
import CoursePlayer from './pages/CoursePlayer'
import Teach from './pages/Teach'
import CourseEditor from './pages/CourseEditor'
import TutorProfile from './pages/TutorProfile'
import Jobs from './pages/Jobs'
import JobDetail from './pages/JobDetail'
import JobEditor from './pages/JobEditor'
import MyJobs from './pages/MyJobs'
import EscrowList from './pages/EscrowList'
import EscrowNew from './pages/EscrowNew'
import EscrowOrder from './pages/EscrowOrder'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="courses" element={<Explore />} />
        <Route path="courses/:id" element={<CourseDetail />} />
        <Route path="learn" element={<Learn />} />
        <Route path="learn/:id" element={<CoursePlayer />} />
        <Route path="teach" element={<Teach />} />
        <Route path="teach/courses/new" element={<CourseEditor />} />
        <Route path="teach/courses/:id/edit" element={<CourseEditor />} />
        <Route path="tutors/:address" element={<TutorProfile />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="jobs/new" element={<JobEditor />} />
        <Route path="jobs/mine" element={<MyJobs />} />
        <Route path="jobs/:id" element={<JobDetail />} />
        <Route path="jobs/:id/edit" element={<JobEditor />} />
        <Route path="escrow" element={<EscrowList />} />
        <Route path="escrow/new" element={<EscrowNew />} />
        <Route path="escrow/:id" element={<EscrowOrder />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

function NotFound() {
  return (
    <div className="page gate">
      <h1>Page not found</h1>
      <p>The link may be out of date.</p>
      <Link to="/courses" className="btn btn-primary">
        Explore courses
      </Link>
    </div>
  )
}

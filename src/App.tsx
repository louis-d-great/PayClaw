import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import CreateProject from './pages/CreateProject'
import Dashboard from './pages/Dashboard'
import EditProject from './pages/EditProject'
import MilestonePage from './pages/MilestonePage'
import ProfilePage from './pages/ProfilePage'
import ReceiptPage from './pages/ReceiptPage'
import ProjectPage from './pages/ProjectPage'
import ReviewAndSign from './pages/ReviewAndSign'
import ReviewPage from './pages/ReviewPage'
import OpenRoles from './pages/OpenRoles'
import { StoreProvider } from './store'

// Hosted previews run in a sandboxed frame without real URLs, so they route in memory.
const Router = import.meta.env.VITE_ROUTER === 'memory' ? MemoryRouter : BrowserRouter

export default function App() {
  return (
    <Router>
      <StoreProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="new" element={<CreateProject />} />
            <Route path="p/:projectId" element={<ProjectPage />} />
            <Route path="p/:projectId/role/:roleId" element={<ReviewAndSign />} />
            <Route path="p/:projectId/m/:roleId/:milestoneId" element={<MilestonePage />} />
            <Route path="p/:projectId/edit" element={<EditProject />} />
            <Route path="u/:handle" element={<ProfilePage />} />
            <Route path="r/:projectId" element={<ReceiptPage />} />
            <Route path="review" element={<ReviewPage />} />
            <Route path="jobs" element={<OpenRoles />} />
          </Route>
        </Routes>
      </StoreProvider>
    </Router>
  )
}

import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import CreateProject from './pages/CreateProject'
import Dashboard from './pages/Dashboard'
import MilestonePage from './pages/MilestonePage'
import ProjectPage from './pages/ProjectPage'
import ReviewAndSign from './pages/ReviewAndSign'
import { StoreProvider } from './store'

// Hosted previews run in a sandboxed frame without real URLs, so they route in memory.
const Router = import.meta.env.VITE_ROUTER === 'memory' ? MemoryRouter : BrowserRouter

export default function App() {
  return (
    <StoreProvider>
      <Router>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="new" element={<CreateProject />} />
            <Route path="p/:projectId" element={<ProjectPage />} />
            <Route path="p/:projectId/role/:roleId" element={<ReviewAndSign />} />
            <Route path="p/:projectId/m/:roleId/:milestoneId" element={<MilestonePage />} />
          </Route>
        </Routes>
      </Router>
    </StoreProvider>
  )
}

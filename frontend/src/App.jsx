import { useEffect, useState } from 'react'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { theme } from './config/appConfig'
import {
  getInitialAdminSession,
  signOutAdmin,
  verifySession,
} from './services/adminAuthService'
import SmartOrderPage from './pages/customer/SmartOrderPage'
import OrderSuccessPage from './pages/customer/OrderSuccessPage'
import TrackOrderPage from './pages/customer/TrackOrderPage'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminLoginPage from './pages/admin/AdminLoginPage'
import './App.css'

function App() {
  const [adminSession, setAdminSession] = useState(getInitialAdminSession)

  // Verifikasi token saat app pertama dimuat (kalau ada token tersimpan).
  useEffect(() => {
    let active = true
    verifySession().then((session) => {
      if (active) setAdminSession(session)
    })
    return () => {
      active = false
    }
  }, [])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<SmartOrderPage />} />
          <Route path="/sukses/:code" element={<OrderSuccessPage />} />
          <Route path="/tracking/:code" element={<TrackOrderPage />} />
          <Route
            path="/admin"
            element={
              adminSession ? (
                <AdminDashboard
                  admin={adminSession.admin}
                  onSignOut={async () => {
                    await signOutAdmin()
                    setAdminSession(null)
                  }}
                />
              ) : (
                <Navigate to="/admin/login" replace />
              )
            }
          />
          <Route
            path="/admin/login"
            element={
              <AdminLoginPage
                isAuthenticated={Boolean(adminSession)}
                onAuthenticated={setAdminSession}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App

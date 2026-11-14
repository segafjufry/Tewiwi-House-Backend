import { useEffect, useState } from 'react'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { theme } from './config/appConfig'
import { readOrders, writeOrders } from './services/demoOrderStorage'
import {
  getInitialAdminSession,
  isAdminDemoMode,
  isSupabaseConfigured,
  signOutAdmin,
  subscribeToAuthChanges,
} from './services/adminAuthService'
import SmartOrderPage from './pages/customer/SmartOrderPage'
import OrderSuccessPage from './pages/customer/OrderSuccessPage'
import TrackOrderPage from './pages/customer/TrackOrderPage'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminLoginPage from './pages/admin/AdminLoginPage'
import AdminForgotPasswordPage from './pages/admin/AdminForgotPasswordPage'
import AdminResetPasswordPage from './pages/admin/AdminResetPasswordPage'
import './App.css'

function App() {
  const [adminSession, setAdminSession] = useState(getInitialAdminSession)
  const [authReady, setAuthReady] = useState(isAdminDemoMode || !isSupabaseConfigured)
  const [orders, setOrders] = useState(() => {
    try {
      return readOrders()
    } catch (error) {
      console.error('Gagal membaca pesanan tersimpan:', error)
      return []
    }
  })

  useEffect(() => {
    if (!isSupabaseConfigured || isAdminDemoMode) {
      return undefined
    }

    return subscribeToAuthChanges((session) => {
      setAdminSession(session)
      setAuthReady(true)
    })
  }, [])

  useEffect(() => {
    try {
      writeOrders(orders)
    } catch (error) {
      console.error('Gagal menyimpan pesanan:', error)
    }
  }, [orders])

  const updateOrderStatus = (code, status) => {
    setOrders((currentOrders) =>
      currentOrders.map((order) => (order.code === code ? { ...order, status } : order)),
    )
  }

  const createOrder = (order) => {
    setOrders((currentOrders) => [order, ...currentOrders])
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<SmartOrderPage orders={orders} onCreateOrder={createOrder} />} />
          <Route path="/sukses/:code" element={<OrderSuccessPage orders={orders} />} />
          <Route path="/tracking/:code" element={<TrackOrderPage orders={orders} />} />
          <Route
            path="/admin"
            element={
              authReady && adminSession ? (
                <AdminDashboard
                  orders={orders}
                  onUpdateStatus={updateOrderStatus}
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
                authReady={authReady}
                isAuthenticated={Boolean(adminSession)}
                onAuthenticated={setAdminSession}
              />
            }
          />
          <Route path="/admin/lupa-password" element={<AdminForgotPasswordPage />} />
          <Route
            path="/admin/reset-password"
            element={
              <AdminResetPasswordPage
                authReady={authReady}
                hasRecoverySession={Boolean(adminSession)}
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

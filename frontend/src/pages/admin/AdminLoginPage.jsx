import { useState } from 'react'
import { Alert, Button, TextField } from '@mui/material'
import { Link, Navigate } from 'react-router-dom'
import AdminAuthLayout from './AdminAuthLayout'
import {
  isAdminDemoMode,
  isSupabaseConfigured,
  signInAdmin,
} from '../../services/adminAuthService'

function AdminLoginPage({ authReady, isAuthenticated, onAuthenticated }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (authReady && isAuthenticated) {
    return <Navigate to="/admin" replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')
    setIsSubmitting(true)

    try {
      const session = await signInAdmin(email.trim(), password)
      onAuthenticated(session)
    } catch (error) {
      console.error('Gagal login admin:', error)
      setErrorMessage(
        isSupabaseConfigured && !isAdminDemoMode
          ? 'Email atau password tidak valid. Periksa kembali lalu coba lagi.'
          : error.message,
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AdminAuthLayout
      title="Login admin"
      description="Masuk untuk mengelola pesanan dan produksi."
    >
      {isAdminDemoMode ? (
        <Alert severity="warning" className="admin-auth-alert">
          Mode demo.  email <strong>demo@tewiwi.local</strong> dan password <strong>TewiwiDemo123!</strong>. 
        </Alert>
      ) : !isSupabaseConfigured && (
        <Alert severity="warning" className="admin-auth-alert">
          Belum bisa login, belum konfigurasi ke supabase
        </Alert>
      )}
      {errorMessage && <Alert severity="error" className="admin-auth-alert">{errorMessage}</Alert>}
      <form className="admin-auth-form" onSubmit={handleSubmit}>
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          fullWidth
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          fullWidth
        />
        <Button
          type="submit"
          variant="contained"
          disabled={isSubmitting || (!isSupabaseConfigured && !isAdminDemoMode)}
          fullWidth
        >
          {isSubmitting ? 'Memproses...' : 'Masuk'}
        </Button>
      </form>
      <Link className="admin-auth-link" to="/admin/lupa-password">
        Lupa password?
      </Link>
    </AdminAuthLayout>
  )
}

export default AdminLoginPage

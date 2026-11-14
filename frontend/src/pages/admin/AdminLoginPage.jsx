import { useState } from 'react'
import { Alert, Button, TextField } from '@mui/material'
import { Navigate } from 'react-router-dom'
import AdminAuthLayout from './AdminAuthLayout'
import { signInAdmin } from '../../services/adminAuthService'

function AdminLoginPage({ isAuthenticated, onAuthenticated }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (isAuthenticated) {
    return <Navigate to="/admin" replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')
    setIsSubmitting(true)

    try {
      const session = await signInAdmin(username.trim(), password)
      onAuthenticated(session)
    } catch (error) {
      console.error('Gagal login admin:', error)
      setErrorMessage(
        error.code === 'INVALID_CREDENTIALS'
          ? 'Username atau password salah. Periksa kembali lalu coba lagi.'
          : error.code === 'NETWORK_ERROR'
            ? 'Tidak dapat terhubung ke server. Periksa koneksi atau backend.'
            : error.message ?? 'Gagal login, coba lagi.',
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
      {errorMessage && <Alert severity="error" className="admin-auth-alert">{errorMessage}</Alert>}
      <form className="admin-auth-form" onSubmit={handleSubmit}>
        <TextField
          label="Username"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
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
          disabled={isSubmitting}
          fullWidth
        >
          {isSubmitting ? 'Memproses...' : 'Masuk'}
        </Button>
      </form>
    </AdminAuthLayout>
  )
}

export default AdminLoginPage

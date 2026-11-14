import { useState } from 'react'
import { Alert, Button, TextField } from '@mui/material'
import { Link } from 'react-router-dom'
import AdminAuthLayout from './AdminAuthLayout'
import {
  isAdminDemoMode,
  isSupabaseConfigured,
  requestAdminPasswordReset,
} from '../../services/adminAuthService'

function AdminForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')
    setIsSubmitting(true)

    try {
      await requestAdminPasswordReset(email.trim())
      setIsSubmitted(true)
    } catch (error) {
      console.error('Gagal meminta reset password admin:', error)
      setErrorMessage(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AdminAuthLayout
      title="Lupa password?"
      description="Masukkan email akun admin. Kami akan mengirim tautan untuk mengatur ulang password."
    >
      {isAdminDemoMode ? (
        <Alert severity="info" className="admin-auth-alert">
          Reset password tidak tersedia di mode demo. Gunakan kredensial demo yang ditampilkan di halaman login.
        </Alert>
      ) : !isSupabaseConfigured && (
        <Alert severity="warning" className="admin-auth-alert">
          Reset password belum aktif, soalnya masih perlu konfigurasi dari backend ke supabase.
        </Alert>
      )}
      {errorMessage && <Alert severity="error" className="admin-auth-alert">{errorMessage}</Alert>}
      {isAdminDemoMode ? null : isSubmitted ? (
        <Alert severity="success" className="admin-auth-alert">
          Jika email terdaftar, tautan reset password akan segera dikirim. Periksa kotak masuk dan folder spam.
        </Alert>
      ) : (
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
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting || !isSupabaseConfigured}
            fullWidth
          >
            {isSubmitting ? 'Mengirim...' : 'Kirim tautan reset'}
          </Button>
        </form>
      )}
      <Link className="admin-auth-link" to="/admin/login">
        Kembali ke login
      </Link>
    </AdminAuthLayout>
  )
}

export default AdminForgotPasswordPage

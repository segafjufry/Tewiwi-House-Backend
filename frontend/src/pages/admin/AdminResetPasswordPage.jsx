import { useState } from 'react'
import { Alert, Button, TextField } from '@mui/material'
import { Link, Navigate } from 'react-router-dom'
import AdminAuthLayout from './AdminAuthLayout'
import {
  isAdminDemoMode,
  isSupabaseConfigured,
  updateAdminPassword,
} from '../../services/adminAuthService'

function AdminResetPasswordPage({ authReady, hasRecoverySession }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUpdated, setIsUpdated] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')

    if (password !== confirmPassword) {
      setErrorMessage('Konfirmasi password tidak sama.')
      return
    }

    setIsSubmitting(true)
    try {
      await updateAdminPassword(password)
      setIsUpdated(true)
    } catch (error) {
      console.error('Gagal memperbarui password admin:', error)
      setErrorMessage(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (authReady && hasRecoverySession && isUpdated) {
    return <Navigate to="/admin" replace />
  }

  return (
    <AdminAuthLayout
      title="Atur password baru"
      description="Buat password baru untuk akun admin Anda."
    >
      {isAdminDemoMode ? (
        <Alert severity="info" className="admin-auth-alert">
          Reset password tidak tersedia di mode demo. Kembali ke halaman login untuk melihat kredensial demo.
        </Alert>
      ) : !authReady ? (
        <p className="admin-auth-description">Memvalidasi tautan reset...</p>
      ) : !isSupabaseConfigured ? (
        <Alert severity="warning" className="admin-auth-alert">
          Reset password belum aktif. Tim backend perlu mengatur koneksi Supabase terlebih dahulu.
        </Alert>
      ) : !hasRecoverySession ? (
        <Alert severity="error" className="admin-auth-alert">
          Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan reset yang baru.
        </Alert>
      ) : isUpdated ? (
        <Alert severity="success" className="admin-auth-alert">
          Password berhasil diperbarui. Anda akan masuk ke dashboard.
        </Alert>
      ) : (
        <>
          {errorMessage && <Alert severity="error" className="admin-auth-alert">{errorMessage}</Alert>}
          <form className="admin-auth-form" onSubmit={handleSubmit}>
            <TextField
              label="Password baru"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              inputProps={{ minLength: 8 }}
              helperText="Minimal 8 karakter."
              required
              fullWidth
            />
            <TextField
              label="Konfirmasi password baru"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              inputProps={{ minLength: 8 }}
              required
              fullWidth
            />
            <Button type="submit" variant="contained" disabled={isSubmitting} fullWidth>
              {isSubmitting ? 'Menyimpan...' : 'Simpan password baru'}
            </Button>
          </form>
        </>
      )}
      <Link className="admin-auth-link" to="/admin/login">
        Kembali ke login
      </Link>
    </AdminAuthLayout>
  )
}

export default AdminResetPasswordPage

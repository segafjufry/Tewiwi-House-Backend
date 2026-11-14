import { useEffect, useState } from 'react'
import { Alert, Button, Paper, Typography } from '@mui/material'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import BrandHeader from '../../components/common/BrandHeader'
import { rupiah } from '../../utils/formatCurrency'
import { trackOrder } from '../../services/api'

function formatDelivery(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00`)
  const weekday = new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(d)
  const date = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(d)
  return `${weekday}, ${date}`
}

function OrderSuccessPage() {
  const { code } = useParams()
  const location = useLocation()
  const [order, setOrder] = useState(location.state?.order ?? null)
  const [loading, setLoading] = useState(!order)
  const [error, setError] = useState('')

  // Fallback: jika halaman dibuka langsung / di-refresh (tanpa state), ambil via trackOrder.
  useEffect(() => {
    if (order) return
    let active = true
    trackOrder(code)
      .then((data) => {
        if (active) setOrder(data)
      })
      .catch((err) => {
        if (active) setError(err.code === 'NOT_FOUND' ? 'Order tidak ditemukan.' : err.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [code, order])

  const [copyMessage, setCopyMessage] = useState('')
  const payment = order?.payment
  const hasPayment = Boolean(payment?.account_number)

  if (loading) {
    return (
      <main className="page-shell">
        <BrandHeader />
        <p className="muted">Memuat pesanan…</p>
      </main>
    )
  }

  if (!order) return <Navigate to="/" replace />

  const copyAccountNumber = async () => {
    if (!payment?.account_number) return
    try {
      await navigator.clipboard.writeText(payment.account_number)
      setCopyMessage('Nomor rekening berhasil disalin.')
    } catch {
      setCopyMessage('Nomor rekening tidak dapat disalin. Silakan salin secara manual.')
    }
  }

  return (
    <main className="page-shell">
      <BrandHeader />
      <div className="order-content success-content">
        <Paper className="order-card success-card" elevation={0}>
          <div className="success-mark" aria-hidden="true">✓</div>
          <Typography component="h1" className="success-title">
            Pesanan diterima
          </Typography>
          <p className="success-lead">
            Nomor <strong>{order.code}</strong> untuk{' '}
            <strong>{formatDelivery(order.delivery_date)}</strong>.
          </p>
          {order.delivery_address && (
            <p className="muted">Dikirim ke: {order.delivery_address}</p>
          )}

          <section className="success-order-summary" aria-label="Ringkasan pesanan">
            <h2>Ringkasan pesanan</h2>
            {order.items.map((item) => (
              <div className="summary-row" key={item.product_id ?? item.id}>
                <span>{item.quantity} × {item.name}</span>
                <strong>{rupiah((item.unit_price ?? item.price) * item.quantity)}</strong>
              </div>
            ))}
            <div className="summary-row summary-total">
              <span>Total · {order.total_quantity ?? order.totalItems} roti</span>
              <strong>{rupiah(order.total_price ?? order.totalPrice)}</strong>
            </div>
          </section>

          {error && <Alert severity="error">{error}</Alert>}

          {payment ? (
            <>
              <h2 className="payment-heading">Pembayaran</h2>
              <div className="payment-panel">
                <p>Transfer {rupiah(payment.amount)} ke:</p>
                <h3>{payment.bank_name}</h3>
                <p className="account-number">
                  {hasPayment ? payment.account_number : 'Nomor rekening belum diatur'}
                </p>
                <p>{payment.bank_name} a.n. {payment.account_name}</p>
                <p className="muted">
                  Cantumkan <strong>{payment.transfer_note ?? order.code}</strong> pada berita transfer.
                </p>
              </div>
              <Button
                variant="outlined"
                disabled={!hasPayment}
                onClick={copyAccountNumber}
                className="copy-button"
              >
                Salin no. rekening
              </Button>
              {copyMessage && <Alert severity="info">{copyMessage}</Alert>}

              <p className="payment-instructions">
                Setelah transfer, kirim bukti transfer ke WhatsApp admin. Lampirkan foto bukti di
                chat yang terbuka.
              </p>
              <Button
                component={payment.whatsapp_url ? 'a' : 'button'}
                href={payment.whatsapp_url || undefined}
                target={payment.whatsapp_url ? '_blank' : undefined}
                rel={payment.whatsapp_url ? 'noreferrer' : undefined}
                variant="contained"
                color="primary"
                disabled={!payment.whatsapp_url}
                className="whatsapp-button"
              >
                {payment.whatsapp_url ? 'Kirim bukti via WhatsApp' : 'WhatsApp admin belum diatur'}
              </Button>
            </>
          ) : (
            <p className="muted">
              Info pembayaran akan dikirim admin. Lacak pesananmu untuk melihat status.
            </p>
          )}
          <Button component={Link} to="/" variant="contained" className="order-again-button">
            Pesan lagi
          </Button>
        </Paper>
      </div>
    </main>
  )
}

export default OrderSuccessPage

import { useEffect, useState } from 'react'
import { Alert, Paper, Typography } from '@mui/material'
import { Link, useParams } from 'react-router-dom'
import BrandHeader from '../../components/common/BrandHeader'
import { rupiah } from '../../utils/formatCurrency'
import { trackOrder } from '../../services/api'

const STATUS_STEPS = ['Baru', 'Dikonfirmasi', 'Diproduksi', 'Dikirim']

const STATUS_INFO = {
  Baru: {
    icon: '🕐',
    label: 'Pesanan diterima',
    description: 'Pesananmu sudah kami terima dan sedang menunggu konfirmasi admin.',
    iconBg: '#edf3ff',
  },
  Dikonfirmasi: {
    icon: '✅',
    label: 'Pesanan dikonfirmasi',
    description: 'Admin telah mengkonfirmasi pesananmu. Pembayaran sedang diverifikasi.',
    iconBg: '#d4edda',
  },
  Diproduksi: {
    icon: '👨‍🍳',
    label: 'Sedang diproduksi',
    description: 'Rotimu sedang dipanggang segar untukmu!',
    iconBg: '#edf3ff',
  },
  Dikirim: {
    icon: '🚚',
    label: 'Sedang dikirim',
    description: 'Pesananmu sedang dalam perjalanan ke alamatmu.',
    iconBg: '#edf3ff',
  },
  Dibatalkan: {
    icon: '✕',
    label: 'Pesanan dibatalkan',
    description: 'Pesanan ini telah dibatalkan. Hubungi admin untuk informasi lebih lanjut.',
    iconBg: '#fce8ed',
    iconColor: '#d94f70',
  },
}

function StatusStepper({ currentStatus }) {
  const currentStep = STATUS_STEPS.indexOf(currentStatus)
  return (
    <div className="track-stepper" aria-label="Status pengiriman">
      {STATUS_STEPS.map((step, index) => {
        const isDone = index < currentStep
        const isActive = index === currentStep
        return (
          <div
            key={step}
            className={`track-step${isDone || isActive ? ' is-done' : ''}${isActive ? ' is-active' : ''}`}
          >
            <div className="track-step-dot" aria-hidden="true" />
            {index < STATUS_STEPS.length - 1 && (
              <div className={`track-step-line${isDone || isActive ? ' is-filled' : ''}`} aria-hidden="true" />
            )}
            <span className="track-step-label">{step}</span>
          </div>
        )
      })}
    </div>
  )
}

function formatDelivery(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00`)
  const weekday = new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(d)
  const date = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(d)
  return `${weekday}, ${date}`
}

function TrackOrderPage() {
  const { code } = useParams()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (!code) return
    trackOrder(code)
      .then((data) => {
        if (active) setOrder(data)
      })
      .catch((err) => {
        if (active) setError(err.code === 'NOT_FOUND' ? 'Kode order tidak ditemukan' : err.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [code])

  if (loading) {
    return (
      <main className="page-shell">
        <BrandHeader />
        <p className="muted">Melacak pesanan…</p>
      </main>
    )
  }

  if (!order) {
    return (
      <main className="page-shell">
        <BrandHeader />
        <div className="order-content track-content">
          <Paper className="order-card track-card" elevation={0}>
            {error && <Alert severity="error">{error}</Alert>}
            <Link to="/" className="track-back-link">← Kembali ke beranda</Link>
          </Paper>
        </div>
      </main>
    )
  }

  const info = STATUS_INFO[order.status] ?? STATUS_INFO['Baru']
  const isCancelled = order.status === 'Dibatalkan'

  return (
    <main className="page-shell">
      <BrandHeader />
      <div className="order-content track-content">
        <Paper className="order-card track-card" elevation={0}>
          <div className="track-header">
            <div
              className="track-icon-box"
              aria-hidden="true"
              style={{ background: info.iconBg, color: info.iconColor ?? 'inherit' }}
            >
              {info.icon}
            </div>
            <div>
              <Typography component="h1" className="track-title">{info.label}</Typography>
              <p className="track-code">#{order.code}</p>
            </div>
          </div>

          <p className="track-description">{info.description}</p>

          {isCancelled ? (
            <div className="track-cancelled-badge">Pesanan Dibatalkan</div>
          ) : (
            <StatusStepper currentStatus={order.status} />
          )}

          <div className="track-info-panel">
            <div className="track-info-row">
              <span>Pengiriman</span>
              <strong>{formatDelivery(order.delivery_date)}</strong>
            </div>
          </div>

          <section className="track-order-summary" aria-label="Ringkasan pesanan">
            <h2>Ringkasan pesanan</h2>
            {order.items.map((item) => (
              <div className="summary-row" key={item.product_id ?? item.id}>
                <span>{item.quantity} × {item.name}</span>
                <strong>{rupiah(item.unit_price * item.quantity)}</strong>
              </div>
            ))}
            <div className="summary-row summary-total">
              <span>Total · {order.items.reduce((n, i) => n + i.quantity, 0)} item</span>
              <strong>{rupiah(order.total_price)}</strong>
            </div>
          </section>

          <Link to="/" className="track-back-link">← Pesan lagi</Link>
        </Paper>
      </div>
    </main>
  )
}

export default TrackOrderPage

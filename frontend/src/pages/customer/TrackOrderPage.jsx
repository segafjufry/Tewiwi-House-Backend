import { Paper, Typography } from '@mui/material'
import { Link, Navigate, useParams } from 'react-router-dom'
import BrandHeader from '../../components/common/BrandHeader'
import { rupiah } from '../../utils/formatCurrency'

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

function TrackOrderPage({ orders }) {
  const { code } = useParams()
  const order = orders.find((o) => o.code === code)

  if (!order) return <Navigate to="/" replace />

  const info = STATUS_INFO[order.status] ?? STATUS_INFO['Baru']
  const isCancelled = order.status === 'Dibatalkan'

  return (
    <main className="page-shell">
      <BrandHeader />
      <div className="order-content track-content">
        <Paper className="order-card track-card" elevation={0}>

          {/* Header: icon + title + code */}
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

          {/* Description */}
          <p className="track-description">{info.description}</p>

          {/* Stepper or cancelled badge */}
          {isCancelled ? (
            <div className="track-cancelled-badge">Pesanan Dibatalkan</div>
          ) : (
            <StatusStepper currentStatus={order.status} />
          )}

          {/* Delivery info panel */}
          <div className="track-info-panel">
            <div className="track-info-row">
              <span>Pengiriman</span>
              <strong>{order.delivery.weekday}, {order.delivery.date}</strong>
            </div>
            <div className="track-info-row">
              <span>Alamat</span>
              <strong>{order.address}</strong>
            </div>
            <div className="track-info-row">
              <span>Nama</span>
              <strong>{order.name}</strong>
            </div>
          </div>

          {/* Order summary */}
          <section className="track-order-summary" aria-label="Ringkasan pesanan">
            <h2>Ringkasan pesanan</h2>
            {order.items.map((item) => (
              <div className="summary-row" key={item.id}>
                <span>{item.quantity} × {item.name}</span>
                <strong>{rupiah(item.price * item.quantity)}</strong>
              </div>
            ))}
            <div className="summary-row summary-total">
              <span>Total · {order.totalItems} item</span>
              <strong>{rupiah(order.totalPrice)}</strong>
            </div>
          </section>

          <Link to="/" className="track-back-link">← Pesan lagi</Link>
        </Paper>
      </div>
    </main>
  )
}

export default TrackOrderPage

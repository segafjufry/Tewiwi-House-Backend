import { useState } from 'react'
import { Alert, Button, Paper, Typography } from '@mui/material'
import { Link, Navigate, useParams } from 'react-router-dom'
import BrandHeader from '../../components/common/BrandHeader'
import { PAYMENT_INFO } from '../../config/appConfig'
import { rupiah } from '../../utils/formatCurrency'

function OrderSuccessPage({ orders }) {
  const { code } = useParams()
  const order = orders.find((savedOrder) => savedOrder.code === code)
  const [copyMessage, setCopyMessage] = useState('')
  const hasPaymentDetails = Boolean(PAYMENT_INFO.accountNumber)
  const hasAdminContact = Boolean(PAYMENT_INFO.adminWhatsApp)
  const whatsappNumber = PAYMENT_INFO.adminWhatsApp.replace(/\D/g, '')
  const whatsappMessage = order
    ? `Halo Tewiwi House, saya ingin mengirim bukti transfer untuk pesanan ${order.code}.`
    : ''
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`

  if (!order) return <Navigate to="/" replace />

  const copyAccountNumber = async () => {
    try {
      await navigator.clipboard.writeText(PAYMENT_INFO.accountNumber)
      setCopyMessage('Nomor rekening berhasil disalin.')
    } catch (error) {
      console.error('Gagal menyalin nomor rekening:', error)
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
            <strong>{order.delivery.weekday}, {order.delivery.date}</strong>.
          </p>
          <p className="muted">Dikirim ke: {order.address}</p>

          <section className="success-order-summary" aria-label="Ringkasan pesanan">
            <h2>Ringkasan pesanan</h2>
            {order.items.map((item) => (
              <div className="summary-row" key={item.id}>
                <span>{item.quantity} × {item.name}</span>
                <strong>{rupiah(item.price * item.quantity)}</strong>
              </div>
            ))}
            <div className="summary-row summary-total">
              <span>Total · {order.totalItems} roti</span>
              <strong>{rupiah(order.totalPrice)}</strong>
            </div>
          </section>

          <h2 className="payment-heading">Pembayaran</h2>
          <div className="payment-panel">
            <p>Transfer {rupiah(order.totalPrice)} ke:</p>
            <h3>{PAYMENT_INFO.bank}</h3>
            <p className="account-number">
              {hasPaymentDetails ? PAYMENT_INFO.accountNumber : 'Nomor rekening belum diatur'}
            </p>
            <p>{PAYMENT_INFO.bank} a.n. {PAYMENT_INFO.accountName}</p>
            <p className="muted">
              Cantumkan <strong>{order.code}</strong> pada berita transfer.
            </p>
          </div>
          <Button
            variant="outlined"
            disabled={!hasPaymentDetails}
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
            component={hasAdminContact ? 'a' : 'button'}
            href={hasAdminContact ? whatsappUrl : undefined}
            target={hasAdminContact ? '_blank' : undefined}
            rel={hasAdminContact ? 'noreferrer' : undefined}
            variant="contained"
            color="primary"
            disabled={!hasAdminContact}
            className="whatsapp-button"
          >
            {hasAdminContact ? 'Kirim bukti via WhatsApp' : 'WhatsApp admin belum diatur'}
          </Button>
          <p className="muted admin-contact">
            {hasAdminContact
              ? `Admin akan menghubungi ${PAYMENT_INFO.adminWhatsApp}.`
              : 'Nomor rekening dan WhatsApp admin perlu diatur sebelum pembayaran.'}
          </p>
          <Button component={Link} to="/" variant="contained" className="order-again-button">
            Pesan lagi
          </Button>
        </Paper>
      </div>
    </main>
  )
}

export default OrderSuccessPage

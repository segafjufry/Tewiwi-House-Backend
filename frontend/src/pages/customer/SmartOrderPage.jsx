import { useEffect, useState } from 'react'
import { Alert, Button, Paper, TextField, Typography } from '@mui/material'
import { Link, useNavigate } from 'react-router-dom'
import BrandHeader from '../../components/common/BrandHeader'
import sourdoughImage from '../../assets/sourdough.jpg'
import { rupiah } from '../../utils/formatCurrency'
import { getProducts, getSlots, createOrder } from '../../services/api'

const FALLBACK_IMAGE = sourdoughImage

// Format YYYY-MM-DD → "12 Nov"
function formatDate(iso) {
  const d = new Date(`${iso}T00:00:00`)
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(d)
}

function SmartOrderPage() {
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [deliveryDate, setDeliveryDate] = useState('')
  const [quantities, setQuantities] = useState({})
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [nameError, setNameError] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [addressError, setAddressError] = useState('')
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Last-order banner (kode order terakhir, disimpan di localStorage untuk tampilkan "pesan lagi")
  const [bannerDismissed, setBannerDismissed] = useState(
    () => localStorage.getItem('tewiwi-last-order-dismissed') === 'true',
  )
  const lastOrderCode = localStorage.getItem('tewiwi-last-order-code')
  const showBanner = Boolean(lastOrderCode) && !bannerDismissed

  useEffect(() => {
    let active = true
    Promise.all([getProducts(), getSlots({ count: 6 })])
      .then(([p, s]) => {
        if (!active) return
        setProducts(p ?? [])
        setSlots(s ?? [])
        const firstAvailable = (s ?? []).find((slot) => slot.status !== 'full' && slot.left > 0)
        setDeliveryDate(firstAvailable?.delivery_date ?? (s?.[0]?.delivery_date ?? ''))
        setLoading(false)
      })
      .catch((err) => {
        if (!active) return
        setLoadError(err.message ?? 'Gagal memuat data')
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const selectedDelivery = slots.find((slot) => slot.delivery_date === deliveryDate) ?? slots[0]
  const totalItems = Object.values(quantities).reduce((total, qty) => total + qty, 0)
  const totalPrice = products.reduce(
    (total, product) => total + product.price * (quantities[product.id] ?? 0),
    0,
  )

  const changeQuantity = (productId, amount) => {
    const limit = selectedDelivery?.left ?? 0
    if (amount > 0 && totalItems >= limit) {
      setFormError(`Kuota untuk tanggal ini maksimal ${limit} roti.`)
      return
    }
    setQuantities((current) => ({
      ...current,
      [productId]: Math.max(0, (current[productId] ?? 0) + amount),
    }))
    setFormError('')
  }

  const dismissBanner = () => {
    localStorage.setItem('tewiwi-last-order-dismissed', 'true')
    setBannerDismissed(true)
  }

  const submitOrder = async (event) => {
    event.preventDefault()
    setNameError('')
    setPhoneError('')
    setAddressError('')
    setFormError('')

    if (!name.trim()) {
      setNameError('Nama pemesan wajib diisi.')
      return
    }
    if (totalItems === 0) {
      setFormError('Pilih minimal 1 roti sebelum mengirim pesanan.')
      return
    }
    const limit = selectedDelivery?.left ?? 0
    if (totalItems > limit) {
      setFormError(`Kuota untuk tanggal ini hanya ${limit} roti.`)
      return
    }

    const normalizedPhone = phone.replace(/\D/g, '')
    if (normalizedPhone.length < 9 || normalizedPhone.length > 15) {
      setPhoneError('Masukkan nomor WhatsApp yang valid (9–15 angka).')
      return
    }
    if (!address.trim()) {
      setAddressError('Alamat pengiriman wajib diisi.')
      return
    }

    setSubmitting(true)
    try {
      const order = await createOrder({
        customer_name: name.trim(),
        phone: phone.trim(),
        delivery_address: address.trim(),
        delivery_date: selectedDelivery.delivery_date,
        items: products
          .filter((product) => quantities[product.id] > 0)
          .map((product) => ({ product_id: product.id, quantity: quantities[product.id] })),
      })
      localStorage.setItem('tewiwi-last-order-code', order.code)
      localStorage.removeItem('tewiwi-last-order-dismissed')
      navigate(`/sukses/${order.code}`, { state: { order } })
    } catch (err) {
      if (err.code === 'SLOT_FULL' || err.code === 'INSUFFICIENT_CAPACITY') {
        const next = err.details?.next_available?.delivery_date
        setFormError(next ? `Slot penuh. Slot terdekat tersedia: ${next}` : 'Slot penuh, pilih tanggal lain.')
      } else if (err.code === 'TOO_SOON') {
        setFormError('Pemesanan minimal 2 hari sebelum pengiriman.')
      } else if (err.code === 'RATE_LIMITED') {
        setFormError('Terlalu banyak percobaan, coba lagi dalam beberapa menit.')
      } else {
        setFormError(err.message ?? 'Terjadi kesalahan, coba lagi.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main className="page-shell">
        <BrandHeader />
        <p className="muted">Memuat data…</p>
      </main>
    )
  }

  return (
    <main className="page-shell">
      <BrandHeader />

      {showBanner && (
        <div className="last-order-banner" role="region" aria-label="Pesanan terakhir">
          <div className="last-order-banner-body">
            <span className="last-order-banner-label">Pesanan terakhirmu</span>
            <span className="last-order-banner-code">{lastOrderCode}</span>
          </div>
          <div className="last-order-banner-actions">
            <Link to={`/tracking/${lastOrderCode}`} className="last-order-track-link">
              Lacak
            </Link>
            <button
              type="button"
              className="last-order-close-btn"
              aria-label="Tutup banner pesanan terakhir"
              onClick={dismissBanner}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <section className="hero">
        <div className="hero-copy">
          <Typography component="h1" className="hero-title">
            Roti artisan,
            <br />
            dibuat sepenuh hati.
          </Typography>
          <p>
            Roti dan kue buatan tangan, dipanggang segar sesuai pesanan dengan bahan pilihan.
          </p>
          <Button component="a" href="#menu" variant="contained">
            Lihat menu
          </Button>
        </div>
        <img className="hero-image" src={sourdoughImage} alt="Roti sourdough artisan" />
      </section>

      {loadError && <Alert severity="error">{loadError}</Alert>}

      <div className="order-content" id="menu">
        <section>
          <Paper className="order-card products-card" elevation={0}>
            <Typography component="h2" className="section-title">
              1. Pilih roti
            </Typography>
            <div className="product-list">
              {products.map((product) => {
                const quantity = quantities[product.id] ?? 0
                return (
                  <article className={`product-row${quantity ? ' is-selected' : ''}`} key={product.id}>
                    <img
                      className="product-image"
                      src={product.image_url || FALLBACK_IMAGE}
                      alt={product.name}
                    />
                    <div className="product-details">
                      <Typography component="h3" className="product-name">
                        {product.name}
                      </Typography>
                      {product.description && (
                        <p className="product-description">{product.description}</p>
                      )}
                      <Typography className="product-price">{rupiah(product.price)}</Typography>
                    </div>
                    <div className="quantity-control" aria-label={`Jumlah ${product.name}`}>
                      <button
                        type="button"
                        aria-label={`Kurangi ${product.name}`}
                        onClick={() => changeQuantity(product.id, -1)}
                      >
                        −
                      </button>
                      <output aria-live="polite">{quantity}</output>
                      <button
                        type="button"
                        aria-label={`Tambah ${product.name}`}
                        onClick={() => changeQuantity(product.id, 1)}
                      >
                        +
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
            <p className="order-total">{totalItems} roti · {rupiah(totalPrice)}</p>
          </Paper>
        </section>

        <section>
          <Paper className="order-card delivery-card" elevation={0}>
            <Typography component="h2" className="section-title">
              2. Pilih hari pengiriman
            </Typography>
            <div className="delivery-options">
              {slots.map((slot) => {
                const isFull = slot.left === 0 || slot.status === 'full'
                const isSelected = slot.delivery_date === deliveryDate
                return (
                  <button
                    key={slot.delivery_date}
                    type="button"
                    className={`delivery-option${isFull ? ' is-full' : ''}${isSelected ? ' is-selected' : ''}`}
                    disabled={isFull || totalItems > slot.left}
                    aria-pressed={isSelected}
                    onClick={() => setDeliveryDate(slot.delivery_date)}
                  >
                    <span className="delivery-date">
                      {slot.day_name},<br />
                      {formatDate(slot.delivery_date)}
                    </span>
                    <span className="delivery-capacity">
                      {isFull ? 'Penuh' : `Sisa ${slot.left} dari ${slot.capacity} roti`}
                    </span>
                  </button>
                )
              })}
            </div>
          </Paper>
        </section>

        <section>
          <Paper className="order-card customer-card" elevation={0}>
            <Typography component="h2" className="section-title">
              3. Data pemesan
            </Typography>
            <form onSubmit={submitOrder} noValidate>
              <TextField
                label="Nama"
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  setNameError('')
                }}
                required
                fullWidth
                size="small"
                autoComplete="name"
                error={Boolean(nameError)}
                helperText={nameError}
              />
              <TextField
                label="Nomor WhatsApp"
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value)
                  setPhoneError('')
                }}
                required
                fullWidth
                size="small"
                type="tel"
                autoComplete="tel"
                error={Boolean(phoneError)}
                helperText={phoneError}
              />
              <TextField
                label="Alamat pengiriman"
                value={address}
                onChange={(event) => {
                  setAddress(event.target.value)
                  setAddressError('')
                }}
                required
                fullWidth
                size="small"
                multiline
                minRows={3}
                autoComplete="street-address"
                error={Boolean(addressError)}
                helperText={addressError}
              />
              {formError && <Alert severity="error">{formError}</Alert>}
              <div className="submit-row">
                <Button type="submit" variant="contained" disabled={submitting}>
                  {submitting ? 'Memproses...' : `Kirim pesanan · ${totalItems} roti · ${rupiah(totalPrice)}`}
                </Button>
              </div>
            </form>
          </Paper>
        </section>
      </div>
      <footer className="page-footer">Tewiwi House · Dibuat segar untukmu.</footer>
    </main>
  )
}

export default SmartOrderPage

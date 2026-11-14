import { useState } from 'react'
import { Alert, Button, Paper, TextField, Typography } from '@mui/material'
import { Link, useNavigate } from 'react-router-dom'
import BrandHeader from '../../components/common/BrandHeader'
import sourdoughImage from '../../assets/sourdough.jpg'
import { products } from '../../data/products'
import { rupiah } from '../../utils/formatCurrency'
import { getDeliveryOptions } from '../../services/deliveryService'
import {
  dismissLastOrder,
  isLastOrderDismissed,
  readLastOrderCode,
  writeLastOrderCode,
} from '../../services/demoOrderStorage'

function SmartOrderPage({ orders, onCreateOrder }) {
  const navigate = useNavigate()
  const deliveryOptions = getDeliveryOptions(orders)
  const [deliveryId, setDeliveryId] = useState(deliveryOptions[1].id)
  const [quantities, setQuantities] = useState({})
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [nameError, setNameError] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [addressError, setAddressError] = useState('')
  const [formError, setFormError] = useState('')

  // Last-order banner state
  const [bannerDismissed, setBannerDismissed] = useState(isLastOrderDismissed)
  const lastOrderCode = readLastOrderCode()
  const lastOrder = lastOrderCode ? orders.find((o) => o.code === lastOrderCode) : null
  const showBanner = Boolean(lastOrder) && !bannerDismissed

  const handleDismissBanner = () => {
    dismissLastOrder()
    setBannerDismissed(true)
  }

  const selectedDelivery =
    deliveryOptions.find((option) => option.id === deliveryId) ?? deliveryOptions[1]
  const totalItems = Object.values(quantities).reduce((total, quantity) => total + quantity, 0)
  const totalPrice = products.reduce(
    (total, product) => total + product.price * (quantities[product.id] ?? 0),
    0,
  )

  const changeQuantity = (productId, amount) => {
    if (amount > 0 && totalItems >= selectedDelivery.available) {
      setFormError(`Kuota untuk tanggal ini maksimal ${selectedDelivery.available} roti.`)
      return
    }

    setQuantities((current) => ({
      ...current,
      [productId]: Math.max(0, (current[productId] ?? 0) + amount),
    }))
    setFormError('')
  }

  const submitOrder = (event) => {
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
    if (totalItems > selectedDelivery.available) {
      setFormError(`Kuota untuk tanggal ini hanya ${selectedDelivery.available} roti.`)
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

    const order = {
      code: `TW-${window.crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      createdAt: new Date().toISOString(),
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      delivery: {
        id: selectedDelivery.id,
        weekday: selectedDelivery.weekday,
        date: selectedDelivery.date,
      },
      items: products
        .filter((product) => quantities[product.id] > 0)
        .map((product) => ({
          id: product.id,
          name: product.name,
          price: product.price,
          quantity: quantities[product.id],
        })),
      totalItems,
      totalPrice,
      status: 'Baru',
    }

    onCreateOrder(order)
    writeLastOrderCode(order.code)
    navigate(`/sukses/${order.code}`)
  }

  return (
    <main className="page-shell">
      <BrandHeader />

      {showBanner && (
        <div className="last-order-banner" role="region" aria-label="Pesanan terakhir">
          <div className="last-order-banner-body">
            <span className="last-order-banner-label">Pesanan terakhirmu</span>
            <span className="last-order-banner-code">{lastOrder.code}</span>
          </div>
          <div className="last-order-banner-actions">
            <Link to={`/tracking/${lastOrder.code}`} className="last-order-track-link">
              Lacak
            </Link>
            <button
              type="button"
              className="last-order-close-btn"
              aria-label="Tutup banner pesanan terakhir"
              onClick={handleDismissBanner}
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
                    <img className="product-image" src={product.image} alt={product.name} />
                    <div className="product-details">
                      <Typography component="h3" className="product-name">
                        {product.name}
                      </Typography>
                      <p className="product-description">{product.description}</p>
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
              {deliveryOptions.map((option) => {
                const isFull = option.available === 0
                const isSelected = option.id === deliveryId

                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`delivery-option${isFull ? ' is-full' : ''}${isSelected ? ' is-selected' : ''}`}
                    disabled={isFull || totalItems > option.available}
                    aria-pressed={isSelected}
                    onClick={() => setDeliveryId(option.id)}
                  >
                    <span className="delivery-date">
                      {option.weekday},<br />
                      {option.date}
                    </span>
                    <span className="delivery-capacity">
                      {isFull ? 'Penuh' : `Sisa ${option.available} dari ${option.capacity} roti`}
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
                <Button type="submit" variant="contained">
                  Kirim pesanan · {totalItems} roti · {rupiah(totalPrice)}
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

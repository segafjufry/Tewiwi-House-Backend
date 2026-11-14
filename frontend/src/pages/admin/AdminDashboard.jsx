import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, TextField, Typography } from '@mui/material'
import BrandHeader from '../../components/common/BrandHeader'
import sourdoughImage from '../../assets/sourdough.jpg'
import { orderStatuses } from '../../data/orderStatuses'
import { rupiah } from '../../utils/formatCurrency'
import { getOrders, updateOrderStatus, getProducts, getSlots, changePassword } from '../../services/api'

const FALLBACK_IMAGE = sourdoughImage

function formatDelivery(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00`)
  const weekday = new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(d)
  const date = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(d)
  return `${weekday}, ${date}`
}

function AdminDashboard({ admin, onSignOut }) {
  const [tab, setTab] = useState('Pesanan')
  const [statusFilter, setStatusFilter] = useState('Semua status')
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [signOutError, setSignOutError] = useState('')

  // Ganti password
  const [pwOpen, setPwOpen] = useState(false)
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')
  const [pwSubmitting, setPwSubmitting] = useState(false)

  async function loadData() {
    try {
      const [o, p, s] = await Promise.all([getOrders(), getProducts({ all: true }), getSlots({ count: 6 })])
      setOrders(o ?? [])
      setProducts(p ?? [])
      setSlots(s ?? [])
      setLoadError('')
    } catch (err) {
      setLoadError(err.code === 'NETWORK_ERROR' ? 'Tidak dapat terhubung ke server.' : err.message ?? 'Gagal memuat data')
    } finally {
      setLoading(false)
    }
  }

  // Ambil data awal saat dashboard dibuka. setState hanya di callback async.
  useEffect(() => {
    let active = true
    Promise.all([getOrders(), getProducts({ all: true }), getSlots({ count: 6 })])
      .then(([o, p, s]) => {
        if (!active) return
        setOrders(o ?? [])
        setProducts(p ?? [])
        setSlots(s ?? [])
      })
      .catch((err) => {
        if (!active) return
        setLoadError(err.code === 'NETWORK_ERROR' ? 'Tidak dapat terhubung ke server.' : err.message ?? 'Gagal memuat data')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const visibleOrders =
    statusFilter === 'Semua status'
      ? orders
      : orders.filter((order) => order.status === statusFilter)

  const totalBreadCount = orders
    .filter((order) => order.status !== 'Dibatalkan')
    .reduce((total, order) => total + (order.total_quantity ?? 0), 0)

  // Ringkasan produksi per produk (dari order yang belum dibatalkan)
  const qtyByProduct = new Map()
  for (const order of orders) {
    if (order.status === 'Dibatalkan') continue
    for (const item of order.items ?? []) {
      qtyByProduct.set(item.product_id, (qtyByProduct.get(item.product_id) ?? 0) + item.quantity)
    }
  }
  const productionList = products
    .map((product) => ({ ...product, quantity: qtyByProduct.get(product.id) ?? 0 }))
    .filter((product) => product.quantity > 0)

  async function handleSignOut() {
    setSignOutError('')
    try {
      await onSignOut()
    } catch (error) {
      console.error('Gagal logout admin:', error)
      setSignOutError('Gagal keluar dari akun. Silakan coba lagi.')
    }
  }

  async function handleStatusChange(orderId, newStatus) {
    // Optimistic update
    setOrders((current) =>
      current.map((order) => (order.id === orderId ? { ...order, status: newStatus } : order)),
    )
    try {
      await updateOrderStatus(orderId, newStatus)
      // Muat ulang slot karena kapasitas bisa berubah (order dibatalkan/diaktifkan)
      const s = await getSlots({ count: 6 })
      setSlots(s ?? [])
    } catch (err) {
      setLoadError(err.message ?? 'Gagal mengubah status')
      loadData()
    }
  }

  async function handleChangePassword(event) {
    event.preventDefault()
    setPwError('')
    setPwSuccess('')
    if (newPw.length < 8) {
      setPwError('Password baru minimal 8 karakter.')
      return
    }
    setPwSubmitting(true)
    try {
      await changePassword(admin.id, { old_password: oldPw, new_password: newPw })
      setPwSuccess('Password berhasil diubah.')
      setOldPw('')
      setNewPw('')
    } catch (err) {
      setPwError(
        err.code === 'INVALID_CREDENTIALS'
          ? 'Password lama salah.'
          : err.message ?? 'Gagal mengubah password.',
      )
    } finally {
      setPwSubmitting(false)
    }
  }

  function closePwDialog() {
    setPwOpen(false)
    setPwError('')
    setPwSuccess('')
    setOldPw('')
    setNewPw('')
  }

  return (
    <main className="page-shell admin-shell">
      <BrandHeader admin />
      <div className="admin-content">
        <div className="admin-tabs" role="tablist" aria-label="Dashboard admin">
          {['Pesanan', 'Kapasitas', 'Produksi', 'Statistik'].map((tabName) => (
            <button
              key={tabName}
              type="button"
              role="tab"
              aria-selected={tab === tabName}
              className={tab === tabName ? 'is-active' : ''}
              onClick={() => setTab(tabName)}
            >
              {tabName}
            </button>
          ))}
          <button className="admin-signout" type="button" onClick={() => setPwOpen(true)}>
            Ganti Password
          </button>
          <Link className="customer-link" to="/">Halaman customer</Link>
          <button className="admin-signout" type="button" onClick={handleSignOut}>
            Keluar
          </button>
        </div>

        {signOutError && <Alert severity="error" className="admin-auth-alert">{signOutError}</Alert>}
        {loadError && <Alert severity="error" className="admin-auth-alert">{loadError}</Alert>}

        <div className="admin-stats">
          <Paper className="stat-card" elevation={0}>
            <span>Total pesanan</span>
            <strong>{orders.length}</strong>
          </Paper>
          <Paper className="stat-card" elevation={0}>
            <span>Menunggu konfirmasi</span>
            <strong>{orders.filter((order) => order.status === 'Baru').length}</strong>
          </Paper>
          <Paper className="stat-card" elevation={0}>
            <span>Total roti diproses</span>
            <strong>{totalBreadCount}</strong>
          </Paper>
        </div>

        {loading && <p className="muted">Memuat data…</p>}

        {tab === 'Pesanan' && !loading && (
          <Paper className="order-card admin-card" elevation={0}>
            <div className="admin-section-heading">
              <div>
                <Typography component="h1" className="admin-title">Pesanan customer</Typography>
                <p className="muted">Kelola dan perbarui status pesanan masuk.</p>
              </div>
              <select
                aria-label="Filter status pesanan"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option>Semua status</option>
                {orderStatuses.map((status) => <option key={status}>{status}</option>)}
              </select>
            </div>
            {visibleOrders.length === 0 ? (
              <p className="empty-state">Belum ada pesanan untuk ditampilkan.</p>
            ) : (
              <div className="admin-order-list">
                {visibleOrders.map((order) => (
                  <article className="admin-order" key={order.id}>
                    <div className="admin-order-heading">
                      <div>
                        <strong>{order.code}</strong>
                        <p>{order.customer_name} · {order.phone}</p>
                      </div>
                      <span className={`status-pill status-${order.status.toLowerCase()}`}>
                        {order.status}
                      </span>
                    </div>
                    <p className="admin-order-address">{order.delivery_address}</p>
                    <p className="muted">
                      Pengiriman {formatDelivery(order.delivery_date)}
                    </p>
                    <ul>
                      {order.items.map((item) => (
                        <li key={item.product_id ?? item.id}>{item.quantity} × {item.name}</li>
                      ))}
                    </ul>
                    <div className="admin-order-footer">
                      <strong>{order.total_quantity} roti · {rupiah(order.total_price)}</strong>
                      <label>
                        Status
                        <select
                          aria-label={`Status untuk pesanan ${order.code}`}
                          value={order.status}
                          onChange={(event) => handleStatusChange(order.id, event.target.value)}
                        >
                          {orderStatuses.map((status) => <option key={status}>{status}</option>)}
                        </select>
                      </label>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Paper>
        )}

        {tab === 'Kapasitas' && !loading && (
          <Paper className="order-card admin-card" elevation={0}>
            <Typography component="h1" className="admin-title">Kapasitas pengiriman</Typography>
            <p className="muted">Kapasitas tersedia untuk slot pengiriman mendatang.</p>
            <div className="capacity-list">
              {slots.map((slot) => {
                const used = slot.capacity - slot.left
                return (
                  <div className="capacity-item" key={slot.delivery_date}>
                    <div className="capacity-heading">
                      <strong>{formatDelivery(slot.delivery_date)}</strong>
                      <span>{used}/{slot.capacity} roti</span>
                    </div>
                    <div
                      className="capacity-track"
                      role="progressbar"
                      aria-label={`Kapasitas ${formatDelivery(slot.delivery_date)}`}
                      aria-valuenow={used}
                      aria-valuemin={0}
                      aria-valuemax={slot.capacity}
                    >
                      <span style={{ width: `${(used / slot.capacity) * 100}%` }} />
                    </div>
                    <p className="muted">Sisa {slot.left} roti</p>
                  </div>
                )
              })}
            </div>
          </Paper>
        )}

        {tab === 'Produksi' && !loading && (
          <Paper className="order-card admin-card" elevation={0}>
            <Typography component="h1" className="admin-title">Ringkasan produksi</Typography>
            <p className="muted">Jumlah roti dari semua pesanan yang belum dibatalkan.</p>
            {productionList.length === 0 ? (
              <p className="empty-state">Belum ada roti yang perlu diproduksi.</p>
            ) : (
              <div className="production-list">
                {productionList.map((product) => (
                  <div className="production-item" key={product.id}>
                    <img src={product.image_url || FALLBACK_IMAGE} alt="" />
                    <strong>{product.name}</strong>
                    <span>{product.quantity} roti</span>
                  </div>
                ))}
              </div>
            )}
          </Paper>
        )}

        {tab === 'Statistik' && !loading && (
          <Paper className="order-card admin-card" elevation={0}>
            <Typography component="h1" className="admin-title">Statistik</Typography>
            <div className="statistics-chart-slots">
              <div className="statistics-chart-slot" aria-label="Area grafik statistik pertama" />
              <div className="statistics-chart-slot" aria-label="Area grafik statistik kedua" />
            </div>
          </Paper>
        )}
      </div>

      <Dialog open={pwOpen} onClose={closePwDialog} maxWidth="xs" fullWidth>
        <DialogTitle>Ganti Password</DialogTitle>
        <DialogContent>
          {pwSuccess ? (
            <Alert severity="success">{pwSuccess}</Alert>
          ) : (
            <form onSubmit={handleChangePassword} id="change-password-form">
              {pwError && <Alert severity="error" sx={{ mb: 2 }}>{pwError}</Alert>}
              <TextField
                label="Password lama"
                type="password"
                value={oldPw}
                onChange={(event) => setOldPw(event.target.value)}
                required
                fullWidth
                sx={{ mt: 1, mb: 2 }}
              />
              <TextField
                label="Password baru (minimal 8 karakter)"
                type="password"
                value={newPw}
                onChange={(event) => setNewPw(event.target.value)}
                required
                fullWidth
              />
            </form>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closePwDialog}>{pwSuccess ? 'Tutup' : 'Batal'}</Button>
          {!pwSuccess && (
            <Button type="submit" form="change-password-form" variant="contained" disabled={pwSubmitting}>
              {pwSubmitting ? 'Menyimpan...' : 'Simpan'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </main>
  )
}

export default AdminDashboard

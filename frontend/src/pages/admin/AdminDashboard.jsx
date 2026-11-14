import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Paper, Typography } from '@mui/material'
import BrandHeader from '../../components/common/BrandHeader'
import { products } from '../../data/products'
import { orderStatuses } from '../../data/orderStatuses'
import { getDeliveryOptions } from '../../services/deliveryService'
import { isAdminDemoMode } from '../../services/adminAuthService'
import { rupiah } from '../../utils/formatCurrency'

function AdminDashboard({ orders, onUpdateStatus, onSignOut }) {
  const [tab, setTab] = useState('Pesanan')
  const [statusFilter, setStatusFilter] = useState('Semua status')
  const [signOutError, setSignOutError] = useState('')
  const deliveryOptions = getDeliveryOptions(orders)
  const visibleOrders =
    statusFilter === 'Semua status'
      ? orders
      : orders.filter((order) => order.status === statusFilter)
  const totalBreadCount = orders
    .filter((order) => order.status !== 'Dibatalkan')
    .reduce((total, order) => total + order.totalItems, 0)

  const productionList = products
    .map((product) => ({
      ...product,
      quantity: orders
        .filter((order) => order.status !== 'Dibatalkan')
        .reduce(
          (total, order) =>
            total +
            order.items
              .filter((item) => item.id === product.id)
              .reduce((itemTotal, item) => itemTotal + item.quantity, 0),
          0,
        ),
    }))
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
          <Link className="customer-link" to="/">Halaman customer</Link>
          <button className="admin-signout" type="button" onClick={handleSignOut}>
            Keluar
          </button>
        </div>

        
        {signOutError && <Alert severity="error" className="admin-auth-alert">{signOutError}</Alert>}

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

        {tab === 'Pesanan' && (
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
                  <article className="admin-order" key={order.code}>
                    <div className="admin-order-heading">
                      <div>
                        <strong>{order.code}</strong>
                        <p>{order.name} · {order.phone}</p>
                      </div>
                      <span className={`status-pill status-${order.status.toLowerCase()}`}>
                        {order.status}
                      </span>
                    </div>
                    <p className="admin-order-address">{order.address}</p>
                    <p className="muted">
                      Pengiriman {order.delivery.weekday}, {order.delivery.date}
                    </p>
                    <ul>
                      {order.items.map((item) => (
                        <li key={item.id}>{item.quantity} × {item.name}</li>
                      ))}
                    </ul>
                    <div className="admin-order-footer">
                      <strong>{order.totalItems} roti · {rupiah(order.totalPrice)}</strong>
                      <label>
                        Status
                        <select
                          aria-label={`Status untuk pesanan ${order.code}`}
                          value={order.status}
                          onChange={(event) => onUpdateStatus(order.code, event.target.value)}
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

        {tab === 'Kapasitas' && (
          <Paper className="order-card admin-card" elevation={0}>
            <Typography component="h1" className="admin-title">Kapasitas pengiriman</Typography>
            <p className="muted">Kapasitas maksimal setiap jadwal adalah 50 roti.</p>
            <div className="capacity-list">
              {deliveryOptions.map((option) => (
                <div className="capacity-item" key={option.id}>
                  <div className="capacity-heading">
                    <strong>{option.weekday}, {option.date}</strong>
                    <span>{option.used}/{option.capacity} roti</span>
                  </div>
                  <div
                    className="capacity-track"
                    role="progressbar"
                    aria-label={`Kapasitas ${option.weekday}, ${option.date}`}
                    aria-valuenow={option.used}
                    aria-valuemin={0}
                    aria-valuemax={option.capacity}
                  >
                    <span style={{ width: `${(option.used / option.capacity) * 100}%` }} />
                  </div>
                  <p className="muted">Sisa {option.available} roti</p>
                </div>
              ))}
            </div>
          </Paper>
        )}

        {tab === 'Produksi' && (
          <Paper className="order-card admin-card" elevation={0}>
            <Typography component="h1" className="admin-title">Ringkasan produksi</Typography>
            <p className="muted">Jumlah roti dari semua pesanan yang belum dibatalkan.</p>
            {productionList.length === 0 ? (
              <p className="empty-state">Belum ada roti yang perlu diproduksi.</p>
            ) : (
              <div className="production-list">
                {productionList.map((product) => (
                  <div className="production-item" key={product.id}>
                    <img src={product.image} alt="" />
                    <strong>{product.name}</strong>
                    <span>{product.quantity} roti</span>
                  </div>
                ))}
              </div>
            )}
          </Paper>
        )}

        {tab === 'Statistik' && (
          <Paper className="order-card admin-card" elevation={0}>
            <Typography component="h1" className="admin-title">Statistik</Typography>
            <div className="statistics-chart-slots">
              <div className="statistics-chart-slot" aria-label="Area grafik statistik pertama" />
              <div className="statistics-chart-slot" aria-label="Area grafik statistik kedua" />
            </div>
          </Paper>
        )}
      </div>
    </main>
  )
}

export default AdminDashboard

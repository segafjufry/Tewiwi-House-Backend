import { Link } from 'react-router-dom'
import logo from '../../assets/tewiwi-logo.jpeg'

function BrandHeader({ admin = false }) {
  const lastOrderCode = localStorage.getItem('tewiwi-last-order-code')
  const trackHref = lastOrderCode ? `/tracking/${lastOrderCode}` : null

  return (
    <header className="brand-bar">
      <Link to="/" className="brand-lockup">
        <img className="brand-logo" src={logo} alt="Logo Tewiwi House" />
        <span className="brand-name">Tewiwi House</span>
      </Link>
      {admin ? (
        <span className="admin-label">Dashboard admin</span>
      ) : trackHref ? (
        <Link to={trackHref} className="brand-track-link">
          Lacak pesanan
        </Link>
      ) : null}
    </header>
  )
}

export default BrandHeader
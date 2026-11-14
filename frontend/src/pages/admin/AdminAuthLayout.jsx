import { Link } from 'react-router-dom'
import logo from '../../assets/tewiwi-logo.jpeg'

function AdminAuthLayout({ title, description, children }) {
  return (
    <main className="admin-auth-shell">
      <section className="admin-auth-card" aria-labelledby="admin-auth-title">
        <Link to="/" className="admin-auth-brand">
          <img className="brand-logo" src={logo} alt="Logo Tewiwi House" />
          <span>Tewiwi House</span>
        </Link>
        <h1 id="admin-auth-title">{title}</h1>
        <p className="admin-auth-description">{description}</p>
        {children}
      </section>
    </main>
  )
}

export default AdminAuthLayout

import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import ConnectButton from './ConnectButton'
import { network, isConfigured, explorerAddress } from '../config/network'

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="SkillPay home">
      <svg viewBox="0 0 64 64" width="30" height="30" aria-hidden="true">
        <rect width="64" height="64" rx="16" fill="var(--ink)" />
        <path
          d="M20 40c3 3 7 4.5 12 4.5 6.5 0 11-3 11-8.2 0-4.6-3.2-6.6-9.4-7.8l-3.6-.7c-3.4-.7-4.9-1.7-4.9-3.6 0-2.3 2.3-3.8 5.9-3.8 3.2 0 6 1.1 8.2 3"
          fill="none"
          stroke="#fff"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <circle cx="46" cy="18" r="5" fill="var(--marigold)" />
      </svg>
      <span>SkillPay</span>
    </Link>
  )
}

export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const [lastPath, setLastPath] = useState(location.pathname)
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname)
    setMenuOpen(false)
  }

  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {!network.isMainnet && (
        <div className="net-banner">
          You’re on <strong>{network.chain.name}</strong>. Payments use test USDC with no real value.
          {network.faucet && (
            <>
              {' '}
              <a href={network.faucet} target="_blank" rel="noreferrer">
                Get test USDC
              </a>
            </>
          )}
        </div>
      )}
      <header className="topbar">
        <div className="topbar-inner">
          <Logo />
          <button
            className="nav-toggle"
            aria-expanded={menuOpen}
            aria-controls="primary-nav"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className="sr-only">Menu</span>
            <span aria-hidden="true">{menuOpen ? '✕' : '☰'}</span>
          </button>
          <nav id="primary-nav" className={`nav ${menuOpen ? 'nav-open' : ''}`}>
            <NavLink to="/courses">Explore</NavLink>
            <NavLink to="/learn">My learning</NavLink>
            <NavLink to="/teach">Teach</NavLink>
            <ConnectButton />
          </nav>
        </div>
      </header>

      {!isConfigured && (
        <div className="config-warning" role="alert">
          The SkillPay contract address isn’t configured. Set <code>VITE_SKILLPAY_ADDRESS</code> in your environment.
        </div>
      )}

      <main id="main">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <div>
            <Logo />
            <p className="footer-note">Learn from anyone. Pay them in USDC on Arc.</p>
          </div>
          <div className="footer-links">
            <Link to="/courses">Explore courses</Link>
            <Link to="/teach">Teach on SkillPay</Link>
            {explorerAddress(network.skillPayAddress) && isConfigured && (
              <a href={explorerAddress(network.skillPayAddress)} target="_blank" rel="noreferrer">
                Smart contract
              </a>
            )}
            <a href="https://github.com/Kingkanzi0/stablestudy" target="_blank" rel="noreferrer">
              Source code
            </a>
          </div>
          <p className="footer-fine">
            Payments are made directly between your wallet and the tutor’s through an open smart contract. SkillPay never
            holds your funds.
          </p>
        </div>
      </footer>
    </div>
  )
}

import { Link, NavLink, Outlet } from 'react-router-dom'
import ConnectButton from './ConnectButton'
import { network, isConfigured, explorerAddress } from '../config/network'

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="iSabi home">
      <svg viewBox="0 0 64 64" width="30" height="30" aria-hidden="true">
        <rect width="64" height="64" rx="16" fill="var(--ink)" />
        <rect x="26" y="28" width="12" height="24" rx="6" fill="#fff" />
        <circle cx="32" cy="17" r="7" fill="var(--marigold)" />
      </svg>
      <span>
        <span className="logo-i">i</span>Sabi
      </span>
    </Link>
  )
}

const TABS = [
  { to: '/courses', label: 'Explore', icon: 'M11 4a7 7 0 1 0 4.4 12.4l4.3 4.3 1.4-1.4-4.3-4.3A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z' },
  { to: '/learn', label: 'Learning', icon: 'M12 4 2 9l10 5 8-4v6h2V9L12 4Zm-6 8.2V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-3.8l-6 3-6-3Z' },
  { to: '/jobs', label: 'Jobs', icon: 'M9 4a2 2 0 0 0-2 2v1H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3V6a2 2 0 0 0-2-2H9Zm0 2h6v1H9V6ZM4 9h16v3h-7v1h-2v-1H4V9Zm0 5h7v1h2v-1h7v4H4v-4Z' },
  { to: '/escrow', label: 'Escrow', icon: 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Zm0 2.1 6 2.3V11c0 3.9-2.5 7.4-6 8.9-3.5-1.5-6-5-6-8.9V6.4l6-2.3Zm-1 5.4v3H9v2h2v2h2v-2h2v-2h-2v-3h-2Z' },
  { to: '/teach', label: 'Teach', icon: 'M4 4h16v11H9l-5 4V4Zm2 2v8.8L8.3 13H18V6H6Zm2 2h8v2H8V8Z' },
]

export default function Layout() {
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
          <nav className="nav" aria-label="Main">
            {TABS.map((t) => (
              <NavLink key={t.to} to={t.to}>
                {t.to === '/learn' ? 'My learning' : t.label}
              </NavLink>
            ))}
          </nav>
          <ConnectButton />
        </div>
      </header>

      {/* On phones the main sections move to an app-style bar at the bottom of the screen. */}
      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d={t.icon} fill="currentColor" />
            </svg>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>

      {!isConfigured && (
        <div className="config-warning" role="alert">
          The iSabi contract address isn’t configured. Set <code>VITE_SKILLPAY_ADDRESS</code> in your environment.
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
            <Link to="/teach">Teach on iSabi</Link>
            <Link to="/jobs">Web3 jobs</Link>
            <Link to="/escrow/new">Hire with escrow</Link>
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
            Course payments go straight from your wallet to the tutor’s, and escrow payments sit in an open smart contract
            until the work is approved. iSabi never holds your funds.
          </p>
        </div>
      </footer>
    </div>
  )
}

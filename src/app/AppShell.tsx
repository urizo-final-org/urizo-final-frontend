import { useEffect, useState } from 'react'
import LocalFullWorkspace from '../features/local-full/LocalFullWorkspace'
import ProviderSettings from '../features/providers/ProviderSettings'
import { AppNavigation } from './navigation'
import { hashForRoute, routeFromHash, type RouteId } from './routes'

function currentRoute(): RouteId {
  return routeFromHash(window.location.hash)
}

export default function AppShell() {
  const [route, setRoute] = useState<RouteId>(currentRoute)

  useEffect(() => {
    const onHashChange = () => setRoute(currentRoute())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  function navigate(next: RouteId) {
    window.location.hash = hashForRoute(next)
    setRoute(next)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-symbol" aria-hidden="true">AX</span>
          <div><strong>MODULE STUDIO</strong><span>LOCAL CONTROL PLANE</span></div>
        </div>

        <AppNavigation activeRoute={route} onNavigate={navigate} />

        <div className="sidebar-status">
          <span className="live-dot" />
          <div><strong>DEV · LOOPBACK</strong><span>Nginx → React → Spring</span></div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div><span>Workspace</span><strong>AX Module Studio / local-full</strong></div>
          <div className="policy-chip">POLICY ACTIVE</div>
          <div className="avatar" aria-label="Local administrator">LA</div>
        </header>
        <main className="content-area">
          {route === 'local-full' ? <LocalFullWorkspace /> : <ProviderSettings />}
        </main>
      </div>
    </div>
  )
}

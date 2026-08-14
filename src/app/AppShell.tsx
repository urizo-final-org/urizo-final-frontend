import { useCallback, useEffect, useState } from 'react'
import LoginScreen from '../features/auth/LoginScreen'
import { clearStoredToken, readStoredToken, storeToken } from '../features/auth/session-store'
import LocalFullWorkspace from '../features/local-full/LocalFullWorkspace'
import ProviderSettings from '../features/providers/ProviderSettings'
import { fetchCurrentSession, logout, ROLE_LABELS, type AdminSession } from '../shared/api/session'
import { AppNavigation } from './navigation'
import { DEFAULT_ROUTE, hashForRoute, routeForRole, routeFromHash, type RouteId } from './routes'

export default function AppShell() {
  const [route, setRoute] = useState<RouteId>(() => routeFromHash(window.location.hash))
  const [session, setSession] = useState<AdminSession | null>(null)
  const [restoring, setRestoring] = useState(true)
  const [signInNotice, setSignInNotice] = useState<string | null>(null)
  const role = session?.actor.role ?? null

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // A hash is a client-supplied claim. Narrowing it to the role keeps a hand-typed '#providers'
  // from rendering a screen the account may not operate.
  const visibleRoute = role ? routeForRole(route, role) : DEFAULT_ROUTE

  // A stored token survives a reload, but only the server can say whether it still means anything:
  // the account may have been disabled or the session revoked since the tab was last open.
  useEffect(() => {
    let cancelled = false
    const token = readStoredToken()
    if (!token) {
      setRestoring(false)
      return
    }
    fetchCurrentSession(token)
      .then((restored) => { if (!cancelled) setSession(restored) })
      .catch(() => { if (!cancelled) clearStoredToken() })
      .finally(() => { if (!cancelled) setRestoring(false) })
    return () => { cancelled = true }
  }, [])

  const onSignedIn = useCallback((next: AdminSession) => {
    storeToken(next.sessionToken)
    setSignInNotice(null)
    setSession(next)
  }, [])

  /**
   * The server stopped accepting the session while the shell was open.
   *
   * <p>Leaving the operator on a screen whose every request now fails reads as a broken product, so
   * the session is dropped and the reason is carried to the sign-in screen. No logout call: the
   * session is already gone on the server, which is what produced the 401.
   */
  const onSessionExpired = useCallback(() => {
    clearStoredToken()
    setSession((current) => {
      if (current) setSignInNotice('세션이 만료되었습니다. 다시 로그인해 주세요.')
      return null
    })
  }, [])

  const onSignOut = useCallback(async () => {
    const token = session?.sessionToken
    setSession(null)
    setSignInNotice(null)
    clearStoredToken()
    if (token) await logout(token)
  }, [session])

  function navigate(next: RouteId) {
    window.location.hash = hashForRoute(next)
    setRoute(next)
  }

  if (restoring) {
    return (
      <div className="login-screen">
        <div className="workspace-loading"><span className="spinner" />세션을 확인하는 중입니다…</div>
      </div>
    )
  }

  if (!session) {
    return <LoginScreen notice={signInNotice} onSignedIn={onSignedIn} />
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-symbol" aria-hidden="true">AX</span>
          <div><strong>MODULE STUDIO</strong><span>LOCAL CONTROL PLANE</span></div>
        </div>

        <AppNavigation activeRoute={visibleRoute} role={session.actor.role} onNavigate={navigate} />

        <div className="sidebar-status">
          <span className="live-dot" />
          <div><strong>DEV · LOOPBACK</strong><span>Nginx → React → Spring</span></div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div><span>Workspace</span><strong>AX Module Studio / local-full</strong></div>
          <div className="policy-chip">POLICY ACTIVE</div>
          <div className="session-chip">
            <div className="session-chip__identity">
              <strong>{ROLE_LABELS[session.actor.role]}</strong>
              <span>{session.actor.actorId.slice(0, 8)}</span>
            </div>
            <button className="button button--secondary" type="button" onClick={onSignOut}>
              로그아웃
            </button>
          </div>
        </header>
        <main className="content-area">
          {visibleRoute === 'local-full'
            ? <LocalFullWorkspace session={session} onSessionExpired={onSessionExpired} />
            : <ProviderSettings
                sessionToken={session.sessionToken}
                onSessionExpired={onSessionExpired}
              />}
        </main>
      </div>
    </div>
  )
}

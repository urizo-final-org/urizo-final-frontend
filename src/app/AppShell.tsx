import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import LoginScreen from '../features/auth/LoginScreen'
import { clearStoredToken, readStoredToken, storeToken } from '../features/auth/session-store'
import LocalFullWorkspace from '../features/local-full/LocalFullWorkspace'
import ProviderSettings from '../features/providers/ProviderSettings'
import { fetchCurrentSession, logout, ROLE_LABELS, type AdminSession } from '../shared/api/session'
import { AppNavigation } from './navigation'
import { DEFAULT_ROUTE, pathForRoute, routeIdForPath, routesForRole, type RouteId } from './routes'

export default function AppShell() {
  return (
    <BrowserRouter>
      <AppShellContent />
    </BrowserRouter>
  )
}

function AppShellContent() {
  const [session, setSession] = useState<AdminSession | null>(null)
  const [restoring, setRestoring] = useState(true)
  const [signInNotice, setSignInNotice] = useState<string | null>(null)
  const navigate = useNavigate()

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

  function goToRoute(next: RouteId) {
    navigate(pathForRoute(next))
  }

  if (restoring) {
    return (
      <div className="grid min-h-screen place-items-center bg-[linear-gradient(160deg,var(--navy)_0%,var(--navy-soft)_55%,#232f45_100%)] px-5 py-8">
        <div className="grid min-h-[260px] place-items-center gap-3 rounded-2xl border border-dashed border-[#cfd6e1] bg-white p-9 text-center text-xs text-[#707b8d]">
          <span className="h-[25px] w-[25px] animate-[spin_700ms_linear_infinite] rounded-full border-[3px] border-[#e3e0fa] border-t-purple" />
          세션을 확인하는 중입니다…
        </div>
      </div>
    )
  }

  if (!session) {
    return <LoginScreen notice={signInNotice} onSignedIn={onSignedIn} />
  }

  return (
    <AuthenticatedShell
      session={session}
      onSignOut={onSignOut}
      onNavigate={goToRoute}
      onSessionExpired={onSessionExpired}
    />
  )
}

function AuthenticatedShell({
  session,
  onSignOut,
  onNavigate,
  onSessionExpired,
}: {
  session: AdminSession
  onSignOut: () => void
  onNavigate: (route: RouteId) => void
  onSessionExpired: () => void
}) {
  const location = useLocation()
  const visibleRoute = routeIdForPath(location.pathname) ?? DEFAULT_ROUTE
  const permittedRoutes = routesForRole(session.actor.role)

  return (
    <div className="grid min-h-screen grid-cols-[250px_minmax(0,1fr)] max-[820px]:grid-cols-[1fr]">
      <aside className="sticky top-0 flex h-screen flex-col border-r border-[#202a3a] bg-[radial-gradient(circle_at_20%_-10%,rgba(105,87,232,0.36),transparent_18rem),var(--navy)] px-[18px] pb-[18px] pt-[26px] text-[#d7deea] max-[820px]:static max-[820px]:h-auto max-[820px]:p-[14px]">
        <div className="flex items-center gap-3 border-b border-white/[0.08] px-2 pb-[28px] max-[820px]:pb-[14px]">
          <span
            className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] bg-[linear-gradient(135deg,#7d6bf1,#4b39cc)] font-mono text-[13px] font-extrabold leading-none tracking-[-0.08em] text-white shadow-[0_8px_22px_rgba(86,65,213,0.35)]"
            aria-hidden="true"
          >
            AX
          </span>
          <div className="grid gap-1">
            <strong className="text-[13px] tracking-[0.1em]">MODULE STUDIO</strong>
            <span className="text-[9px] tracking-[0.08em] text-[#7e8ba0]">LOCAL CONTROL PLANE</span>
          </div>
        </div>

        <AppNavigation activeRoute={visibleRoute} role={session.actor.role} onNavigate={onNavigate} />

        <div className="mt-auto flex items-center gap-[10px] rounded-[10px] border border-white/[0.07] bg-white/[0.035] px-3 py-[13px] max-[820px]:hidden">
          <span className="h-2 w-2 flex-none rounded-full bg-[#42d3a0] shadow-[0_0_0_4px_rgba(66,211,160,0.1)]" />
          <div className="grid gap-1">
            <strong className="text-[10px] tracking-[0.08em]">DEV · LOOPBACK</strong>
            <span className="text-[9px] tracking-[0.08em] text-[#7e8ba0]">Nginx → React → Spring</span>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="flex min-h-[66px] items-center gap-[14px] border-b border-line bg-white/[0.94] px-[34px] backdrop-blur-[10px] max-[820px]:px-[18px] max-[560px]:min-h-[58px]">
          <div className="mr-auto grid gap-[2px]">
            <span className="text-[9px] uppercase tracking-[0.12em] text-[#8791a2]">Workspace</span>
            <strong className="text-xs">AX Module Studio / local-full</strong>
          </div>
          <div className="rounded-full border border-[#bfeadb] bg-[#e6f8f1] px-[10px] py-[7px] font-mono text-[9px] font-bold leading-none tracking-[0.08em] text-[#087d5d] max-[560px]:hidden">
            POLICY ACTIVE
          </div>
          <div className="ml-auto flex items-center gap-[10px]">
            <div className="grid gap-[2px] text-right">
              <strong className="text-xs text-[#252b38]">{ROLE_LABELS[session.actor.role]}</strong>
              <span className="font-mono text-[9px] leading-[1.4] tracking-[0.06em] text-muted">{session.actor.actorId.slice(0, 8)}</span>
            </div>
            <button
              className="min-h-[38px] rounded-lg border border-[#d8dee7] bg-[#f7f8fa] px-[13px] text-[10px] font-extrabold whitespace-nowrap text-[#4c5669] enabled:hover:bg-[#eef1f5]"
              type="button"
              onClick={onSignOut}
            >
              로그아웃
            </button>
          </div>
        </header>
        <main className="mx-auto w-[min(1450px,100%)] p-[34px] max-[820px]:px-4 max-[820px]:py-[22px]">
          {/* Only a permitted route is ever registered, so a role outside allowedRoles has no
              matching <Route> to hit rather than a hidden one — the hand-typed-URL guard the
              original hash router implemented explicitly is now a property of the registry. */}
          <Routes>
            <Route path="/" element={<Navigate to={pathForRoute(DEFAULT_ROUTE)} replace />} />
            {permittedRoutes.map((route) => (
              <Route
                key={route.id}
                path={route.path}
                element={
                  route.id === 'local-full'
                    ? <LocalFullWorkspace session={session} onSessionExpired={onSessionExpired} />
                    : <ProviderSettings
                        sessionToken={session.sessionToken}
                        onSessionExpired={onSessionExpired}
                      />
                }
              />
            ))}
            <Route path="*" element={<Navigate to={pathForRoute(DEFAULT_ROUTE)} replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

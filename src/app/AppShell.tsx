import { useCallback, useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import LoginScreen from '../features/auth/LoginScreen'
import { clearExplicitSignOut, clearStoredToken, hasExplicitSignOutMarker, markExplicitSignOut, readStoredToken, storeToken } from '../features/auth/session-store'
import CmsWorkspace from '../features/cms/CmsWorkspace'
import PublicSite from '../features/site/PublicSite'
import { CmsApi } from '../features/cms/api'
import { fetchCurrentSession, logout, refreshSession, ROLE_LABELS, type AdminSession } from '../shared/api/session'
import { AppNavigation } from './navigation'
import { defaultRouteForRole, pathForRoute, routeIdForPath, routesForRole, type RouteId } from './routes'

export default function AppShell() {
  return <BrowserRouter><AppEntry /></BrowserRouter>
}

function AppEntry() {
  const location = useLocation()
  return location.pathname.startsWith('/admin') ? <AdminApplication /> : <PublicSite />
}

function AdminApplication() {
  const [session, setSession] = useState<AdminSession | null>(null)
  const [restoring, setRestoring] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function restore() {
      try {
        if (hasExplicitSignOutMarker()) { clearStoredToken(); return }
        const token = readStoredToken()
        const next = token ? await fetchCurrentSession(token) : await refreshSession()
        if (active) { storeToken(next.sessionToken); setSession(next) }
      } catch {
        if (active) clearStoredToken()
      } finally {
        if (active) setRestoring(false)
      }
    }
    void restore()
    return () => { active = false }
  }, [])

  const signedIn = useCallback((next: AdminSession) => {
    clearExplicitSignOut(); storeToken(next.sessionToken); setNotice(null); setSession(next)
  }, [])
  const expired = useCallback(() => {
    clearStoredToken(); setSession(null); setNotice('세션이 만료되었습니다. 다시 로그인해 주세요.')
  }, [])
  const signOut = useCallback(async () => {
    const token = session?.sessionToken
    markExplicitSignOut(); clearStoredToken(); setSession(null)
    if (token) await logout(token)
  }, [session])

  if (restoring) return <div className="grid min-h-screen place-items-center bg-navy text-sm text-white">CMS 세션을 확인하는 중입니다…</div>
  if (!session) return <LoginScreen notice={notice} onSignedIn={signedIn} />
  if (session.actor.role === 'GENERAL_USER') return <Navigate to="/" replace />
  return <AuthenticatedAdmin session={session} onRefresh={signedIn} onExpired={expired} onSignOut={signOut} />
}

function AuthenticatedAdmin({ session, onRefresh, onExpired, onSignOut }: {
  session: AdminSession
  onRefresh: (session: AdminSession) => void
  onExpired: () => void
  onSignOut: () => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const fallback = defaultRouteForRole(session.actor.role)
  const visible = routeIdForPath(location.pathname) ?? fallback
  const permitted = routesForRole(session.actor.role)
  const api = useMemo(() => new CmsApi(session.sessionToken, onRefresh, onExpired), [session.sessionToken, onRefresh, onExpired])

  function go(route: RouteId) { navigate(pathForRoute(route)) }

  return <div className="grid min-h-screen grid-cols-[250px_minmax(0,1fr)] max-[820px]:grid-cols-1">
    <aside className="sticky top-0 flex h-screen flex-col border-r border-[#202a3a] bg-[radial-gradient(circle_at_20%_-10%,rgba(105,87,232,0.36),transparent_18rem),var(--navy)] px-[18px] pb-[18px] pt-[26px] text-[#d7deea] max-[820px]:static max-[820px]:h-auto max-[820px]:p-3">
      <div className="flex items-center gap-3 border-b border-white/[0.08] px-2 pb-6">
        <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] bg-[linear-gradient(135deg,#7d6bf1,#4b39cc)] font-mono text-[13px] font-extrabold text-white">AX</span>
        <div><strong className="block text-[13px] tracking-[0.1em]">MODULE STUDIO</strong><span className="text-[9px] tracking-[0.08em] text-[#7e8ba0]">LOCAL DEMO CMS</span></div>
      </div>
      <AppNavigation activeRoute={visible} role={session.actor.role} onNavigate={go} />
      <a className="mt-auto rounded-lg border border-white/10 p-3 text-center text-xs font-bold text-[#c8d0dd] hover:bg-white/5 max-[820px]:mt-3" href="/" target="_blank" rel="noreferrer">사용자 사이트 열기 ↗</a>
    </aside>
    <div className="min-w-0">
      <header className="flex min-h-[66px] items-center gap-4 border-b border-line bg-white/95 px-8 max-[560px]:px-4">
        <div className="mr-auto"><span className="block text-[9px] uppercase tracking-[.12em] text-muted">AX Module Studio</span><strong className="text-xs">CMS 관리자</strong></div>
        <div className="text-right"><strong className="block text-xs">{session.actor.name}</strong><span className="text-[10px] text-muted">{ROLE_LABELS[session.actor.role]}</span></div>
        <button className="rounded-lg border border-line bg-[#f7f8fa] px-3 py-2 text-xs font-bold" onClick={onSignOut}>로그아웃</button>
      </header>
      <main className="mx-auto w-[min(1450px,100%)] p-8 max-[820px]:p-4">
        <Routes>
          <Route path="/admin" element={<Navigate to={pathForRoute(fallback)} replace />} />
          {permitted.map((route) => <Route key={route.id} path={route.path} element={<CmsWorkspace route={route.id} api={api} />} />)}
          <Route path="/admin/*" element={<Navigate to={pathForRoute(fallback)} replace />} />
        </Routes>
      </main>
    </div>
  </div>
}

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
  const [menuOpen, setMenuOpen] = useState(false)
  const fallback = defaultRouteForRole(session.actor.role)
  const visible = routeIdForPath(location.pathname) ?? fallback
  const permitted = routesForRole(session.actor.role)
  const api = useMemo(() => new CmsApi(session.sessionToken, onRefresh, onExpired), [session.sessionToken, onRefresh, onExpired])

  function go(route: RouteId) { navigate(pathForRoute(route)); setMenuOpen(false) }

  const initials = session.actor.name.replace(/\s+/g, '').slice(0, 2)

  return <div className="flex min-h-screen bg-page">
    <aside className={`sticky top-0 flex h-screen w-[250px] shrink-0 flex-col bg-navy px-[14px] py-5 text-[#dce7ed] transition-transform max-[720px]:fixed max-[720px]:inset-y-0 max-[720px]:left-0 max-[720px]:z-20 ${menuOpen ? 'max-[720px]:translate-x-0' : 'max-[720px]:-translate-x-full'}`}>
      <div className="flex items-center gap-[10px] px-2 pb-6">
        <span className="grid h-[31px] w-[31px] shrink-0 place-items-center rounded-lg bg-accent font-mono text-[11px] font-extrabold text-navy" aria-hidden="true">AX</span>
        <div className="min-w-0">
          <strong className="block text-sm text-white">AX Module Studio</strong>
          <span className="block text-[10px] text-[#8fa6b5]">LOCAL DEMO CMS</span>
        </div>
        <button type="button" className="ml-auto text-lg leading-none text-[#b8ccd5] min-[721px]:hidden" onClick={() => setMenuOpen(false)} aria-label="메뉴 닫기">✕</button>
      </div>
      <AppNavigation activeRoute={visible} role={session.actor.role} onNavigate={go} />
      <div className="mt-auto">
        <a className="flex items-center gap-2 rounded-md p-[10px] text-[11px] text-[#b8cbd6] hover:bg-navy-active hover:text-white" href="/" target="_blank" rel="noreferrer">
          <svg className="h-[15px] w-[15px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 0 20 15.3 15.3 0 0 1 0-20Z" /></svg>
          사용자 사이트 열기<span className="ml-auto" aria-hidden="true">↗</span>
        </a>
        <div className="mt-[15px] flex items-center gap-[9px] border-t border-navy-line px-[7px] pt-[15px]">
          <span className="grid h-[29px] w-[29px] shrink-0 place-items-center rounded-full bg-accent-soft text-[10px] font-bold text-accent-ink" aria-hidden="true">{initials}</span>
          <div className="min-w-0">
            <strong className="block truncate text-[11px] text-white">{session.actor.name}</strong>
            <span className="block text-[10px] text-[#8fa6b5]">{ROLE_LABELS[session.actor.role]}</span>
          </div>
        </div>
      </div>
    </aside>
    {/* The sidebar's own ✕ closes the drawer for keyboard users, so the scrim stays presentational. */}
    {menuOpen && <div className="fixed inset-0 z-10 bg-[#17314966] min-[721px]:hidden" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-[78px] shrink-0 items-center gap-4 border-b border-line bg-panel px-[38px] max-[720px]:px-4">
        <button type="button" className="text-xl leading-none text-[#526b78] min-[721px]:hidden" onClick={() => setMenuOpen(true)} aria-label="메뉴 열기">☰</button>
        <div className="mr-auto"><span className="block text-[10px] text-[#7d909d]">AX Module Studio</span><strong className="mt-1 block text-sm">CMS 관리자</strong></div>
        <div className="text-right max-[560px]:hidden"><strong className="block text-[11px]">{session.actor.name}</strong><span className="text-[10px] text-muted">{ROLE_LABELS[session.actor.role]}</span></div>
        <span className="grid h-[29px] w-[29px] shrink-0 place-items-center rounded-full bg-accent-soft text-[10px] font-bold text-accent-ink max-[560px]:hidden" aria-hidden="true">{initials}</span>
        <button className="shrink-0 rounded-md border border-line bg-[#f7f9fa] px-3 py-2 text-[11px] font-bold text-[#496272] hover:bg-[#eef2f4]" onClick={onSignOut}>로그아웃</button>
      </header>
      <main className={`mx-auto w-full px-[38px] pb-14 pt-[30px] max-[720px]:px-4 max-[720px]:pt-[22px] ${visible === 'members' ? 'max-w-[1450px]' : 'max-w-[1680px]'}`}>
        <Routes>
          <Route path="/admin" element={<Navigate to={pathForRoute(fallback)} replace />} />
          {permitted.map((route) => <Route key={route.id} path={route.path} element={<CmsWorkspace route={route.id} api={api} />} />)}
          <Route path="/admin/*" element={<Navigate to={pathForRoute(fallback)} replace />} />
        </Routes>
      </main>
    </div>
  </div>
}

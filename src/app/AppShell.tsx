import { useCallback, useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import LoginScreen from '../features/auth/LoginScreen'
import { clearExplicitSignOut, clearStoredToken, hasExplicitSignOutMarker, markExplicitSignOut, readStoredToken, storeToken } from '../features/auth/session-store'
import CmsWorkspace from '../features/cms/CmsWorkspace'
import OpsWorkspace from '../features/ops/OpsWorkspace'
import PublicSite from '../features/site/PublicSite'
import { CmsApi } from '../features/cms/api'
import { fetchCurrentSession, logout, refreshSession, ROLE_LABELS, type AdminSession } from '../shared/api/session'
import { Icon } from '../shared/ui/icons'
import { AppNavigation } from './navigation'
import { defaultRouteForRole, groupForRoute, isCmsRouteId, labelForRoute, pathForRoute, routeIdForPath, routes, routesForRole, type RouteId } from './routes'

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

  if (restoring) return <div className="grid min-h-screen place-items-center bg-sb-bg text-sm text-white">CMS 세션을 확인하는 중입니다…</div>
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
  const onMockScreen = routes.find((item) => item.id === visible)?.mock === true

  return <div className="flex min-h-screen bg-page">
    <aside className={`sticky top-0 z-30 flex h-screen w-[236px] shrink-0 flex-col border-r border-sb-border bg-sb-bg transition-transform max-[900px]:fixed max-[900px]:inset-y-0 max-[900px]:left-0 ${menuOpen ? 'max-[900px]:translate-x-0' : 'max-[900px]:-translate-x-full'}`}>
      <div className="flex items-center gap-[9px] px-4 pb-[14px] pt-4">
        <div className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[5px] bg-primary text-accent" aria-hidden="true">
          <Icon name="sparkles" size={15} />
        </div>
        <div className="min-w-0">
          <b className="block text-[13px] tracking-[-.01em] text-sb-strong">AX Module Studio</b>
          <small className="block text-[10px] tracking-[.04em] text-sb-muted">AI OPERATIONS PLATFORM</small>
        </div>
        <button type="button" className="ml-auto text-sb-muted min-[901px]:hidden" onClick={() => setMenuOpen(false)} aria-label="메뉴 닫기">✕</button>
      </div>

      <AppNavigation activeRoute={visible} role={session.actor.role} onNavigate={go} />

      <div className="border-t border-sb-border px-3 pb-3 pt-[10px]">
        <a className="flex w-full items-center gap-2 rounded-[5px] px-2 py-[7px] text-[11.5px] text-sb-muted hover:bg-sb-active hover:text-white" href="/" target="_blank" rel="noreferrer">
          <Icon name="globe-2" />사용자 사이트 열기<span className="ml-auto flex"><Icon name="arrow-up-right" size={13} /></span>
        </a>
        <div className="flex items-center gap-2 px-2 pb-[2px] pt-2">
          <div className="grid h-[25px] w-[25px] shrink-0 place-items-center rounded-full bg-teal-bg text-[9.5px] font-bold text-teal-ink" aria-hidden="true">{initials}</div>
          <div className="min-w-0 flex-1">
            <b className="block truncate text-[11.5px] text-sb-strong">{session.actor.name}</b>
            <small className="block text-[9.5px] text-sb-muted">{session.actor.role}</small>
          </div>
        </div>
      </div>
    </aside>

    {/* The sidebar's own ✕ closes the drawer for keyboard users, so the scrim stays presentational. */}
    {menuOpen && <div className="fixed inset-0 z-20 bg-[#16293c66] min-[901px]:hidden" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

    <div className="flex min-w-0 flex-1 flex-col">
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-4 border-b border-line bg-panel px-7 max-[900px]:px-4">
        <button type="button" className="text-lg leading-none text-muted min-[901px]:hidden" onClick={() => setMenuOpen(true)} aria-label="메뉴 열기">☰</button>
        <div className="flex items-center gap-[7px] text-xs text-muted">
          <span className="max-[560px]:hidden">{groupForRoute(visible)}</span>
          <span className="flex max-[560px]:hidden"><Icon name="chevron-right" size={12} className="text-muted-4" /></span>
          <b className="font-semibold text-ink">{labelForRoute(visible)}</b>
        </div>
        <div className="flex-1" />
        <div className="flex h-[30px] w-[280px] items-center gap-[7px] rounded-[5px] border border-field-line bg-sub px-[9px] max-[1100px]:hidden">
          <Icon name="search" className="text-muted-3" />
          <input
            className="min-w-0 flex-1 border-0 bg-transparent text-xs outline-0"
            placeholder="통합 검색 (준비 중)"
            disabled
            title="통합 검색은 이번 범위에 포함되지 않았습니다."
          />
          <span className="rounded-[3px] border border-[#e2e7ed] bg-white px-1 text-[10px] text-muted-4">⌘K</span>
        </div>
        {onMockScreen && <span className="inline-flex items-center gap-[5px] rounded border border-[#d9e6ef] bg-[#f2f8fc] px-2 py-[3px] text-[10.5px] font-semibold text-[#2c6d94] max-[720px]:hidden">
          <i className="block h-[5px] w-[5px] rounded-full bg-run-dot" aria-hidden="true" />MOCK 데이터
        </span>}
        <div className="flex items-center gap-3 text-muted max-[720px]:hidden">
          <Icon name="bell" size={16} />
          <Icon name="circle-help" size={16} />
        </div>
        <div className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-teal-bg text-[9.5px] font-bold text-teal-ink max-[560px]:hidden" aria-hidden="true">{initials}</div>
        <button className="inline-flex h-[30px] shrink-0 items-center rounded-[5px] border border-btn-line bg-white px-[10px] text-[11.5px] font-semibold text-strong hover:bg-sub" onClick={onSignOut}>로그아웃</button>
      </header>

      <main className="mx-auto w-full max-w-[1400px] px-7 pb-16 pt-[26px] max-[900px]:px-4 max-[900px]:pt-5">
        <Routes>
          <Route path="/admin" element={<Navigate to={pathForRoute(fallback)} replace />} />
          {permitted.map((route) => <Route
            key={route.id}
            path={route.path}
            element={isCmsRouteId(route.id)
              ? <CmsWorkspace route={route.id} api={api} />
              : <OpsWorkspace route={route.id} actorName={session.actor.name} roleLabel={ROLE_LABELS[session.actor.role]} />}
          />)}
          <Route path="/admin/*" element={<Navigate to={pathForRoute(fallback)} replace />} />
        </Routes>
      </main>
    </div>
  </div>
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import LoginScreen from '../features/auth/LoginScreen'
import { clearExplicitSignOut, clearStoredToken, hasExplicitSignOutMarker, markExplicitSignOut, readStoredToken, storeToken } from '../features/auth/session-store'
import CmsWorkspace from '../features/cms/CmsWorkspace'
import ApprovalBell, { type BellNotice } from '../features/coding/ApprovalBell'
import CodingWorkspace from '../features/coding/CodingWorkspace'
import GuardrailWorkspace from '../features/coding/GuardrailWorkspace'
import { KnowledgeAdminApi } from '../features/knowledge/admin-api'
import { usePendingApprovals } from '../features/knowledge/pending-approvals'
import OpsWorkspace from '../features/ops/OpsWorkspace'
import HomeDashboard from '../features/ops/HomeDashboard'
import GovernanceWorkspace from '../features/governance/GovernanceWorkspace'
import { HistoryApi } from '../features/governance/api'
import AgentSettingsWorkspace from '../features/orchestration/AgentSettingsWorkspace'
import ActiveJobMonitoringLink from '../features/orchestration/ActiveJobMonitoringLink'
import { ProfileVersionApi } from '../features/orchestration/api'
import PublicSite from '../features/site/PublicSite'
import { CmsApi } from '../features/cms/api'
import { CodingConsoleApi } from '../features/coding/api'
import { NaturalCmsApi } from '../features/cms/assistant/api'
import { NaturalCmsGuardrailApi } from '../features/cms/assistant/guardrailApi'
import { CmsSiteSettingsApi } from '../features/site-settings/api'
import { fetchCurrentSession, logout, refreshSession, ROLE_LABELS, type AdminSession } from '../shared/api/session'
import { Icon } from '../shared/ui/icons'
import { AppNavigation } from './navigation'
import { defaultRouteForRole, groupForRoute, isCmsRouteId, labelForRoute, pathForRoute, routeIdForPath, routes, routesForRole, type RouteId } from './routes'

const temporaryMockTitle = '임시 목업 · 향후 필요 시 현재 Runtime 계약 기준으로 구현'
const ADMIN_THEME_KEY = 'axms-admin-theme'
type AdminTheme = 'light' | 'dark'

export default function AppShell() {
  return <BrowserRouter><AppEntry /></BrowserRouter>
}

function AppEntry() {
  const location = useLocation()
  return location.pathname.startsWith('/admin')
    ? <AdminApplication />
    : <div className="site-app"><PublicSite /></div>
}

function AdminApplication() {
  const [theme, setTheme] = useState<AdminTheme>(() => {
    try { return window.localStorage.getItem(ADMIN_THEME_KEY) === 'dark' ? 'dark' : 'light' }
    catch { return 'light' }
  })
  const [session, setSession] = useState<AdminSession | null>(null)
  const [restoring, setRestoring] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const currentSession = useRef<AdminSession | null>(null)
  const restoreRefresh = useRef<Promise<AdminSession> | null>(null)

  useEffect(() => {
    let active = true
    async function restore() {
      try {
        if (hasExplicitSignOutMarker()) { clearStoredToken(); return }
        const token = readStoredToken()
        const next = token
          ? await fetchCurrentSession(token)
          : await (restoreRefresh.current ??= refreshSession())
        if (active) {
          currentSession.current = next
          storeToken(next.sessionToken)
          setSession(next)
        }
      } catch {
        if (active) {
          currentSession.current = null
          clearStoredToken()
        }
      } finally {
        if (active) setRestoring(false)
      }
    }
    void restore()
    return () => { active = false }
  }, [])

  const signedIn = useCallback((next: AdminSession) => {
    currentSession.current = next
    clearExplicitSignOut(); storeToken(next.sessionToken); setNotice(null); setSession(next)
  }, [])
  const refreshed = useCallback((expectedToken: string, next: AdminSession) => {
    if (currentSession.current?.sessionToken !== expectedToken) return
    currentSession.current = next
    storeToken(next.sessionToken); setNotice(null); setSession(next)
  }, [])
  const expired = useCallback((expectedToken: string) => {
    if (currentSession.current?.sessionToken !== expectedToken) return
    currentSession.current = null
    clearStoredToken(); setSession(null); setNotice('세션이 만료되었습니다. 다시 로그인해 주세요.')
  }, [])
  const signOut = useCallback(async () => {
    const token = currentSession.current?.sessionToken
    currentSession.current = null
    markExplicitSignOut(); clearStoredToken(); setSession(null)
    if (token) await logout(token)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === 'light' ? 'dark' : 'light'
      try { window.localStorage.setItem(ADMIN_THEME_KEY, next) } catch { /* storage may be disabled */ }
      return next
    })
  }, [])

  if (restoring) return <div className="admin-app grid min-h-screen place-items-center bg-sb-bg text-sm text-white" data-admin-theme={theme}>CMS 세션을 확인하는 중입니다…</div>
  if (!session) return <div className="admin-app" data-admin-theme={theme}><LoginScreen notice={notice} onSignedIn={signedIn} /></div>
  if (session.actor.role === 'GENERAL_USER') return <Navigate to="/" replace />
  return <AuthenticatedAdmin session={session} theme={theme} onToggleTheme={toggleTheme} onRefresh={refreshed} onExpired={expired} onSignOut={signOut} />
}

function AuthenticatedAdmin({ session, theme, onToggleTheme, onRefresh, onExpired, onSignOut }: {
  session: AdminSession
  theme: AdminTheme
  onToggleTheme: () => void
  onRefresh: (expectedToken: string, session: AdminSession) => void
  onExpired: (expectedToken: string) => void
  onSignOut: () => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const fallback = defaultRouteForRole(session.actor.role)
  const visible = routeIdForPath(location.pathname) ?? fallback
  const permitted = routesForRole(session.actor.role)
  const lifecycle = useMemo(() => sessionLifecycle(session.sessionToken, onRefresh, onExpired), [session.sessionToken, onRefresh, onExpired])
  const cmsApi = useMemo(() => new CmsApi(session.sessionToken, lifecycle.refreshed, lifecycle.expired), [session.sessionToken, lifecycle])
  const historyApi = useMemo(() => new HistoryApi(session.sessionToken, lifecycle.refreshed, lifecycle.expired), [session.sessionToken, lifecycle])
  const profileApi = useMemo(() => new ProfileVersionApi(session.sessionToken, lifecycle.refreshed, lifecycle.expired), [session.sessionToken, lifecycle])
  const siteSettingsApi = useMemo(() => new CmsSiteSettingsApi(session.sessionToken, lifecycle.refreshed, lifecycle.expired), [session.sessionToken, lifecycle])
  const naturalCmsApi = useMemo(() => new NaturalCmsApi(session.sessionToken, lifecycle.refreshed, lifecycle.expired), [session.sessionToken, lifecycle])
  const cmsGuardrailApi = useMemo(() => new NaturalCmsGuardrailApi(session.sessionToken, lifecycle.refreshed, lifecycle.expired), [session.sessionToken, lifecycle])
  const codingApi = useMemo(() => new CodingConsoleApi(session.sessionToken, lifecycle.refreshed, lifecycle.expired), [session.sessionToken, lifecycle])
  const knowledgeApi = useMemo(() => new KnowledgeAdminApi(session.sessionToken, lifecycle.refreshed, lifecycle.expired), [session.sessionToken, lifecycle])
  // 자료 갱신 요청은 화면에 들어가야만 보였다. 헤더 종에 실어 들어가기 전에 알린다.
  //
  // **최고 관리자만 본다.** 요청을 처리하는(활성화·롤백) 쪽이 SUPER_ADMIN이다. 같은 줄을
  // 일반 관리자에게 띄우면 눌러 들어가도 할 수 있는 것이 없어, 알림이 아니라 잡음이 된다.
  // 일반 관리자 몫은 "자동 감지된 갱신 필요" 알림인데 그것을 만드는 쪽(스케줄러)이 아직
  // 없으므로, 알릴 것이 생길 때까지 띄우지 않는다.
  const showsRagNews = session.actor.role === 'SUPER_ADMIN'
    && permitted.some((route) => route.id === 'rag')
  const pendingApprovals = usePendingApprovals(knowledgeApi, showsRagNews)

  function go(route: RouteId) { navigate(pathForRoute(route)); setMenuOpen(false) }

  /*
   * 메뉴 옆 숫자 대신 종이다. 숫자 하나는 "들어가 볼 일이 있다"까지만 말하고 무엇이 왔는지는
   * 결국 들어가야 알았다 — 종은 누가 무엇을 요청했는지 한 줄로 먼저 말하고, 그 줄이 화면까지
   * 데려간다. 코딩 알림과 한 자리를 쓰는 이유는 읽는 사람이 던지는 질문이 하나이기 때문이다.
   *
   * 승인 대기 버전은 여기에 싣지 않는다 — 버전 표에 늘 떠 있어 언제든 볼 수 있는 상태를
   * 종에까지 올리면, 상시 켜져 있는 숫자가 방금 온 요청을 가린다.
   */
  const ragNotices: BellNotice[] = (pendingApprovals ?? []).map((request) => ({
    id: `request-${request.requestId}`,
    text: `${request.requestedByName}님이 자료 갱신을 요청했습니다`,
    detail: request.reason ?? undefined,
    at: request.createdAt,
    onPick: () => go('rag'),
  }))

  const initials = session.actor.name.replace(/\s+/g, '').slice(0, 2)
  const onMockScreen = routes.find((item) => item.id === visible)?.mock === true
  const query = new URLSearchParams(location.search)
  const requestedJobId = query.get('jobId') ?? ''
  const monitoringJobId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedJobId) ? requestedJobId : ''
  const canMonitor = permitted.some((route) => route.id === 'models')
  const monitoringAction = (profileKey: 'LLM_OPS' | 'NATURAL_CMS') => canMonitor
    ? <ActiveJobMonitoringLink api={profileApi} profileKey={profileKey} /> : undefined

  return <div className="admin-app flex min-h-screen bg-page" data-admin-theme={theme}>
    {/* text-sb-item is the sidebar's base colour: anything inside inherits light-on-navy by default. */}
    <aside id="admin-sidebar" data-collapsed={sidebarCollapsed} className={`sticky top-0 z-30 flex h-screen w-[14.75rem] shrink-0 flex-col border-r border-sb-border bg-sb-bg text-sb-item transition-transform ${sidebarCollapsed ? 'min-[901px]:w-16' : ''} max-[900px]:fixed max-[900px]:inset-y-0 max-[900px]:left-0 ${menuOpen ? 'max-[900px]:translate-x-0' : 'max-[900px]:-translate-x-full'}`}>
      <div className="flex items-center gap-1.5 px-3 pb-[0.875rem] pt-4">
        {/* Canvas draws this navy-on-white; on the navy sidebar the pair is flipped so it stays visible. */}
        <div className={`grid h-[1.625rem] w-[1.625rem] shrink-0 place-items-center rounded-[0.3125rem] bg-accent text-sb-bg ${sidebarCollapsed ? 'min-[901px]:hidden' : ''}`} aria-hidden="true">
          <Icon name="sparkles" size={15} />
        </div>
        <div className={`min-w-0 ${sidebarCollapsed ? 'min-[901px]:hidden' : ''}`}>
          <b className="block text-[0.8125rem] tracking-[-.01em] text-sb-strong">AX Module Studio</b>
          <small className="block text-[0.625rem] tracking-[.04em] text-sb-muted">AI OPERATIONS PLATFORM</small>
        </div>
        <button type="button" className={`grid h-7 w-7 shrink-0 place-items-center rounded text-sb-muted hover:bg-sb-active hover:text-sb-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-sb-strong max-[900px]:hidden ${sidebarCollapsed ? 'mx-auto' : 'ml-auto'}`} onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'} title={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'} aria-expanded={!sidebarCollapsed} aria-controls="admin-sidebar">
          <Icon name={sidebarCollapsed ? 'chevrons-right' : 'chevrons-left'} size={18} />
        </button>
        <button type="button" className="ml-auto text-sb-muted min-[901px]:hidden" onClick={() => setMenuOpen(false)} aria-label="메뉴 닫기">✕</button>
      </div>

      <AppNavigation activeRoute={visible} role={session.actor.role} onNavigate={go} compact={sidebarCollapsed} />

      <div className="border-t border-sb-border px-3 pb-3 pt-[0.625rem]">
        <a className="flex w-full items-center gap-2 rounded-[0.3125rem] px-2 py-[0.4375rem] text-[0.71875rem] text-sb-muted hover:bg-sb-active hover:text-white" href="/" target="_blank" rel="noreferrer" title="사용자 사이트 열기">
          <Icon name="globe-2" /><span className={sidebarCollapsed ? 'min-[901px]:sr-only' : ''}>사용자 사이트 열기</span><span className={`ml-auto flex ${sidebarCollapsed ? 'min-[901px]:hidden' : ''}`}><Icon name="arrow-up-right" size={13} /></span>
        </a>
        <div className="flex items-center gap-2 px-2 pb-[0.125rem] pt-2">
          <div className="grid h-[1.5625rem] w-[1.5625rem] shrink-0 place-items-center rounded-full bg-teal-bg text-[0.59375rem] font-bold text-teal-ink" aria-hidden="true">{initials}</div>
          <div className={`min-w-0 flex-1 ${sidebarCollapsed ? 'min-[901px]:sr-only' : ''}`}>
            <b className="block truncate text-[0.71875rem] text-sb-strong">{session.actor.name}</b>
            <small className="block text-[0.59375rem] text-sb-muted">{session.actor.role}</small>
          </div>
        </div>
      </div>
    </aside>

    {/* The sidebar's own ✕ closes the drawer for keyboard users, so the scrim stays presentational. */}
    {menuOpen && <div className="fixed inset-0 z-20 bg-[#16293c66] min-[901px]:hidden" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

    <div className="flex min-w-0 flex-1 flex-col">
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-4 border-b border-line bg-panel px-7 max-[900px]:px-4">
        <button type="button" className="text-lg leading-none text-muted min-[901px]:hidden" onClick={() => setMenuOpen(true)} aria-label="메뉴 열기">☰</button>
        <div className="flex items-center gap-[0.4375rem] text-xs text-muted">
          <span className="max-[560px]:hidden">{groupForRoute(visible)}</span>
          <span className="flex max-[560px]:hidden"><Icon name="chevron-right" size={12} className="text-muted-4" /></span>
          <b className="font-semibold text-ink">{labelForRoute(visible)}</b>
        </div>
        <div className="flex-1" />
        <div className="flex h-[1.875rem] w-[17.5rem] items-center gap-[0.4375rem] rounded-[0.3125rem] border border-field-line bg-sub px-[0.5625rem] max-[1100px]:hidden">
          <Icon name="search" className="text-muted-3" />
          <input
            className="min-w-0 flex-1 border-0 bg-transparent text-xs outline-0"
            placeholder="통합 검색 (준비 중)"
            disabled
            title="통합 검색은 이번 범위에 포함되지 않았습니다."
          />
          <span className="rounded-[0.1875rem] border border-[#e2e7ed] bg-white px-1 text-[0.625rem] text-muted-4">⌘K</span>
        </div>
        {onMockScreen && <span className="inline-flex items-center gap-[0.3125rem] rounded border border-[#d9e6ef] bg-[#f2f8fc] px-2 py-[0.1875rem] text-[0.65625rem] font-semibold text-[#2c6d94] max-[720px]:hidden" title={temporaryMockTitle}>
          <i className="block h-[0.3125rem] w-[0.3125rem] rounded-full bg-run-dot" aria-hidden="true" />임시 목업
        </span>}
        <div className="flex items-center gap-3 text-muted max-[720px]:hidden">
          <ApprovalBell api={codingApi} onOpen={() => go('devops')} extra={ragNotices} />
          <Icon name="circle-help" size={16} />
        </div>
        <button
          type="button"
          className="admin-theme-toggle inline-flex h-[1.875rem] items-center gap-1.5 rounded-[0.3125rem] px-2.5 text-[0.6875rem] font-semibold text-strong"
          aria-label={theme === 'light' ? '다크 테마 사용' : '라이트 테마 사용'}
          aria-pressed={theme === 'dark'}
          onClick={onToggleTheme}
        ><span aria-hidden="true">{theme === 'light' ? '☾' : '☀'}</span><span className="max-[560px]:hidden">{theme === 'light' ? 'Dark' : 'Light'}</span></button>
        <div className="grid h-[1.625rem] w-[1.625rem] shrink-0 place-items-center rounded-full bg-teal-bg text-[0.59375rem] font-bold text-teal-ink max-[560px]:hidden" aria-hidden="true">{initials}</div>
        <button className="inline-flex h-[1.875rem] shrink-0 items-center rounded-[0.3125rem] border border-btn-line bg-white px-[0.625rem] text-[0.71875rem] font-semibold text-strong hover:bg-sub" onClick={onSignOut}>로그아웃</button>
      </header>

      <main className="mx-auto w-full max-w-[87.5rem] px-7 pb-16 pt-[1.625rem] max-[900px]:px-4 max-[900px]:pt-5">
        <Routes>
          <Route path="/admin" element={<Navigate to={pathForRoute(fallback)} replace />} />
          {permitted.map((route) => <Route
            key={route.id}
            path={route.path}
            element={isCmsRouteId(route.id)
              ? <CmsWorkspace route={route.id} api={cmsApi} assistantApi={naturalCmsApi} siteSettingsApi={siteSettingsApi} monitoringAction={monitoringAction('NATURAL_CMS')} />
              : route.id === 'home'
                ? <HomeDashboard actorName={session.actor.name} role={session.actor.role} historyApi={historyApi} knowledgeApi={knowledgeApi} profileApi={profileApi} codingApi={codingApi} />
              : route.id === 'models'
                ? <AgentSettingsWorkspace api={profileApi} openMonitoring={query.get('tab') === 'monitoring'} monitoringJobId={monitoringJobId} />
              : route.id === 'devops'
                ? <CodingWorkspace api={codingApi} role={session.actor.role} monitoringAction={monitoringAction('LLM_OPS')} />
              : route.id === 'guardrail'
                ? <GuardrailWorkspace api={codingApi} cmsGuardrailApi={cmsGuardrailApi} />
              : route.id === 'approvals' || route.id === 'runs'
                ? <GovernanceWorkspace route={route.id} api={historyApi} role={session.actor.role} />
              : <OpsWorkspace route={route.id} actorName={session.actor.name} roleLabel={ROLE_LABELS[session.actor.role]} role={session.actor.role} knowledgeApi={knowledgeApi} profileApi={profileApi} siteSettingsApi={siteSettingsApi} />}
          />)}
          <Route path="/admin/*" element={<Navigate to={pathForRoute(fallback)} replace />} />
        </Routes>
      </main>
    </div>
  </div>
}

function sessionLifecycle(
  initialToken: string,
  onRefresh: (expectedToken: string, session: AdminSession) => void,
  onExpired: (expectedToken: string) => void,
) {
  let activeToken = initialToken
  return {
    refreshed(next: AdminSession) {
      const expectedToken = activeToken
      activeToken = next.sessionToken
      onRefresh(expectedToken, next)
    },
    expired() {
      onExpired(activeToken)
    },
  }
}

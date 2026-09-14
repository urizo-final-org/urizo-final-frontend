import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChatWidget } from './ChatWidget'
import { PortalSearch } from './TourPortal'
import { SME_DOMAIN } from './portal-domains'
import { withProject } from './portal-projects'

/**
 * 중기부 지원사업 포털(/sme). 관광 포털과 같은 골격의 도메인 스킨이다(AI02-011).
 *
 * <p>CMS 메뉴·게시판은 싣지 않는다 — 이번 시연 범위는 통합검색과 챗봇이고(02 문서),
 * 관광 포털의 CMS 연동을 복제하면 자연어 CMS 등 다른 팀 영역과의 접점만 늘어난다.
 * 브랜드 문구·색이 상수인 것은 sme CMS 사이트 행이 아직 없어서다 — 생기면 관광처럼
 * 템플릿 데이터로 옮긴다.
 */
const ACCENT = '#3d55c8'

export function SmePortal({ routePath }: { routePath: string }) {
  return <div className="flex min-h-screen flex-col overflow-x-hidden bg-panel text-ink">
    <SmeHeader />
    {routePath === '/search' ? <PortalSearch domain={SME_DOMAIN} /> : <SmeHome />}
    <ChatWidget domain={SME_DOMAIN} />
  </div>
}

function SmeHeader() {
  return <header className="border-b border-line-soft bg-panel">
    <div className="mx-auto flex min-h-[4.25rem] max-w-[75rem] items-center justify-between gap-4 px-7 max-[560px]:px-4">
      <Link to="/sme" className="flex items-center gap-[0.625rem] text-ink no-underline">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[0.625rem] font-black text-white" style={{ background: ACCENT }}>SME</span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="break-words text-[1.25rem] font-black leading-tight tracking-[-.05em] max-[560px]:text-lg">중소벤처기업부</span>
          <span className="text-[0.59375rem] font-extrabold tracking-[.22em] text-muted">BIZ SUPPORT PORTAL</span>
        </span>
      </Link>
      <Link className="whitespace-nowrap text-[0.6875rem] font-bold text-body no-underline hover:text-ink" to="/admin">CMS 관리자</Link>
    </div>
  </header>
}

function SmeHome() {
  const navigate = useNavigate()
  const location = useLocation()
  const [draft, setDraft] = useState('')

  // 홈에서 나가는 모든 이동이 현재 고객사를 실어 나른다. 딥링크로 들어온 방문자가
  // 검색 한 번, 분야 한 번에 다른 고객사로 넘어가던 자리다.
  function searchPath(params: URLSearchParams) {
    const qs = withProject(params, location.search).toString()
    return qs ? `/sme/search?${qs}` : '/sme/search'
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const query = draft.trim()
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    navigate(searchPath(params))
  }

  return <main className="flex flex-1 flex-col">
    <section className="flex-1" style={{ background: '#f0f3fc' }}>
      <div className="mx-auto flex max-w-[75rem] flex-col items-center gap-5 px-7 py-14 text-center max-[560px]:px-4">
        <h1 className="m-0 text-balance break-keep text-[clamp(1.5rem,3.4vw,2.125rem)] font-extrabold tracking-[-.04em]">우리 회사에 맞는 지원사업을 찾아보세요</h1>
        <p className="m-0 text-balance break-keep text-sm text-body">중앙부처·지자체 공고를 한곳에서 검색하고, 챗봇에게 바로 물어보세요.</p>
        <form onSubmit={submit} className="flex h-[3.25rem] w-[min(40rem,100%)] items-center gap-3 rounded-full border border-field-line bg-panel py-0 pl-5 pr-2 shadow-[0_2px_14px_rgba(22,34,47,0.07)]">
          <input value={draft} onChange={(event) => setDraft(event.target.value)} aria-label={SME_DOMAIN.searchAria} placeholder={SME_DOMAIN.searchPlaceholder} className="min-w-0 flex-1 border-0 bg-transparent text-[0.9375rem] text-ink outline-0" />
          <button type="submit" className="h-10 flex-none rounded-full px-[1.625rem] text-sm font-bold text-white" style={{ background: ACCENT }}>검색</button>
        </form>
        <nav aria-label="분야별 검색" className="flex flex-wrap justify-center gap-2">
          {SME_DOMAIN.tabs.map((tab) => <Link key={tab.id}
            to={searchPath(new URLSearchParams(tab.id === 'all' ? '' : `category=${tab.id}`))}
            className="rounded-full border border-field-line bg-panel px-4 py-2 text-xs font-semibold text-body no-underline hover:text-ink"
          >{tab.label}</Link>)}
        </nav>
      </div>
    </section>
  </main>
}

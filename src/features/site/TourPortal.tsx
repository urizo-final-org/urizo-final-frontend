import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { tabToCategory } from '../knowledge/category'
import { useRagQuery } from '../knowledge/useRagQuery'
import { withParticle } from './particle'
import { addressLine, PORTAL_TABS } from './portal-meta'
import { describePortalStatus } from './portal-status'
import { Placeholder, SampleNotice } from './portal-primitives'
import { PortalResultCard } from './PortalResultCard'

/**
 * 관광 포털 정적 화면(I8) — Claude Design 시안 `Travel Portal Redesign.dc.html`을 React로 옮겼다.
 * 검색 API 연동은 I7, 챗봇 실배선은 I6이 맡는다. 이 파일의 MOCK_* 데이터가 그 교체 지점이다.
 *
 * <p>시안의 색은 전부 기존 tokens.css 값과 일치해 새 토큰을 만들지 않았다. 시안이 px로 쓴 크기는
 * 루트 font-size가 유동(clamp)인 이 프로젝트 규약에 맞춰 rem으로 옮겼다.
 */

function SearchGlyph({ size = '1.25rem' }: { size?: string }) {
  return <span className="relative box-border flex-none rounded-full border-[2.5px] border-ink" style={{ width: size, height: size }} aria-hidden="true">
    <span className="absolute -bottom-[3px] -right-[5px] h-[2.5px] w-2 rotate-45 rounded-sm bg-ink" />
  </span>
}

/** 시안 헤더의 원형 로고 마크(삼각형). */
function BrandMark({ size = '2.125rem' }: { size?: string }) {
  return <span className="relative grid flex-none place-items-center rounded-full bg-primary" style={{ width: size, height: size }} aria-hidden="true">
    <span className="h-0 w-0 rotate-45 border-x-[0.375rem] border-b-[0.8125rem] border-x-transparent border-b-white" style={{ transform: 'rotate(45deg) translate(2px,-1px)' }} />
  </span>
}

/**
 * 홈·검색 결과가 함께 쓰는 사이트 헤더.
 *
 * <p>시안의 가운데 메뉴 3종·언어 선택·로그인 버튼은 옮기지 않았다. 어느 것도 갈 곳이나 동작이 없어
 * 죽은 링크가 되고, 미지원 기능을 UI로 약속하지 않는다는 기준과 어긋난다. 우측 슬롯은 실제로
 * 동작하는 CMS 관리자 링크를 유지한다.
 */
export function PortalHeader() {
  return <header className="border-b border-line-soft bg-panel">
    <div className="mx-auto flex h-[4.75rem] max-w-[80rem] items-center gap-7 px-7 max-[560px]:h-16 max-[560px]:px-4">
      <Link to="/" className="flex items-center gap-[0.625rem] whitespace-nowrap text-[1.1875rem] font-extrabold tracking-[-.04em] text-ink no-underline">
        <BrandMark />우리트립
      </Link>
      <Link className="ml-auto whitespace-nowrap text-[0.8125rem] font-semibold text-body no-underline hover:text-ink" to="/admin">CMS 관리자</Link>
    </div>
  </header>
}

type CurationCard = { name: string; cat: string; desc: string }
type CurationSection = { title: string; total: number; cards: CurationCard[] }

/**
 * 코퍼스 500건을 탭 카테고리로 집계해 상위 3개(관광지 192·음식 95·숙박 72)를 섹션으로 삼는다.
 * 카드는 각 카테고리의 코퍼스 순서 앞 3건이다 — 고를 근거가 없어 임의 선별 대신 순서를 쓴다.
 *
 * <p>"이번 주 인기"(조회수 없음)나 "가을 축제"(계절 축 없음)처럼 근거를 못 대는 제목·부제는 쓰지
 * 않는다. 제목은 카테고리명, 부제는 집계한 건수뿐이다.
 */
const HOME_SECTIONS: CurationSection[] = [
  { title: '관광지', total: 192, cards: [
    { name: '송파책박물관', cat: '문화관광 > 전시시설', desc: '전국 최초의 공립 책 박물관으로, 책을 주제로 한 전시·교육·연구를 한다.' },
    { name: '세계조개박물관', cat: '문화관광 > 전시시설', desc: '신안군 자은도에 있으며 갯벌의 환경지표인 조개와 고동류를 전시한다.' },
    { name: '세계물포럼기념센터', cat: '문화관광 > 전시시설', desc: '안동시 성곡동에 있는 2015 대구경북세계물포럼 기념 시설이다.' },
  ] },
  { title: '음식', total: 95, cards: [
    { name: '반도식당', cat: '음식 > 한식', desc: '경주에서 오래된 갈비 맛집으로, 연탄불에 한우 생갈비를 구워 먹는 노포다.' },
    { name: '발산삼계탕', cat: '음식 > 한식', desc: '지하철 5호선 6번 출구 부근에 있고 상가 건물 앞에 자체 주차장이 있다.' },
    { name: '바타타식탁', cat: '음식 > 한식', desc: '표선해수욕장 앞 해산물 요리 전문점으로 제주산 해산물 메뉴가 다양하다.' },
  ] },
  { title: '숙박', total: 72, cards: [
    { name: '도원', cat: '숙박 > 펜션/민박', desc: '객리단길에 위치한 한옥독채스테이로, 마당에서 실외 욕조를 쓸 수 있다.' },
    { name: '더블힐링펜션', cat: '숙박 > 펜션/민박', desc: '모든 객실에 스파를 갖췄고 부안 고사포 해변이 한눈에 들어온다.' },
    { name: '더존펜션', cat: '숙박 > 펜션/민박', desc: '월악산국립공원 내에 있고 청정 1급수 용하구곡을 앞에 두고 있다.' },
  ] },
]

const TAB_PLACEHOLDERS: Record<string, string> = {
  all: '어디로 떠나볼까요?',
  attraction: '어디를 여행하고 싶으신가요?',
  stay: '어느 숙소를 찾으시나요?',
  food: '무엇을 맛보고 싶으신가요?',
  leisure: '어떤 체험을 해볼까요?',
  course: '어떤 여행 코스를 찾으시나요?',
  shopping: '무엇을 쇼핑하고 싶으신가요?',
  event: '어떤 축제를 찾으시나요?',
}

function SectionHead({ title, total }: { title: string; total: number }) {
  return <div className="flex items-end justify-between gap-5">
    <div>
      {/* 시안의 감성 부제 자리. 근거를 댈 수 있는 값은 집계 건수뿐이라 그것만 남긴다. */}
      <p className="m-0 mb-[0.625rem] text-xs font-bold tracking-[.08em] text-muted">코퍼스 {total}건 중 3건</p>
      <h2 className="m-0 text-[clamp(1.625rem,3vw,2.25rem)] font-extrabold tracking-[-.04em] text-ink">{title}</h2>
    </div>
  </div>
}

export function PortalHome() {
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')
  const [tab, setTab] = useState('all')

  function submit(event: FormEvent) {
    event.preventDefault()
    const params = new URLSearchParams()
    const query = draft.trim()
    if (query) params.set('q', query)
    if (tab !== 'all') params.set('category', tab)
    const qs = params.toString()
    navigate(qs ? `/search?${qs}` : '/search')
  }

  const [hero, ...rest] = HOME_SECTIONS

  return <main>
    <section className="mx-auto max-w-[75rem] px-7 pb-2 pt-24 text-center max-[560px]:px-4 max-[560px]:pt-14">
      <h1 className="m-0 text-[clamp(2.5rem,6vw,4.75rem)] font-extrabold leading-[1.12] tracking-[-.05em] text-ink">어디로 떠나볼까요?</h1>

      {/* 탭 8종은 portal-meta의 확정 상수 그대로다. 시안은 6종이지만 확정안이 우선한다. */}
      <div role="tablist" aria-label="여행 검색 카테고리" className="mt-12 flex flex-wrap items-center justify-center gap-1">
        {PORTAL_TABS.map((item) => {
          const on = item.id === tab
          return <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => setTab(item.id)}
            className={`border-b-2 bg-transparent px-4 pb-3 pt-1 text-[0.9375rem] ${on ? 'border-ink font-extrabold text-ink' : 'border-transparent font-semibold text-muted'}`}
          >{item.label}</button>
        })}
      </div>

      <form onSubmit={submit} className="mx-auto mt-9 flex h-16 max-w-[45rem] items-center gap-3 rounded-full border border-field-line bg-panel py-0 pl-6 pr-2 shadow-[0_2px_14px_rgba(22,34,47,0.07)]">
        <SearchGlyph />
        <input value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="여행지 검색" placeholder={TAB_PLACEHOLDERS[tab] ?? TAB_PLACEHOLDERS.all} className="min-w-0 flex-1 border-0 bg-transparent text-base text-ink outline-0" />
        <button type="submit" className="h-12 flex-none rounded-full bg-primary px-8 text-[0.9375rem] font-bold text-white">검색</button>
      </form>
    </section>

    <div className="mx-auto max-w-[75rem] px-7 pb-28 max-[560px]:px-4">
      {/* 첫 섹션만 1:1 대형 카드다. 플레이스홀더 위에 시안의 그라데이션을 덮어 흰 제목 대비를 확보한다. */}
      <section className="pt-16 max-[560px]:pt-12">
        {/* 검색·챗봇은 배선됐지만 이 큐레이션 목록은 여전히 고정이다 — 만들 API가 없다.
            "검색 API 미배선"이라는 기본 라벨은 이제 사실이 아니므로 이 자리에 맞는 문구를 넘긴다. */}
        <SampleNotice label="샘플 데이터 · 추천 목록은 고정입니다" className="mb-8">
          아래 카드는 코퍼스에 실재하는 문서를 카테고리별로 고정 표시한 것입니다. 조회수·계절 같은 큐레이션 축이 없어 집계 상위 카테고리와 코퍼스 순서로만 골랐습니다.
        </SampleNotice>
        <SectionHead title={hero.title} total={hero.total} />
        <div className="mt-8 grid grid-cols-3 gap-5 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1">
          {hero.cards.map((card) => <article key={card.name} className="relative overflow-hidden rounded-2xl">
            <Placeholder label={`사진 · ${card.name}`} className="aspect-square">
              <span className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.7),rgba(0,0,0,0.1)_55%,transparent)]" aria-hidden="true" />
              <strong className="absolute inset-x-6 bottom-6 text-[1.625rem] font-extrabold leading-[1.25] text-white">{card.name}</strong>
            </Placeholder>
          </article>)}
        </div>
      </section>

      {rest.map((section) => <section key={section.title} className="pt-24 max-[560px]:pt-14">
        <SectionHead title={section.title} total={section.total} />
        <div className="mt-8 grid grid-cols-3 gap-5 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1">
          {section.cards.map((card) => <article key={card.name}>
            <Placeholder label={`사진 · ${card.name}`} className="aspect-[4/3] rounded-2xl" />
            <strong className="mt-4 block text-lg font-bold tracking-[-.02em] text-ink">{card.name}</strong>
            <span className="mt-1 block text-[0.6875rem] font-semibold text-muted-2">{card.cat}</span>
            <span className="mt-1 block text-sm leading-[1.6] text-muted">{card.desc}</span>
          </article>)}
        </div>
      </section>)}
    </div>
  </main>
}

/** F11(60초/30회)이 검색과 챗봇을 함께 조인다. 탭 연타·타이핑이 예산을 태우지 않게 한다. */
const SEARCH_DEBOUNCE_MS = 400

export function PortalSearch() {
  const location = useLocation()
  const navigate = useNavigate()
  const params = new URLSearchParams(location.search)
  const query = params.get('q') ?? ''
  const requested = params.get('category')
  const active = PORTAL_TABS.some((tab) => tab.id === requested) ? (requested as string) : 'all'
  const [draft, setDraft] = useState(query)
  const { state, ask, reset } = useRagQuery()

  // URL이 단일 진실 소스다. q를 useState에 복제하지 않으므로 뒤로가기·새로고침·링크 공유가
  // 그대로 동작한다. draft는 제출 전 입력값일 뿐 결과에 관여하지 않는다.
  //
  // 디바운스는 탭 연타 방어다. useRagQuery(useAsync)가 이전 요청을 abort하므로 늦게 온
  // 응답이 화면을 덮지도 않는다.
  useEffect(() => {
    if (!query) {
      reset()
      return
    }
    const timer = setTimeout(() => {
      ask({ query, category: tabToCategory(active) })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, active, ask, reset])

  // 탭 전환은 프론트 필터링이 아니라 category 파라미터를 바꾼 재검색 URL이다.
  // 프론트에서 상위 N건을 걸러내면 결과가 0건이 되기 쉽다 — SQL 평가 순서상 WHERE가
  // ORDER BY·LIMIT보다 먼저라 "필터 후 상위 N건"은 서버에서만 성립한다.
  function search(nextQuery: string, category: string) {
    const next = new URLSearchParams()
    if (nextQuery) next.set('q', nextQuery)
    if (category !== 'all') next.set('category', category)
    const qs = next.toString()
    navigate(qs ? `/search?${qs}` : '/search')
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    search(draft.trim(), active)
  }

  return <main className="flex flex-1 flex-col">
    <div className="border-b border-line-soft bg-panel">
      <div className="mx-auto max-w-[75rem] px-7 pb-7 pt-6 max-[560px]:px-4">
        <form onSubmit={submit} className="flex h-14 max-w-[45rem] items-center gap-3 rounded-full border border-field-line bg-panel py-0 pl-[1.375rem] pr-2 shadow-[0_2px_14px_rgba(22,34,47,0.07)]">
          <SearchGlyph size="1.125rem" />
          <input value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="여행지 검색" placeholder="어디로 떠나볼까요?" className="min-w-0 flex-1 border-0 bg-transparent text-[0.9375rem] text-ink outline-0" />
          <button type="submit" className="h-[2.625rem] flex-none rounded-full bg-primary px-7 text-sm font-bold text-white">검색</button>
        </form>
      </div>
    </div>

    <div className="min-h-[70vh] flex-1 bg-page">
      <div className="mx-auto grid max-w-[75rem] grid-cols-[15.5rem_minmax(0,1fr)] items-start gap-9 px-7 pb-24 pt-10 max-[900px]:grid-cols-1 max-[900px]:gap-6 max-[560px]:px-4">
        <aside aria-label="검색 필터" className="rounded-2xl border border-line-soft bg-panel px-[1.375rem] py-6">
          <p className="m-0 mb-[1.125rem] text-base font-extrabold tracking-[-.03em] text-ink">필터링 결과</p>
          <div className="flex flex-col gap-[2px] max-[900px]:flex-row max-[900px]:flex-wrap max-[900px]:gap-x-4">
            {PORTAL_TABS.map((tab) => {
              const on = tab.id === active
              return <button
                key={tab.id}
                type="button"
                aria-current={on ? 'true' : undefined}
                onClick={() => search(query, tab.id)}
                className={`bg-transparent px-[2px] py-[0.5625rem] text-left text-sm ${on ? 'font-extrabold text-ink underline underline-offset-4' : 'font-semibold text-body'}`}
              >{tab.label}</button>
            })}
          </div>
        </aside>

        <div>
          {/* 시안의 "OO 근처의 검색결과 표시"는 위치 기능이 없어 옮기지 않았다.
              건수는 서버가 고정한 citations 길이(CITATION_LIMIT=3 이하)이며, 코퍼스 전체에서
              몇 건이 일치했는지가 아니다 — 그 값은 공개 응답에 없다. */}
          <h1 className="m-0 mb-3 text-[clamp(1.5rem,2.6vw,2rem)] font-extrabold tracking-[-.04em] text-ink">
            {query ? `“${query}”${withParticle(query, '과', '와')} 일치하는 검색 결과` : '검색 결과'}
            {state.phase === 'ready' && <span className="ml-2 text-base font-bold text-muted">{state.data?.citations.length ?? 0}건</span>}
          </h1>
          <SampleNotice label="관광 코퍼스 500건 · 근거 문서 기준 검색" className="mb-7">
            질문에 대한 <b className="font-semibold">근거가 되는 문서</b>를 찾아 보여 줍니다. 사진은 아직 준비 중이라 자리 표시로 나옵니다.
          </SampleNotice>

          <SearchResults state={state} onRetry={() => ask({ query, category: tabToCategory(active) })} hasQuery={query !== ''} />
        </div>
      </div>
    </div>
  </main>
}

/**
 * 검색 결과 영역의 상태별 표시.
 *
 * <p>`REFUSED`를 오류로 그리지 않는 것이 핵심이다 — "근거가 없어 답하지 않았다"는 RAG가
 * 제대로 동작한 결과이지 장애가 아니다. 경고색과 [다시 시도]를 붙이면 성과를 장애로 보이게 한다.
 *
 * <p>상태 6종의 디자인 정리는 D1에서 한다. 여기서는 동작과 문구만 맞춘다.
 */
function SearchResults({ state, onRetry, hasQuery }: {
  state: ReturnType<typeof useRagQuery>['state']
  onRetry: () => void
  hasQuery: boolean
}) {
  if (!hasQuery) {
    return <PortalNotice title="검색어를 입력해 주세요">
      찾으시는 곳의 이름이나 특징을 적어 주세요. 예: 한옥스테이, 전주 축제
    </PortalNotice>
  }

  if (state.phase === 'idle' || state.phase === 'loading') {
    return <div aria-busy="true" aria-label="검색 중" className="flex flex-col gap-[0.875rem]">
      {[0, 1, 2].map((row) => <Placeholder key={row} label="" className="h-[12.25rem] rounded-2xl" />)}
    </div>
  }

  const status = describePortalStatus(state)
  if (status) {
    return <PortalNotice title={status.title} trace={status.trace} onRetry={status.retry ? onRetry : undefined}>
      {status.detail}
    </PortalNotice>
  }

  const citations = state.data?.citations ?? []
  // ANSWERED인데 인용이 비는 상태는 서버가 막고 있다(V1 불변식). 방어적으로만 둔다.
  if (citations.length === 0) {
    return <PortalNotice title="표시할 결과가 없습니다">다른 검색어로 다시 시도해 주세요.</PortalNotice>
  }

  return <div className="flex flex-col gap-[0.875rem]">
    {citations.map((citation, index) => <PortalResultCard
      key={`${citation.title}-${index}`}
      title={citation.title}
      excerpt={citation.excerpt}
      categoryLabel={citation.categoryLabel}
      eventStatus={citation.eventStatus}
      address={addressLine(citation.excerpt) ?? undefined}
    />)}
  </div>
}

/** 결과 영역의 빈 상태 한 장. 제목 + 부연 + (있으면) 재시도·추적자. */
function PortalNotice({ title, children, trace, onRetry }: {
  title: string
  children?: React.ReactNode
  trace?: string
  onRetry?: () => void
}) {
  return <div className="flex flex-col items-start gap-2 rounded-2xl border border-line-soft bg-panel px-7 py-10">
    <strong className="text-[1.0625rem] font-extrabold tracking-[-.03em] text-ink">{title}</strong>
    {children != null && <span className="text-[0.875rem] leading-[1.7] text-body">{children}</span>}
    {onRetry && <button type="button" onClick={onRetry} className="mt-2 rounded-full bg-primary px-5 py-2 text-[0.8125rem] font-bold text-white">다시 시도</button>}
    {trace && <span className="mt-1 text-[0.75rem] text-muted-3">{trace}</span>}
  </div>
}

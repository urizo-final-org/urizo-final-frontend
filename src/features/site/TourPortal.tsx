import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { PORTAL_TABS } from './portal-meta'

/**
 * 관광 포털 정적 화면(I8) — Claude Design 시안 `Travel Portal Redesign.dc.html`을 React로 옮겼다.
 * 검색 API 연동은 I7, 챗봇 실배선은 I6이 맡는다. 이 파일의 MOCK_* 데이터가 그 교체 지점이다.
 *
 * <p>시안의 색은 전부 기존 tokens.css 값과 일치해 새 토큰을 만들지 않았다. 시안이 px로 쓴 크기는
 * 루트 font-size가 유동(clamp)인 이 프로젝트 규약에 맞춰 rem으로 옮겼다.
 */

/** F5: 이미지 컬럼이 DB에 없어 Flyway가 선행이다. 그때까지 자리만 확보한 줄무늬 플레이스홀더. */
function Placeholder({ label, className = '', children }: { label: string; className?: string; children?: ReactNode }) {
  return <div className={`relative grid place-items-center overflow-hidden bg-[repeating-linear-gradient(45deg,var(--site-ph)_0_12px,var(--site-ph-line)_12px_24px)] ${className}`}>
    <span className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap px-2 text-center font-mono text-[0.625rem] text-site-ph-ink">{label}</span>
    {children}
  </div>
}

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

type CurationCard = { name: string; desc: string }
type CurationSection = { title: string; kicker: string; cards: CurationCard[] }

/** 홈 큐레이션은 데이터 출처가 미정이라 시안과 같은 성격의 정적 카드다(코퍼스에 실재하는 종류). */
const HOME_SECTIONS: CurationSection[] = [
  { title: '이번 주 인기 여행지', kicker: '에디터가 고른 지금 가장 좋은 곳', cards: [
    { name: '경주 대릉원', desc: '고분과 소나무 숲 사이를 걷는 산책로' },
    { name: '북촌한옥마을', desc: '서울 도심 속 전통 한옥 골목길' },
    { name: '해운대 블루라인파크', desc: '해안선을 따라 달리는 해변열차' },
  ] },
  { title: '가을 축제', kicker: '계절이 깊어지는 여행을 만나보세요', cards: [
    { name: '진주남강유등축제', desc: '남강 위를 수놓는 유등 불빛의 향연' },
    { name: '안동국제탈춤페스티벌', desc: '탈춤과 전통 공연이 어우러진 안동의 가을' },
    { name: '정읍 구절초 꽃축제', desc: '옥정호 언덕을 하얗게 뒤덮는 구절초 물결' },
  ] },
  { title: '한옥 스테이', kicker: '머무는 순간까지 여행이 되도록', cards: [
    { name: '전주 도원', desc: '객리단길의 프라이빗 독채 한옥' },
    { name: '안동 구름에', desc: '낙동강변 고택에서 보내는 고요한 하룻밤' },
    { name: '서울 락고재', desc: '북촌 골목 안 전통 한옥에서의 하루' },
  ] },
]

function SectionHead({ title, kicker }: { title: string; kicker: string }) {
  return <div className="flex items-end justify-between gap-5">
    <div>
      <p className="m-0 mb-[0.625rem] text-xs font-bold tracking-[.08em] text-muted">{kicker}</p>
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
        <input value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="여행지 검색" placeholder="어디로 떠나볼까요?" className="min-w-0 flex-1 border-0 bg-transparent text-base text-ink outline-0" />
        <button type="submit" className="h-12 flex-none rounded-full bg-primary px-8 text-[0.9375rem] font-bold text-white">검색</button>
      </form>
    </section>

    <div className="mx-auto max-w-[75rem] px-7 pb-28 max-[560px]:px-4">
      {/* 첫 섹션만 1:1 대형 카드다. 플레이스홀더 위에 시안의 그라데이션을 덮어 흰 제목 대비를 확보한다. */}
      <section className="pt-24 max-[560px]:pt-14">
        <SectionHead title={hero.title} kicker={hero.kicker} />
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
        <SectionHead title={section.title} kicker={section.kicker} />
        <div className="mt-8 grid grid-cols-3 gap-5 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1">
          {section.cards.map((card) => <article key={card.name}>
            <Placeholder label={`사진 · ${card.name}`} className="aspect-[4/3] rounded-2xl" />
            <strong className="mt-4 block text-lg font-bold tracking-[-.02em] text-ink">{card.name}</strong>
            <span className="mt-1 block text-sm leading-[1.6] text-muted">{card.desc}</span>
          </article>)}
        </div>
      </section>)}
    </div>
  </main>
}

type MockResult = { name: string; cat: string; addr: string; desc: string }

/**
 * I7이 공개 검색 API 응답으로 교체할 정적 결과. 표시 규칙을 반영했다 — F1: 10건, F2: score 미표시,
 * F4: category_label 뱃지, 주소는 본문 `[주소]` 줄(portal-meta.addressLine)에서 온다.
 *
 * <p>시안 카드의 별점·평점·리뷰 수·리뷰 인용문은 옮기지 않았다. 코퍼스에 없는 데이터인 데다
 * 별점은 F2가 금지한 점수 표현이다.
 */
const MOCK_RESULTS: MockResult[] = [
  { name: '도원', cat: '숙박 · 펜션/민박', addr: '전북특별자치도 전주시 완산구 팔달로 58-3 (서서학동)', desc: '객리단길에 위치한 한옥 독채 스테이. 마당에서 실외 욕조를 사용할 수 있으며, 오직 한 팀만을 위한 프라이빗 숙소로 운영한다.' },
  { name: '더 한옥', cat: '숙박 · 펜션/민박', addr: '전북특별자치도 전주시 완산구 은행로 68-15', desc: '한옥마을 최중심지에 위치해 전동성당·풍남문·오목대·향교까지 모두 걸어서 5분 거리에 닿을 수 있는 최적의 자리에 있다.' },
  { name: '대동고택', cat: '숙박 · 펜션/민박', addr: '전북특별자치도 전주시 완산구 대동로 7-13 (태평동)', desc: '전주 한옥마을 인근의 고택 숙소. 객실 1실 독채로 운영하며, 고즈넉한 마당과 툇마루에서 조용한 시간을 보낼 수 있다.' },
  { name: '학인당', cat: '체험 · 전통문화', addr: '전북특별자치도 전주시 완산구 향교길 45', desc: '백범 김구 선생이 머물렀던 근대 한옥. 고택 숙박과 함께 다례·국악 등 전통문화 체험 프로그램을 운영한다.' },
  { name: '오목헌', cat: '숙박 · 한옥스테이', addr: '전북특별자치도 전주시 완산구 오목대길 16', desc: '오목대 언덕 아래 자리한 한옥 스테이. 툇마루에 앉으면 한옥마을의 기와지붕 풍경이 한눈에 내려다보인다.' },
  { name: '청연재', cat: '숙박 · 한옥스테이', addr: '전북특별자치도 전주시 완산구 한지길 33', desc: '전통 한지 공방 골목에 자리한 소규모 한옥 숙소. 온돌방과 다도 공간을 갖추고 있어 느린 여행에 어울린다.' },
  { name: '전주한옥마을', cat: '관광지 · 문화관광', addr: '전북특별자치도 전주시 완산구 기린대로 99', desc: '700여 채의 전통 한옥이 모여 있는 국내 최대 규모의 한옥 밀집 지역. 경기전, 전동성당 등 주요 명소가 도보권에 있다.' },
  { name: '교동다원', cat: '음식 · 카페/찻집', addr: '전북특별자치도 전주시 완산구 은행로 65-5', desc: '한옥마을 안 전통 찻집. 오래된 한옥 마루에서 수제 쌍화차와 대추차를 맛볼 수 있어 산책 중 쉬어가기 좋다.' },
  { name: '달빛한옥', cat: '숙박 · 펜션/민박', addr: '전북특별자치도 전주시 완산구 최명희길 12-4', desc: '한옥마을 골목 안쪽의 조용한 한옥 숙소. 밤이면 마당에서 달빛 아래 차 한 잔을 즐길 수 있는 야외 좌석을 운영한다.' },
  { name: '전주향교', cat: '관광지 · 역사유적', addr: '전북특별자치도 전주시 완산구 향교길 139', desc: '고려시대에 창건된 향교로 가을이면 400년 된 은행나무가 노랗게 물든다. 한옥마을 동쪽 끝에서 도보로 닿는다.' },
]

export function PortalSearch() {
  const location = useLocation()
  const navigate = useNavigate()
  const params = new URLSearchParams(location.search)
  const query = params.get('q') ?? ''
  const requested = params.get('category')
  const active = PORTAL_TABS.some((tab) => tab.id === requested) ? (requested as string) : 'all'
  const [draft, setDraft] = useState(query)

  // 탭 전환은 프론트 필터링이 아니라 category 파라미터를 바꾼 재검색 URL이다.
  // I7이 이 파라미터를 PORTAL_TABS.prefixes로 풀어 공개 검색 API에 전달한다. 그전까지
  // MOCK_RESULTS가 하드코딩이라 목록은 바뀌지 않는다 — 알려진 제약이다.
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
          {/* 시안의 "OO 근처의 검색결과 표시"는 위치 기능이 없어 검색어 기준 문구로 바꿨다. */}
          <p className="m-0 mb-1.5 text-[0.8125rem] text-muted">{MOCK_RESULTS.length}건의 검색 결과</p>
          <h1 className="m-0 mb-7 text-[clamp(1.5rem,2.6vw,2rem)] font-extrabold tracking-[-.04em] text-ink">
            {query ? `“${query}”과(와) 일치하는 검색 결과` : '전체 검색 결과'}
          </h1>

          <div className="flex flex-col gap-[0.875rem]">
            {MOCK_RESULTS.map((result) => <article key={result.name} className="grid grid-cols-[15rem_minmax(0,1fr)] overflow-hidden rounded-2xl border border-line-soft bg-panel max-[680px]:grid-cols-1">
              <Placeholder label={`사진 · ${result.name}`} className="h-full min-h-[12.25rem] w-60 max-[680px]:aspect-[16/9] max-[680px]:h-auto max-[680px]:min-h-0 max-[680px]:w-full" />
              <div className="flex flex-col gap-2 px-[1.625rem] py-[1.375rem]">
                <span className="self-start rounded-md border border-line px-2 py-1 text-[0.6875rem] font-bold text-primary">{result.cat}</span>
                <strong className="text-[1.1875rem] font-extrabold tracking-[-.03em] text-ink">{result.name}</strong>
                <span className="text-[0.8125rem] text-muted">{result.addr}</span>
                <span className="mt-1.5 line-clamp-2 text-[0.8125rem] leading-[1.6] text-body">{result.desc}</span>
              </div>
            </article>)}
          </div>
        </div>
      </div>
    </div>
  </main>
}

/** I6이 실제 대화로 교체할 정적 예시 — 근거 3건은 챗봇 citations 노출 수(CITATION_LIMIT)와 같다. */
const CHAT_EVIDENCE = ['도원', '더 한옥', '대동고택']

/** 우하단 상시 노출 플로팅 챗봇. 버튼 사양은 시안(52px 원형·primary·right/bottom 28px)을 따른다. */
export function ChatWidget() {
  const [open, setOpen] = useState(false)

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} aria-label="관광 도우미 열기" className="fixed bottom-7 right-7 z-40 grid h-[3.25rem] w-[3.25rem] place-items-center rounded-full bg-primary text-white shadow-[0_8px_20px_rgba(23,59,91,0.3)] hover:bg-[#12314c]">
      <span className="box-border h-5 w-[1.375rem] rounded-[10px_10px_10px_2px] border-[2.5px] border-white" aria-hidden="true" />
    </button>
  }

  return <aside aria-label="관광 도우미" className="portal-chat-pop fixed bottom-7 right-7 z-40 flex h-[32.5rem] max-h-[calc(100vh-3.5rem)] w-[23.75rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-[0.875rem] border border-line bg-panel shadow-[0_16px_48px_rgba(16,34,47,.26)]">
    <div className="flex flex-none items-center gap-[0.625rem] bg-primary px-4 py-[0.8125rem] text-white">
      <span className="grid h-[1.625rem] w-[1.625rem] place-items-center rounded-lg bg-white/[.18]" aria-hidden="true">
        <span className="box-border h-[0.875rem] w-4 rounded-[7px_7px_7px_2px] border-2 border-white" />
      </span>
      <span className="text-sm font-bold">관광 도우미</span>
      <span className="text-[0.6875rem] font-medium text-sb-muted">AI 여행 안내</span>
      <button type="button" onClick={() => setOpen(false)} aria-label="관광 도우미 닫기" className="ml-auto bg-transparent px-1 py-0.5 text-lg leading-none text-sb-muted hover:text-white">×</button>
    </div>

    {/* I6이 공개 챗봇 API 대화로 교체할 정적 예시. 그때까지 입력은 잠가 실동작을 약속하지 않는다. */}
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-sub px-[0.875rem] py-4">
      <p className="m-0 max-w-[82%] self-end rounded-xl rounded-br-[3px] bg-link px-[0.8125rem] py-[0.625rem] text-[0.8125rem] leading-relaxed text-white">전주 한옥스테이 추천해줘</p>
      <div className="flex max-w-[88%] flex-col gap-[0.5625rem] self-start">
        <p className="m-0 rounded-xl rounded-bl-[3px] border border-line-soft bg-white px-[0.8125rem] py-[0.6875rem] text-[0.8125rem] leading-[1.65] text-body">전주 한옥마을 인근에서 머물기 좋은 한옥 숙소 세 곳을 추천드려요. <b className="text-ink">도원</b>은 하루 한 팀만 받는 독채 숙소이고, <b className="text-ink">더 한옥</b>은 한옥마을 중심가와 가장 가까워요. <b className="text-ink">대동고택</b>은 조용한 고택 분위기를 원하시는 분께 좋습니다.</p>
        <div className="flex flex-col gap-1.5">
          <span className="text-[0.65625rem] font-bold tracking-[.06em] text-muted-3">답변 근거</span>
          {CHAT_EVIDENCE.map((name) => <div key={name} className="flex items-center gap-[0.625rem] rounded-[0.5625rem] border border-line-soft bg-white px-[0.625rem] py-2">
            <Placeholder label="사진" className="h-9 w-9 flex-none rounded-md" />
            <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[0.78125rem] font-bold text-ink">{name}</span>
            <span className="flex-none rounded border border-line px-[0.375rem] py-[0.125rem] text-[0.625rem] font-bold text-primary">숙박</span>
          </div>)}
        </div>
      </div>
    </div>

    <div className="flex flex-none gap-2 border-t border-line-soft bg-panel px-3 py-[0.6875rem]">
      <input disabled placeholder="메시지를 입력하세요…" title="챗봇 연동은 I6에서 연결됩니다." aria-label="관광 도우미 메시지" className="min-w-0 flex-1 rounded-[0.5625rem] border border-field-line bg-white px-3 py-2 text-[0.8125rem] text-ink outline-0" />
      <button type="button" disabled title="챗봇 연동은 I6에서 연결됩니다." className="flex-none rounded-[0.5625rem] bg-primary px-[0.9375rem] py-2 text-[0.78125rem] font-bold text-white">전송</button>
    </div>
  </aside>
}

import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '../../shared/ui/icons'
import { PORTAL_TABS } from './portal-meta'

/**
 * 관광 포털 정적 화면(I8) — Claude Design 시안 `Tour Portal Prototype.dc.html`을 React로 옮겼다.
 * 검색 API 연동은 I7, 챗봇 실동작은 I6이 맡는다. 이 파일의 MOCK_* 데이터가 그 교체 지점이다.
 */

/** 챗봇 말풍선 외곽선. shared 아이콘 목록에 없는 포털 전용 path라 로컬에 둔다. */
const CHAT_D = 'M21 11.5a8.38 8.38 0 0 1-8.5 8.5c-1.6 0-3.1-.4-4.4-1.2L3 20l1.2-4.1A8.38 8.38 0 0 1 3.5 11.5 8.5 8.5 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z'

function PIcon({ d, size = 22, stroke = 1.8 }: { d: string; size?: number; stroke?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
}

/** 카테고리 뱃지는 기존 상태 토큰을 그대로 쓴다 — 새 색을 만들지 않는다. */
const chipSkin = {
  ok: 'bg-ok-bg text-ok-fg',
  teal: 'bg-teal-bg text-teal-fg',
  wait: 'bg-wait-bg text-wait-fg',
  run: 'bg-run-bg text-run-fg',
  idle: 'bg-idle-bg text-idle-fg',
  fail: 'bg-fail-bg text-fail-fg',
} as const

function CategoryChip({ tone, label }: { tone: keyof typeof chipSkin; label: string }) {
  return <span className={`flex-none rounded px-2 py-[0.125rem] text-[0.65625rem] font-semibold ${chipSkin[tone]}`}>{label}</span>
}

/** F5: 이미지 컬럼이 DB에 없어 Flyway가 선행이다. 그때까지 자리만 확보한 줄무늬 플레이스홀더. */
function Placeholder({ label, className = '' }: { label: string; className?: string }) {
  return <div className={`grid place-items-center bg-[repeating-linear-gradient(45deg,var(--site-ph)_0_12px,var(--site-ph-line)_12px_24px)] ${className}`}>
    <span className="overflow-hidden text-ellipsis whitespace-nowrap px-1.5 text-center font-mono text-[0.625rem] text-site-ph-ink">{label}</span>
  </div>
}

function tabById(id: string) {
  return PORTAL_TABS.find((tab) => tab.id === id) ?? PORTAL_TABS[0]
}

export function PortalHeader() {
  return <header className="flex items-center gap-3 border-b border-line-soft bg-panel px-8 py-4 max-[560px]:px-4">
    <Link to="/" className="flex items-center gap-3 no-underline">
      <span className="grid h-[2.125rem] w-[2.125rem] flex-none place-items-center rounded-[0.5625rem] bg-primary text-[0.9375rem] font-extrabold text-white" aria-hidden="true">가</span>
      <span className="whitespace-nowrap text-[1.0625rem] font-extrabold tracking-[-.01em] text-ink">가보자 <span className="ml-1 whitespace-nowrap text-xs font-medium text-muted-2 max-[560px]:hidden">한국 관광 정보 포털</span></span>
    </Link>
    <Link className="ml-auto text-[0.6875rem] font-bold text-muted-2 no-underline hover:text-link" to="/admin">CMS 관리자</Link>
  </header>
}

type CurationCard = { name: string; tab: string; desc: string }

/** 홈 큐레이션은 데이터 출처가 미정이라(조사 미결 8) 시안 문구 그대로의 정적 카드다. */
const HOME_SECTIONS: { title: string; cards: CurationCard[] }[] = [
  { title: '이번 주 인기 여행지', cards: [
    { name: '경주 대릉원', tab: 'attraction', desc: '고분과 소나무 숲 사이 산책로가 아름다운 경주의 대표 유적지' },
    { name: '여수 낭만포차거리', tab: 'food', desc: '밤바다를 바라보며 즐기는 여수의 명물 포장마차 거리' },
    { name: '해운대 블루라인파크', tab: 'leisure', desc: '해안선을 따라 달리는 스카이캡슐과 해변열차' },
    { name: '북촌한옥마을', tab: 'attraction', desc: '서울 도심 속 전통 한옥 골목길 산책 코스' },
  ] },
  { title: '가을 축제', cards: [
    { name: '진주남강유등축제', tab: 'event', desc: '남강 위를 수놓는 유등 불빛의 향연' },
    { name: '안동국제탈춤페스티벌', tab: 'event', desc: '탈춤과 전통 공연이 어우러진 안동의 대표 축제' },
    { name: '정읍 구절초 꽃축제', tab: 'event', desc: '옥정호 언덕을 하얗게 뒤덮는 구절초 물결' },
    { name: '제주 산굼부리 억새', tab: 'attraction', desc: '은빛 억새가 바람에 일렁이는 가을 제주의 명소' },
  ] },
  { title: '한옥 스테이', cards: [
    { name: '전주 도원', tab: 'stay', desc: '객리단길의 프라이빗 독채 한옥, 마당 실외 욕조' },
    { name: '안동 구름에', tab: 'stay', desc: '낙동강변 고택에서 보내는 고요한 하룻밤' },
    { name: '경주 무우헌', tab: 'stay', desc: '대릉원 곁 한옥에서 즐기는 다도와 아침 산책' },
    { name: '서울 락고재', tab: 'stay', desc: '북촌 골목 안 전통 한옥에서의 특별한 숙박' },
  ] },
]

export function PortalHome() {
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    const query = draft.trim()
    navigate(query ? `/search?q=${encodeURIComponent(query)}` : '/search')
  }

  return <main>
    <section className="flex flex-col items-center gap-9 border-b border-site-line bg-site-hero px-6 pb-12 pt-16" aria-label="통합검색">
      <div className="flex flex-col items-center gap-[0.625rem] text-center">
        <h1 className="m-0 text-[1.875rem] font-extrabold tracking-[-.02em] text-ink">이번 여행, 어디로 갈까요?</h1>
        <p className="m-0 text-[0.90625rem] text-muted">여행지·숙소·맛집을 한 번에 검색하고, 궁금한 건 AI에게 물어보세요</p>
      </div>
      <form onSubmit={submit} className="flex w-[min(42.5rem,100%)] items-center gap-3 rounded-[0.875rem] border-[1.5px] border-accent bg-white px-5 py-4 shadow-[0_1px_2px_rgba(22,34,47,.04),0_6px_22px_rgba(98,199,205,.16)]">
      <Icon name="search" size={20} className="text-muted-2" />
      <input value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="통합검색" placeholder="어디로 떠나볼까요?" className="min-w-0 flex-1 border-0 bg-transparent text-base text-ink outline-0" />
      <button type="submit" className="flex-none rounded-[0.5625rem] bg-primary px-[1.375rem] py-[0.5625rem] text-sm font-bold text-white">검색</button>
      </form>
      {/* 카테고리 선택 = category 파라미터를 붙인 검색 이동. 프론트 필터링이 아니다(확정 UX 3). */}
      <nav className="flex flex-wrap justify-center gap-[1.625rem]" aria-label="카테고리">
        {PORTAL_TABS.map((tab) => <button key={tab.id} type="button" onClick={() => navigate(tab.id === 'all' ? '/search' : `/search?category=${tab.id}`)} className="flex flex-col items-center gap-2 bg-transparent p-0">
          <span className="grid h-[3.375rem] w-[3.375rem] place-items-center rounded-full border border-line bg-white text-body">
            <PIcon d={tab.icon} />
          </span>
          <span className="text-[0.78125rem] font-medium text-body">{tab.label}</span>
        </button>)}
      </nav>
    </section>

    <div className="mx-auto flex w-full max-w-[70rem] flex-col gap-11 px-6 pb-[4.5rem] pt-10">
      {HOME_SECTIONS.map((section) => <section key={section.title}>
        <h2 className="mb-4 mt-0 text-[1.1875rem] font-extrabold tracking-[-.01em] text-ink">{section.title}</h2>
        <div className="grid grid-cols-4 gap-[1.125rem] max-[900px]:grid-cols-2 max-[560px]:grid-cols-1">
          {/* 상세 페이지가 미정이라(조사 미결 11) 카드는 클릭을 약속하지 않는 정적 요소로 둔다. */}
          {section.cards.map((card) => {
            const tab = tabById(card.tab)
            return <article key={card.name} className="overflow-hidden rounded-xl border border-line-soft bg-panel shadow-[0_1px_2px_rgba(22,34,47,.05)]">
              <Placeholder label={`사진 · ${card.name}`} className="aspect-video" />
              <div className="flex flex-col gap-[0.375rem] px-[0.9375rem] pb-[0.9375rem] pt-[0.8125rem]">
                <div className="flex items-center gap-2">
                  <h3 className="m-0 overflow-hidden text-ellipsis whitespace-nowrap text-[0.9375rem] font-bold tracking-[-.01em] text-ink">{card.name}</h3>
                  <CategoryChip tone={tab.tone} label={tab.label} />
                </div>
                <p className="m-0 overflow-hidden text-ellipsis whitespace-nowrap text-[0.78125rem] text-muted">{card.desc}</p>
              </div>
            </article>
          })}
        </div>
      </section>)}
    </div>
  </main>
}

type MockResult = { name: string; tab: string; cat: string; addr: string; desc: string }

/**
 * I7이 공개 검색 API 응답으로 교체할 정적 결과. 표시 규칙을 미리 반영했다 —
 * F1: 10건 노출, F2: score 미표시, F4: category_label 뱃지, 주소줄(본문 [주소] 파싱은 portal-meta.addressLine).
 */
const MOCK_RESULTS: MockResult[] = [
  { name: '도원', tab: 'stay', cat: '숙박 · 펜션/민박', addr: '전북특별자치도 전주시 완산구 팔달로 58-3 (서서학동)', desc: '객리단길에 위치한 한옥 독채 스테이. 마당에서 실외 욕조를 사용할 수 있으며, 오직 한 팀만을 위한 프라이빗 숙소로 운영한다.' },
  { name: '더 한옥', tab: 'stay', cat: '숙박 · 펜션/민박', addr: '전북특별자치도 전주시 완산구 은행로 68-15', desc: '한옥마을 최중심지에 위치해 전동성당·풍남문·오목대·향교까지 모두 걸어서 5분 거리에 닿을 수 있는 최적의 자리에 있다.' },
  { name: '대동고택', tab: 'stay', cat: '숙박 · 펜션/민박', addr: '전북특별자치도 전주시 완산구 대동로 7-13 (태평동)', desc: '전주 한옥마을 인근의 고택 숙소. 객실 1실 독채로 운영하며, 고즈넉한 마당과 툇마루에서 조용한 시간을 보낼 수 있다.' },
  { name: '학인당', tab: 'leisure', cat: '체험 · 전통문화', addr: '전북특별자치도 전주시 완산구 향교길 45', desc: '백범 김구 선생이 머물렀던 근대 한옥. 고택 숙박과 함께 다례·국악 등 전통문화 체험 프로그램을 운영한다.' },
  { name: '오목헌', tab: 'stay', cat: '숙박 · 한옥스테이', addr: '전북특별자치도 전주시 완산구 오목대길 16', desc: '오목대 언덕 아래 자리한 한옥 스테이. 툇마루에 앉으면 한옥마을의 기와지붕 풍경이 한눈에 내려다보인다.' },
  { name: '청연재', tab: 'stay', cat: '숙박 · 한옥스테이', addr: '전북특별자치도 전주시 완산구 한지길 33', desc: '전통 한지 공방 골목에 자리한 소규모 한옥 숙소. 온돌방과 다도 공간을 갖추고 있어 느린 여행에 어울린다.' },
  { name: '전주한옥마을', tab: 'attraction', cat: '관광지 · 문화관광', addr: '전북특별자치도 전주시 완산구 기린대로 99', desc: '700여 채의 전통 한옥이 모여 있는 국내 최대 규모의 한옥 밀집 지역. 경기전, 전동성당 등 주요 명소가 도보권에 있다.' },
  { name: '교동다원', tab: 'food', cat: '음식 · 카페/찻집', addr: '전북특별자치도 전주시 완산구 은행로 65-5', desc: '한옥마을 안 전통 찻집. 오래된 한옥 마루에서 수제 쌍화차와 대추차를 맛볼 수 있어 산책 중 쉬어가기 좋다.' },
  { name: '달빛한옥', tab: 'stay', cat: '숙박 · 펜션/민박', addr: '전북특별자치도 전주시 완산구 최명희길 12-4', desc: '한옥마을 골목 안쪽의 조용한 한옥 숙소. 밤이면 마당에서 달빛 아래 차 한 잔을 즐길 수 있는 야외 좌석을 운영한다.' },
  { name: '전주향교', tab: 'attraction', cat: '관광지 · 역사유적', addr: '전북특별자치도 전주시 완산구 향교길 139', desc: '고려시대에 창건된 향교로 가을이면 400년 된 은행나무가 노랗게 물든다. 한옥마을 동쪽 끝에서 도보로 닿는다.' },
]

export function PortalSearch() {
  const location = useLocation()
  const navigate = useNavigate()
  const params = new URLSearchParams(location.search)
  const query = params.get('q') ?? ''
  const requested = params.get('category')
  const active = PORTAL_TABS.some((tab) => tab.id === requested) ? (requested as string) : 'all'
  const [draft, setDraft] = useState(query)

  // 탭 전환은 프론트 필터링이 아니라 category 파라미터를 바꾼 재검색 URL이다(확정 UX 3).
  // I7이 이 파라미터를 PORTAL_TABS.prefixes로 풀어 공개 검색 API에 전달한다.
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

  return <div className="flex flex-1 flex-col">
    <header className="border-b border-line-soft bg-panel">
      <div className="mx-auto flex w-full max-w-[70rem] items-center gap-5 px-8 py-[0.875rem] max-[560px]:gap-3 max-[560px]:px-4">
        <Link to="/" className="flex flex-none items-center gap-[0.625rem] no-underline">
          <span className="grid h-[1.875rem] w-[1.875rem] place-items-center rounded-lg bg-primary text-[0.8125rem] font-extrabold text-white" aria-hidden="true">가</span>
          <span className="text-[0.9375rem] font-extrabold text-ink max-[560px]:hidden">가보자</span>
        </Link>
        <form onSubmit={submit} className="flex max-w-[35rem] flex-1 items-center gap-[0.625rem] rounded-[0.6875rem] border-[1.5px] border-accent bg-white px-[0.875rem] py-[0.5625rem] shadow-[0_1px_2px_rgba(22,34,47,.04)]">
          <Icon name="search" size={17} className="text-muted-2" />
          <input value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="통합검색" placeholder="어디로 떠나볼까요?" className="min-w-0 flex-1 border-0 bg-transparent text-[0.90625rem] font-medium text-ink outline-0" />
          <button type="submit" className="flex-none rounded-[0.4375rem] bg-primary px-4 py-1.5 text-[0.78125rem] font-bold text-white">검색</button>
        </form>
        <Link className="ml-auto flex-none text-[0.6875rem] font-bold text-muted-2 no-underline hover:text-link max-[560px]:hidden" to="/admin">CMS 관리자</Link>
      </div>
      <nav aria-label="카테고리 탭" className="mx-auto flex w-full max-w-[70rem] gap-1.5 overflow-x-auto px-8 max-[560px]:px-4">
        {PORTAL_TABS.map((tab) => {
          const on = tab.id === active
          return <button key={tab.id} type="button" aria-current={on ? 'true' : undefined} onClick={() => search(query, tab.id)} className={`whitespace-nowrap bg-transparent px-[0.8125rem] py-[0.625rem] text-[0.8125rem] ${on ? 'font-bold text-primary shadow-[inset_0_-2px_var(--primary)]' : 'font-medium text-muted'}`}>{tab.label}</button>
        })}
      </nav>
    </header>

    <main className="mx-auto w-full max-w-[55rem] px-6 pb-20 pt-[1.375rem]">
      <p className="m-0 border-b border-line pb-3 text-[0.8125rem] text-body">
        {query ? <>&lsquo;<b className="text-ink">{query}</b>&rsquo; </> : null}검색 결과 <b className="text-ink">{MOCK_RESULTS.length}건</b>
      </p>
      <div className="flex flex-col">
        {MOCK_RESULTS.map((result) => {
          const tab = tabById(result.tab)
          return <article key={result.name} className="flex gap-4 border-b border-row-line py-[1.125rem]">
            <Placeholder label={`사진 · ${result.name}`} className="h-[6.1875rem] w-[8.25rem] flex-none rounded-lg border border-line-soft" />
            <div className="flex min-w-0 flex-1 flex-col gap-[0.3125rem]">
              <div className="flex flex-wrap items-center gap-[0.5625rem]">
                <h3 className="m-0 text-[0.96875rem] font-bold tracking-[-.01em] text-link">{result.name}</h3>
                <CategoryChip tone={tab.tone} label={result.cat} />
              </div>
              <p className="m-0 text-xs text-muted-2">{result.addr}</p>
              <p className="m-0 line-clamp-2 text-[0.8125rem] leading-[1.6] text-body">{result.desc}</p>
            </div>
          </article>
        })}
      </div>
    </main>
  </div>
}

/** I6이 실제 대화로 교체할 정적 예시 — 근거 3건은 챗봇 citations 노출 수(F1)와 같다. */
const CHAT_EVIDENCE = [
  { name: '도원', cat: '숙박' },
  { name: '더 한옥', cat: '숙박' },
  { name: '대동고택', cat: '숙박' },
]

/** 우하단 상시 노출 플로팅 챗봇(확정 UX 2·4). 열기 전에는 버튼, 열면 고정 패널이다. */
export function ChatWidget() {
  const [open, setOpen] = useState(false)

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} aria-label="관광 도우미 열기" className="fixed bottom-7 right-7 z-40 grid h-[3.625rem] w-[3.625rem] place-items-center rounded-full bg-link text-white shadow-[0_6px_20px_rgba(29,95,138,.38)] hover:bg-primary">
      <PIcon d={CHAT_D} size={26} stroke={2} />
    </button>
  }

  return <aside aria-label="관광 도우미" className="portal-chat-pop fixed bottom-7 right-7 z-40 flex h-[32.5rem] max-h-[calc(100vh-3.5rem)] w-[23.75rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-[0.875rem] border border-line bg-panel shadow-[0_16px_48px_rgba(16,34,47,.26)]">
    <div className="flex flex-none items-center gap-[0.625rem] bg-primary px-4 py-[0.8125rem] text-white">
      <span className="grid h-[1.625rem] w-[1.625rem] place-items-center rounded-lg bg-white/[.18]" aria-hidden="true"><PIcon d={CHAT_D} size={14} stroke={2} /></span>
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
          {CHAT_EVIDENCE.map((item) => <div key={item.name} className="flex items-center gap-[0.625rem] rounded-[0.5625rem] border border-line-soft bg-white px-[0.625rem] py-2">
            <Placeholder label="사진" className="h-9 w-9 flex-none rounded-md" />
            <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[0.78125rem] font-bold text-ink">{item.name}</span>
            <CategoryChip tone="teal" label={item.cat} />
          </div>)}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {['주차 되는 곳은?', '근처 맛집도 알려줘'].map((quick) => <button key={quick} type="button" disabled title="챗봇 연동은 I6에서 연결됩니다." className="rounded-full border border-btn-line bg-white px-[0.6875rem] py-[0.3125rem] text-[0.71875rem] font-medium text-body">{quick}</button>)}
      </div>
    </div>

    <div className="flex flex-none gap-2 border-t border-line-soft bg-panel px-3 py-[0.6875rem]">
      <input disabled placeholder="메시지를 입력하세요…" title="챗봇 연동은 I6에서 연결됩니다." aria-label="관광 도우미 메시지" className="min-w-0 flex-1 rounded-[0.5625rem] border border-field-line bg-white px-3 py-2 text-[0.8125rem] text-ink outline-0" />
      <button type="button" disabled title="챗봇 연동은 I6에서 연결됩니다." className="flex-none rounded-[0.5625rem] bg-primary px-[0.9375rem] py-2 text-[0.78125rem] font-bold text-white">전송</button>
    </div>
  </aside>
}

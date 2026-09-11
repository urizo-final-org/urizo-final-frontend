import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { Menu, Post, SiteTemplate } from '../cms/api'
import { tabToCategory } from '../knowledge/category'
import { useRagQuery } from '../knowledge/useRagQuery'
import { withParticle } from './particle'
import { addressLine, festivalBadge, highlightTitles, PORTAL_TABS } from './portal-meta'
import { describePortalStatus } from './portal-status'
import { CardPhoto, Placeholder, PhotoTag, SampleNotice } from './portal-primitives'
import { PortalResultCard } from './PortalResultCard'
import { menuDestination, orderedMenus } from './siteNavigation'

/**
 * 관광 포털 3화면(홈·통합 검색·챗봇) — Claude Design 핸드오프
 * `design_handoff_tour_portal_redesign`(Portal-Main·Portal-Search·Portal-Chatbot)을 React로 옮겼다.
 *
 * <p>바뀐 것은 마크업·클래스·문구뿐이다. 검색·챗봇의 공개 API 연동, CMS 계약값(`SiteTemplate`),
 * 메뉴 API, 상태 6종 분기(`describePortalStatus`)는 이전 구현을 그대로 쓴다.
 *
 * <p>시안의 색은 전부 `site-theme.css` 토큰 값과 같아 새 토큰을 만들지 않았다. 시안이 px로 쓴
 * 크기는 루트 font-size가 유동(clamp)인 이 프로젝트 규약에 맞춰 rem으로 옮겼다.
 */

/** 시안 검색바의 돋보기(원 + 손잡이). */
function SearchGlyph({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="flex-none" aria-hidden="true">
    <circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" />
  </svg>
}

/** 시안 헤더의 원형 로고 마크(종이비행기). */
function BrandMark({ size = '2.125rem' }: { size?: string }) {
  return <span className="grid flex-none place-items-center rounded-full bg-primary" style={{ width: size, height: size }} aria-hidden="true">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="#ffffff"><path d="M20 4 4 11l7 2 2 7z" /></svg>
  </span>
}

/** 챗봇 버튼·패널·AI 요약이 함께 쓰는 말풍선 아이콘. */
function ChatGlyph({ size = 22 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H9l-5 4z" />
  </svg>
}

/**
 * 홈·검색 결과가 함께 쓰는 사이트 헤더.
 *
 * <p>워드마크는 시안의 두 줄 스택이다. 윗줄은 CMS `siteName`을 그대로 쓰고 아랫줄만 화면 종류를
 * 밝히는 고정 라틴 표기다 — 사이트 이름은 CMS 관리자가 정한다는 계약을 깨지 않는다.
 *
 * <p>시안의 고정 메뉴 4종 대신 실제 CMS 메뉴 계약을 표시한다. 우측 상단 슬롯은 실제로 동작하는
 * CMS 관리자 링크를 유지한다.
 */
export function PortalHeader({ template, menus }: { template: SiteTemplate; menus: Menu[] }) {
  const roots = orderedMenus(menus, null)
  const [menusOpen, setMenusOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const searchButton = useRef<HTMLButtonElement>(null)
  const location = useLocation()
  const currentMenu = menus.find((menu) => portalUrl(menu.path) === location.pathname)
  const activeRoot = currentMenu?.parentId ?? currentMenu?.id

  return <header className="relative z-30 border-b border-line-soft bg-panel">
    <div className="border-b border-line-soft bg-page">
      <div className="mx-auto flex max-w-[75rem] items-center justify-between gap-4 px-7 py-2 text-[0.6875rem] text-muted max-[560px]:px-4">
        <span>{template.headerText}</span>
        <Link className="whitespace-nowrap font-bold text-body no-underline hover:text-ink" to="/admin">CMS 관리자</Link>
      </div>
    </div>
    <div onMouseLeave={() => setMenusOpen(false)} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setMenusOpen(false)
    }} onKeyDown={(event) => {
      if (event.key === 'Escape' && menusOpen) {
        event.preventDefault()
        setMenusOpen(false)
        menuButton.current?.focus()
      }
    }}>
    <div className="mx-auto flex min-h-[4.75rem] max-w-[75rem] items-center gap-3 px-7 max-[560px]:min-h-16 max-[560px]:px-4">
      <Link to="/" onClick={() => setMenusOpen(false)} className="mr-auto flex min-w-0 items-center gap-[0.625rem] text-ink no-underline">
        <BrandMark />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="break-words text-[1.375rem] font-black leading-tight tracking-[-.06em] max-[560px]:text-xl">{template.siteName}</span>
          <span className="text-[0.59375rem] font-extrabold tracking-[.22em]">TOURISM PORTAL</span>
        </span>
      </Link>
      <nav className="hidden min-w-0 flex-wrap items-stretch justify-end lg:flex" aria-label="주 메뉴" onMouseEnter={() => setMenusOpen(true)}>
        {roots.map((root) => <Link key={root.id} onFocus={() => setMenusOpen(true)} onClick={() => setMenusOpen(false)}
          className={`max-w-[10rem] truncate border-b-2 px-3 py-6 text-[0.8125rem] font-bold no-underline hover:border-primary hover:text-primary ${activeRoot === root.id ? 'border-primary text-primary' : 'border-transparent text-body'}`}
          to={menuDestination(root, menus)}>{root.name}</Link>)}
      </nav>
      <div className="flex shrink-0 items-center gap-1">
        <button ref={menuButton} type="button" aria-label={menusOpen ? '전체 메뉴 닫기' : '전체 메뉴 열기'} aria-expanded={menusOpen} aria-controls="portal-menu-panel"
          onClick={() => setMenusOpen((open) => !open)} className="grid h-11 w-11 place-items-center rounded-full text-body hover:bg-page hover:text-primary">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d={menusOpen ? 'M6 6l12 12M18 6 6 18' : 'M4 6h16M4 12h16M4 18h16'} /></svg>
        </button>
        <button ref={searchButton} type="button" aria-label="통합검색 열기" aria-haspopup="dialog" onClick={() => { setMenusOpen(false); setSearchOpen(true) }}
          className="grid h-11 w-11 place-items-center rounded-full bg-primary text-white hover:brightness-110"><SearchGlyph size={21} /></button>
      </div>
    </div>
    <nav className="flex gap-2 overflow-x-auto border-t border-line-soft px-4 py-3 lg:hidden" aria-label="모바일 주 메뉴">
      {roots.map((root) => <Link onClick={() => setMenusOpen(false)} className="shrink-0 rounded-full bg-page px-4 py-2 text-[0.6875rem] font-bold text-body no-underline" key={root.id} to={menuDestination(root, menus)}>{root.name}</Link>)}
    </nav>
    {menusOpen && <nav id="portal-menu-panel" aria-label="전체 사이트맵" className="absolute inset-x-0 top-full max-h-[65vh] overflow-y-auto border-y border-line bg-panel shadow-[0_18px_35px_rgba(22,34,47,.12)]">
      <div className="mx-auto grid max-w-[75rem] grid-cols-2 gap-x-6 gap-y-8 px-7 py-8 sm:grid-cols-3 lg:[grid-template-columns:repeat(auto-fit,minmax(8rem,1fr))] max-[560px]:px-4">
        {roots.map((root) => <div key={root.id}>
          <Link to={menuDestination(root, menus)} onClick={() => setMenusOpen(false)} className="mb-3 block break-words border-b border-line pb-3 text-sm font-extrabold text-ink no-underline hover:text-primary">{root.name}</Link>
          <ul className="m-0 list-none space-y-1 p-0">
            {orderedMenus(menus, root.id).map((child) => <li key={child.id}><Link to={portalUrl(child.path)} onClick={() => setMenusOpen(false)} aria-current={child.id === currentMenu?.id ? 'page' : undefined}
              className="block py-2 text-[0.8125rem] text-body no-underline hover:text-primary aria-[current=page]:font-bold aria-[current=page]:text-primary">{child.name}</Link></li>)}
          </ul>
        </div>)}
        {roots.length === 0 && <p className="m-0 text-sm text-muted">등록된 메뉴가 없습니다.</p>}
      </div>
    </nav>}
    </div>
    {searchOpen && <PortalSearchDialog onClose={() => setSearchOpen(false)} returnFocus={searchButton.current} />}
  </header>
}

function portalUrl(path: string) {
  return path.startsWith('/') ? path : `/${path}`
}

function searchUrl(category: string) {
  return category === 'all' ? '/search' : `/search?category=${category}`
}

type CurationCard = { name: string; cat: string; desc: string; img?: string }
type CurationSection = { id: string; title: string; total: number; cards: CurationCard[] }

/**
 * 코퍼스 500건을 탭 카테고리로 집계해 상위 3개(관광지 192·음식 95·숙박 72)를 섹션으로 삼는다.
 * 카드는 각 카테고리의 코퍼스 순서 앞 3건이다 — 고를 근거가 없어 임의 선별 대신 순서를 쓴다.
 *
 * <p>"이번 주 인기"(조회수 없음)나 "가을 축제"(계절 축 없음)처럼 근거를 못 대는 제목·부제는 쓰지
 * 않는다. 제목은 카테고리명, 부제는 집계한 건수뿐이다.
 */
// img는 코퍼스 fixture(tourism-sample-documents-500.json) metadata.firstimage의 TourAPI 원본 URL
// 그대로다 — 합성 주소가 아니므로 R26(합성 sourceUrl 금지)과 무관하다. 반도식당은 원천에 이미지가
// 없다(500건 중 95건이 그렇다). 지어내지 않고 플레이스홀더로 남긴다.
const HOME_SECTIONS: CurationSection[] = [
  { id: 'attraction', title: '관광지', total: 192, cards: [
    { name: '송파책박물관', cat: '문화관광 > 전시시설', desc: '전국 최초의 공립 책 박물관으로, 책을 주제로 한 전시·교육·연구를 한다.',
      img: 'https://tong.visitkorea.or.kr/cms/resource/16/3499716_image2_1.jpg' },
    { name: '세계조개박물관', cat: '문화관광 > 전시시설', desc: '신안군 자은도에 있으며 갯벌의 환경지표인 조개와 고동류를 전시한다.',
      img: 'https://tong.visitkorea.or.kr/cms/resource/40/3385440_image2_1.jpg' },
    { name: '세계물포럼기념센터', cat: '문화관광 > 전시시설', desc: '안동시 성곡동에 있는 2015 대구경북세계물포럼 기념 시설이다.',
      img: 'https://tong.visitkorea.or.kr/cms/resource/40/3587140_image2_1.jpg' },
  ] },
  { id: 'food', title: '음식', total: 95, cards: [
    { name: '반도식당', cat: '음식 > 한식', desc: '경주에서 오래된 갈비 맛집으로, 연탄불에 한우 생갈비를 구워 먹는 노포다.' },
    { name: '발산삼계탕', cat: '음식 > 한식', desc: '지하철 5호선 6번 출구 부근에 있고 상가 건물 앞에 자체 주차장이 있다.',
      img: 'http://tong.visitkorea.or.kr/cms/resource/63/2849263_image2_1.jpg' },
    { name: '바타타식탁', cat: '음식 > 한식', desc: '표선해수욕장 앞 해산물 요리 전문점으로 제주산 해산물 메뉴가 다양하다.',
      img: 'http://tong.visitkorea.or.kr/cms/resource/82/2876482_image2_1.JPG' },
  ] },
  { id: 'stay', title: '숙박', total: 72, cards: [
    { name: '도원', cat: '숙박 > 펜션/민박', desc: '객리단길에 위치한 한옥독채스테이로, 마당에서 실외 욕조를 쓸 수 있다.',
      img: 'http://tong.visitkorea.or.kr/cms/resource/22/2573622_image2_1.PNG' },
    { name: '더블힐링펜션', cat: '숙박 > 펜션/민박', desc: '모든 객실에 스파를 갖췄고 부안 고사포 해변이 한눈에 들어온다.',
      img: 'http://tong.visitkorea.or.kr/cms/resource/27/2568227_image2_1.jpg' },
    { name: '더존펜션', cat: '숙박 > 펜션/민박', desc: '월악산국립공원 내에 있고 청정 1급수 용하구곡을 앞에 두고 있다.',
      img: 'http://tong.visitkorea.or.kr/cms/resource/45/3547045_image2_1.jpg' },
  ] },
]

/**
 * 시안의 "지금 열리는 축제·행사" 스트립. 큐레이션 목록과 같은 고정 표본이다 — 코퍼스에 행사
 * 목록 API가 없다.
 *
 * <p>다만 뱃지는 고정하지 않는다. 시연 날짜가 바뀌면 "D-23"이 곧 거짓이 되므로 기간에서
 * 계산한다(`festivalBadge`). 날짜는 코퍼스 문서의 `event_start_date`·`event_end_date` 값이다.
 */
// img는 큐레이션 카드와 같은 원천(fixture metadata.firstimage) 값이다.
const FESTIVALS = [
  { name: '2026 화성행궁 야간개장', start: '2026-05-01', end: '2026-11-01', place: '수원' , img: 'https://tong.visitkorea.or.kr/cms/resource/63/4081263_image2_1.jpg' },
  { name: '진주남강유등축제', start: '2026-10-03', end: '2026-10-18', place: '진주' , img: 'https://tong.visitkorea.or.kr/cms/resource/57/4082657_image2_1.png' },
  { name: '광주 추억의 충장축제', start: '2026-10-07', end: '2026-10-11', place: '광주' , img: 'https://tong.visitkorea.or.kr/cms/resource/71/3584471_image2_1.jpg' },
  { name: '임실N치즈축제', start: '2026-10-08', end: '2026-10-11', place: '임실' , img: 'https://tong.visitkorea.or.kr/cms/resource/54/3377054_image2_1.png' },
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

/** 메인과 헤더 모달이 동일한 검색 URL·카테고리 계약을 사용한다. */
function PortalSearchForm({ onComplete, initialQuery = '', initialCategory = 'all' }: {
  onComplete?: () => void; initialQuery?: string; initialCategory?: string
}) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState(initialQuery)
  const [tab, setTab] = useState(PORTAL_TABS.some((item) => item.id === initialCategory) ? initialCategory : 'all')

  function submit(event: FormEvent) {
    event.preventDefault()
    const params = new URLSearchParams()
    const query = draft.trim()
    if (query) params.set('q', query)
    if (tab !== 'all') params.set('category', tab)
    const qs = params.toString()
    onComplete?.()
    navigate(qs ? `/search?${qs}` : '/search')
  }

  return <>
    <div role="tablist" aria-label="여행 검색 카테고리" className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
      {PORTAL_TABS.map((item, index) => <button key={item.id} type="button" role="tab" aria-selected={item.id === tab}
        tabIndex={item.id === tab ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={(event) => {
          const last = PORTAL_TABS.length - 1
          const next = event.key === 'ArrowRight' ? (index + 1) % PORTAL_TABS.length
            : event.key === 'ArrowLeft' ? (index + last) % PORTAL_TABS.length
              : event.key === 'Home' ? 0 : event.key === 'End' ? last : null
          if (next === null) return
          event.preventDefault()
          setTab(PORTAL_TABS[next].id)
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
        }} className={`rounded-full border px-[1.0625rem] py-2 text-[0.8125rem] font-bold ${item.id === tab ? 'border-white bg-white text-ink' : 'border-white/20 bg-white/10 text-white/90'}`}>{item.label}</button>)}
    </div>
    <form onSubmit={submit} className="mt-[1.625rem] flex h-14 items-center gap-3 rounded-full bg-panel py-0 pl-[1.375rem] pr-2 text-ink shadow-[0_2px_14px_rgba(22,34,47,0.14)]">
      <SearchGlyph />
      <input value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="여행지 검색" placeholder={TAB_PLACEHOLDERS[tab] ?? TAB_PLACEHOLDERS.all} className="min-w-0 flex-1 border-0 bg-transparent text-[0.9375rem] text-ink outline-0" />
      <button type="submit" className="h-11 flex-none rounded-full bg-primary px-7 text-sm font-bold text-white max-[560px]:px-5">검색</button>
    </form>
    <p className="m-0 mt-[0.875rem] text-xs text-white/65">수집된 관광 문서에서 근거를 찾아 답합니다 · 근거가 없으면 답하지 않습니다</p>
  </>
}

function PortalSearchDialog({ onClose, returnFocus }: { onClose: () => void; returnFocus: HTMLButtonElement | null }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    element.querySelector('input')?.focus()
    return () => { element.close(); returnFocus?.focus() }
  }, [returnFocus])

  return <dialog ref={dialog} aria-label="통합검색" onCancel={(event) => { event.preventDefault(); onClose() }}
    onKeyDown={(event) => {
      if (event.key !== 'Tab') return
      const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"]), input:not([disabled])')
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[min(52rem,calc(100%_-_2rem))] max-w-none overflow-auto rounded-3xl border-0 bg-[#17313a] p-0 text-white shadow-2xl backdrop:bg-[#10202c]/65">
    <div className="px-6 pb-9 pt-6 sm:px-10 sm:pb-12">
      <div className="flex items-center justify-between gap-4">
        <p className="m-0 text-xs font-extrabold tracking-[.14em] text-white/65">TRAVEL SEARCH</p>
        <button type="button" aria-label="통합검색 닫기" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border border-white/20 text-white hover:bg-white/10">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <h2 className="mb-2 mt-6 text-balance break-keep text-center text-[clamp(1.5rem,4vw,2rem)] font-extrabold tracking-[-.04em]">어떤 여행을 떠나고 싶으세요?</h2>
      <p className="m-0 text-balance break-keep text-center text-sm text-white/70">여행지부터 맛집, 숙소까지 한곳에서 찾아보세요.</p>
      <PortalSearchForm onComplete={onClose} initialQuery={location.pathname === '/search' ? params.get('q') ?? '' : ''} initialCategory={location.pathname === '/search' ? params.get('category') ?? 'all' : 'all'} />
    </div>
  </dialog>
}

/** 섹션 머리 — 근거를 댈 수 있는 부제는 집계 건수뿐이라 그것만 남긴다. */
function SectionHead({ title, eyebrow, moreCategory }: { title: string; eyebrow: string; moreCategory?: string }) {
  return <div className="flex items-end justify-between gap-5">
    <div>
      <p className="m-0 mb-2 text-xs font-bold text-muted">{eyebrow}</p>
      <h2 className="m-0 text-[clamp(1.5rem,3vw,2rem)] font-extrabold tracking-[-.04em] text-ink">{title}</h2>
    </div>
    {moreCategory && <Link className="whitespace-nowrap text-[0.8125rem] font-bold text-body no-underline hover:text-ink" to={searchUrl(moreCategory)}>전체 보기 →</Link>}
  </div>
}

export function PortalHome({ template, menus = [], notices = [] }: { template: SiteTemplate; menus?: Menu[]; notices?: Post[] }) {
  const [page, setPage] = useState(1)

  const [hero, ...rest] = HOME_SECTIONS
  const quickLinks = orderedMenus(menus, null).slice(0, 4)
  const notice = notices[0]

  return <main>
    {/* 시안의 풀블리드 히어로. CMS 히어로 계약(사진·제목·부제·버튼)을 위에 두고, 통합 검색을
        같은 사진 위에 이어 붙여 첫 화면에서 바로 검색이 시작되게 한다. */}
    <div className="relative overflow-hidden bg-primary text-white">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${template.heroImageUrl})` }} aria-hidden="true" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(16,28,42,.58)_0%,rgba(16,28,42,.48)_45%,rgba(16,28,42,.78)_100%)]" aria-hidden="true" />
      <div className="relative mx-auto max-w-[75rem] px-7 pb-16 pt-14 text-center max-[560px]:px-4 max-[560px]:pt-10">
        <PortalHero template={template} />

        <div className="mx-auto mt-9 max-w-[45rem] border-t border-white/15 pt-9">
          <h2 className="m-0 text-[1.375rem] font-extrabold tracking-[-.04em] text-white">어디로 떠나볼까요?</h2>

          <PortalSearchForm />
        </div>
      </div>
    </div>

    <section className="border-b border-line-soft bg-page">
      <div className="mx-auto max-w-[75rem] px-7 pb-[3.75rem] pt-14 max-[560px]:px-4">
        <SectionHead title="지금 열리는 축제·행사" eyebrow={`${todayLabel()} 기준 · 진행·예정 19건`} moreCategory="event" />
        <div className="mt-6 grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(13.125rem,1fr))]">
          {FESTIVALS.map((festival) => <article key={festival.name}>
            <div className="relative overflow-hidden rounded-xl border border-line-soft">
              <CardPhoto name={festival.name} img={festival.img} className="aspect-[3/4]" />
              <span className="pointer-events-none absolute left-[0.625rem] top-[0.625rem] rounded-md bg-white/95 px-[0.5625rem] py-1 text-[0.6875rem] font-extrabold text-ink">{festivalBadge(festival.start, festival.end)}</span>
              <PhotoTag />
            </div>
            <strong className="mt-3 block text-sm font-bold text-ink">{festival.name}</strong>
            <span className="mt-1 block text-xs text-muted">{dayRange(festival.start, festival.end)} · {festival.place}</span>
          </article>)}
        </div>
      </div>
    </section>

    <div className="mx-auto max-w-[75rem] px-7 max-[560px]:px-4">
      <section className="pt-16 max-[560px]:pt-12">
        {/* 검색·챗봇은 배선됐지만 이 큐레이션 목록은 여전히 고정이다 — 만들 API가 없다.
            시안에는 이 고지가 없지만, 실재하는 이름을 고정 표시하는 화면이라 구별 단서를 남긴다. */}
        <SampleNotice label="샘플 데이터 · 추천 목록은 고정입니다" className="mb-8">
          아래 카드는 코퍼스에 실재하는 문서를 카테고리별로 고정 표시한 것입니다. 조회수·계절 같은 큐레이션 축이 없어 집계 상위 카테고리와 코퍼스 순서로만 골랐습니다.
        </SampleNotice>
        <SectionHead title={hero.title} eyebrow={`코퍼스 ${hero.total}곳 · TourAPI 실사진 표시 예정`} moreCategory={hero.id} />

        {/* 1페이지만 실재 문서다. 2페이지 이후는 만들 API가 없어 빈 자리로 두고 그렇게 밝힌다. */}
        <div className="mt-[1.375rem] grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(16.25rem,1fr))]">
          {page === 1
            ? hero.cards.map((card) => <article key={card.name} className="relative overflow-hidden rounded-xl border border-line-soft">
              <CardPhoto name={card.name} img={card.img} className="aspect-[1/1.05]">
                <span className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.72),rgba(0,0,0,0.08)_55%,transparent)]" aria-hidden="true" />
                <strong className="absolute inset-x-[1.375rem] bottom-[1.375rem] text-[1.3125rem] font-extrabold tracking-[-.03em] text-white">{card.name}</strong>
              </CardPhoto>
              <PhotoTag />
            </article>)
            : [0, 1, 2].map((slot) => <div key={slot} className="grid aspect-[1/1.05] place-items-center rounded-xl border border-line-soft bg-[repeating-linear-gradient(45deg,var(--site-ph)_0_12px,var(--site-ph-line)_12px_24px)] px-4 text-center text-[0.6875rem] text-site-ph-ink">
              코퍼스 {hero.total}곳 · {page}페이지 문서는 배선 후 채워집니다
            </div>)}
        </div>

        <div className="mt-[1.375rem] flex items-center justify-center gap-2">
          {[1, 2, 3, 4].map((number) => <button
            key={number}
            type="button"
            aria-label={`${number}페이지`}
            aria-current={number === page ? 'true' : undefined}
            onClick={() => setPage(number)}
            className={`h-1.5 rounded-full ${number === page ? 'w-[1.125rem] bg-ink' : 'w-1.5 bg-[#c9d2dc]'}`}
          />)}
        </div>
      </section>

      {rest.map((section) => <section key={section.title} className="pt-[4.5rem] max-[560px]:pt-14 last:pb-[5.5rem]">
        <SectionHead title={section.title} eyebrow={`코퍼스 ${section.total}곳`} moreCategory={section.id} />
        <div className="mt-[1.375rem] grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(16.25rem,1fr))]">
          {section.cards.map((card) => <article key={card.name}>
            <div className="relative overflow-hidden rounded-xl border border-line-soft">
              <CardPhoto name={card.name} img={card.img} className="aspect-[4/3]" />
              <PhotoTag />
            </div>
            <strong className="mt-[0.875rem] block text-base font-bold tracking-[-.02em] text-ink">{card.name}</strong>
            <span className="mt-1 block text-[0.6875rem] font-semibold text-muted-2">{card.cat}</span>
            <span className="mt-1.5 block text-[0.8125rem] leading-[1.6] text-muted">{card.desc}</span>
          </article>)}
        </div>
      </section>)}
    </div>

    {quickLinks.length > 0 && <section className="border-t border-line-soft bg-page">
      <div className="mx-auto max-w-[75rem] px-7 pb-[4.5rem] pt-16 text-center max-[560px]:px-4">
        <p className="m-0 mb-2 text-xs font-bold text-muted">CMS 메뉴 관리와 실시간 동기화</p>
        <h2 className="m-0 mb-7 text-[clamp(1.5rem,3vw,2rem)] font-extrabold tracking-[-.04em] text-ink">여행 정보</h2>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(12.5rem,1fr))]">
          {quickLinks.map((menu) => <Link key={menu.id} to={menuDestination(menu, menus)} className="block rounded-xl border border-line bg-panel px-[1.125rem] py-[1.625rem] text-inherit no-underline hover:border-primary">
            <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-page">
              <MenuGlyph target={menu.targetType} />
            </span>
            <strong className="mt-[0.875rem] block text-sm font-bold text-ink">{menu.name}</strong>
            <span className="mt-1 block text-xs text-muted">{MENU_KIND[menu.targetType]}</span>
          </Link>)}
        </div>
      </div>
    </section>}

    {/* 시안의 공지 배너 자리. 문구를 지어내지 않고 CMS 게시판의 최신 글 1건을 그대로 건다. */}
    {notice && <div className="mx-auto max-w-[75rem] px-7 pb-11 pt-9 max-[560px]:px-4">
      <Link to={`/posts/${notice.id}`} className="flex items-center gap-[0.875rem] rounded-[0.625rem] border border-[#efd8aa] bg-wait-bg px-[1.125rem] py-[0.875rem] no-underline">
        <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-[rgba(150,101,42,.12)]" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-wait-fg"><path d="M4 10v4h3l5 4V6L7 10z" /><path d="M16.5 9.5a4 4 0 0 1 0 5" /></svg>
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block text-[0.8125rem] font-bold text-wait-fg">공지 · {notice.title}</strong>
          <span className="mt-0.5 block text-xs text-[#a9793c]">CMS 게시판의 최신 공지 1건이 이 자리에 자동 노출됩니다</span>
        </span>
        <span className="flex-none text-xs font-bold text-wait-fg">자세히 →</span>
      </Link>
    </div>}
  </main>
}

const MENU_KIND: Record<string, string> = { BOARD: '게시판', CONTENT: '콘텐츠 페이지', NONE: '메뉴' }

function MenuGlyph({ target }: { target: string }) {
  const path = target === 'BOARD'
    ? 'M4 5h16v11H8l-4 3z M8 9h8M8 12h5'
    : target === 'CONTENT'
      ? 'M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z'
      : 'M18 4a2 2 0 1 1 0 4H9a3 3 0 0 0 0 6h9a2 2 0 1 1 0 4H6'
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary" aria-hidden="true"><path d={path} /></svg>
}

/** `2026-10-03` → `10.03`. 연도는 같은 해 행사만 묶여 있어 화면에서 뺀다. */
function dayRange(start: string, end: string) {
  const short = (value: string) => value.slice(5).replace('-', '.')
  return `${short(start)} – ${short(end)}`
}

function todayLabel(today = new Date()) {
  return `${today.getMonth() + 1}월 ${today.getDate()}일`
}

/**
 * CMS의 단일 Hero 계약을 시안의 풀블리드 히어로 문안으로 표현한다.
 *
 * <p>배경 사진·사이트명·제목·부제·버튼은 전부 CMS 값이다. 레이아웃 이름은 사용자 문구로
 * 노출하지 않고 제목 스타일에만 반영한다.
 */
export function PortalHero({ template }: { template: SiteTemplate }) {
  const bold = template.layout === 'BOLD'
  const minimal = template.layout === 'MINIMAL'
  return <section aria-label={`${template.layout} 템플릿 메인`}>
    <p className="m-0 mb-[0.875rem] text-xs font-extrabold tracking-[.2em] text-white/80">{template.siteName}</p>
    <h1 className={`m-0 text-balance break-keep text-[clamp(2rem,5vw,3.25rem)] leading-[1.14] tracking-[-.045em] ${bold ? 'font-black uppercase' : minimal ? 'font-semibold' : 'font-extrabold'}`}>{template.heroTitle}</h1>
    <p className="mx-auto mt-4 max-w-2xl text-balance break-keep text-sm leading-[1.7] text-white/80">{template.heroSubtitle}</p>
    <Link className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/40 px-5 py-2 text-[0.8125rem] font-bold text-white no-underline hover:bg-white/10" to={portalUrl(template.heroButtonUrl)}>{template.heroButtonLabel}<span aria-hidden="true">→</span></Link>
  </section>
}

export function PortalFooter({ template, menus = [] }: { template: SiteTemplate; menus?: Menu[] }) {
  const roots = orderedMenus(menus, null)
  return <footer className="mt-auto border-t border-line-soft bg-[#132e35] text-white">
    <div className="mx-auto max-w-[75rem] px-7 pb-8 pt-12 text-xs leading-[1.8] max-[560px]:px-4">
      <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <Link to="/" className="inline-flex items-center gap-3 text-white no-underline"><BrandMark size="2.5rem" /><strong className="text-2xl font-black tracking-[-.04em]">{template.siteName}</strong></Link>
          <p className="mb-0 mt-5 max-w-sm whitespace-pre-line break-keep text-sm text-white/70">{template.footerText}</p>
          <Link to="/search" className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/30 px-5 py-2 text-xs font-bold text-white no-underline hover:bg-white/10">나의 다음 여행 찾기 <span aria-hidden="true">↗</span></Link>
        </div>
        <nav aria-label="여행 둘러보기">
          <h2 className="mb-4 mt-0 text-sm font-extrabold">여행 둘러보기</h2>
          <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-2 p-0">
            {PORTAL_TABS.filter((tab) => tab.id !== 'all').map((tab) => <li key={tab.id}><Link className="inline-block py-1 text-white/70 no-underline hover:text-white" to={searchUrl(tab.id)}>{tab.label}</Link></li>)}
          </ul>
        </nav>
        {roots.length > 0 && <nav aria-label="사이트 안내">
          <h2 className="mb-4 mt-0 text-sm font-extrabold">사이트 안내</h2>
          <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-2 p-0">
            {roots.map((root) => <li key={root.id}><Link className="inline-block break-words py-1 text-white/70 no-underline hover:text-white" to={menuDestination(root, menus)}>{root.name}</Link></li>)}
          </ul>
        </nav>}
      </div>
      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-6 text-[0.6875rem] text-white/50">
        <span>© {new Date().getFullYear()} {template.siteName}. All rights reserved.</span>
        <span>TOURISM &amp; TRAVEL INFORMATION</span>
      </div>
    </div>
  </footer>
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
        <form onSubmit={submit} className="flex h-[3.25rem] max-w-[45rem] items-center gap-3 rounded-full border border-field-line bg-panel py-0 pl-5 pr-2 text-ink shadow-[0_2px_14px_rgba(22,34,47,0.07)]">
          <SearchGlyph size={17} />
          <input value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="여행지 검색" placeholder="어디로 떠나볼까요?" className="min-w-0 flex-1 border-0 bg-transparent text-[0.9375rem] text-ink outline-0" />
          <button type="submit" className="h-10 flex-none rounded-full bg-primary px-[1.625rem] text-sm font-bold text-white">검색</button>
        </form>
      </div>
    </div>

    <div className="min-h-[70vh] flex-1 bg-page">
      <div className="mx-auto grid max-w-[75rem] grid-cols-[15.5rem_minmax(0,1fr)] items-start gap-9 px-7 pb-24 pt-10 max-[900px]:grid-cols-1 max-[900px]:gap-6 max-[560px]:px-4">
        <aside aria-label="검색 필터" className="rounded-xl border border-line-soft bg-panel p-[1.375rem]">
          <p className="m-0 mb-4 text-base font-extrabold tracking-[-.03em] text-ink">필터링 결과</p>
          <div className="flex flex-col items-start gap-[2px] max-[900px]:flex-row max-[900px]:flex-wrap max-[900px]:gap-x-4">
            {PORTAL_TABS.map((tab) => {
              const on = tab.id === active
              return <button
                key={tab.id}
                type="button"
                aria-current={on ? 'true' : undefined}
                onClick={() => search(query, tab.id)}
                className={`whitespace-nowrap bg-transparent px-[2px] py-[0.5625rem] text-left text-sm ${on ? 'font-extrabold text-ink underline underline-offset-4' : 'font-semibold text-body'}`}
              >{tab.label}</button>
            })}
          </div>
        </aside>

        <div>
          {/* 시안의 "OO 근처의 검색결과 표시"는 위치 기능이 없어 옮기지 않았다.
              건수는 서버가 고정한 citations 길이(CITATION_LIMIT=3 이하)이며, 코퍼스 전체에서
              몇 건이 일치했는지가 아니다 — 그 값은 공개 응답에 없다. */}
          <h1 className="m-0 mb-3 text-[clamp(1.3125rem,2.6vw,1.875rem)] font-extrabold tracking-[-.04em] text-ink">
            {query ? `“${query}”${withParticle(query, '과', '와')} 일치하는 검색 결과` : '검색 결과'}
            {state.phase === 'ready' && <span className="ml-2 text-[0.9375rem] font-bold text-muted">{state.data?.citations.length ?? 0}건</span>}
          </h1>
          <SampleNotice label="샘플 응답 · 관광 코퍼스 500건 · 근거 문서 기준 검색" className="mb-[1.625rem]" />

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
      {[0, 1, 2].map((row) => <Placeholder key={row} label="" className="h-[12.25rem] rounded-xl" />)}
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

  return <>
    <AnswerCard answer={state.data?.answer ?? ''} titles={citations.map((citation) => citation.title)} />
    <div className="flex flex-col gap-[0.875rem]">
      {citations.map((citation, index) => <PortalResultCard
        key={`${citation.title}-${index}`}
        title={citation.title}
        excerpt={citation.excerpt}
        categoryLabel={citation.categoryLabel}
        eventStatus={citation.eventStatus}
        imageUrl={citation.imageUrl}
        address={addressLine(citation.excerpt) ?? undefined}
      />)}
    </div>
  </>
}

/**
 * 시안의 AI 요약 박스. 새 호출이 아니라 **이미 받은 응답의 `answer`** 를 그대로 그린다 —
 * 검색과 챗봇이 같은 엔드포인트를 쓰므로 검색 응답에도 답변 문장이 실려 있다.
 *
 * <p>근거 문서 제목만 굵게 처리한다. 세그먼트는 한 줄에 이어 붙여야 한다 — 사이에 줄바꿈이나
 * 공백 텍스트 노드가 들어가면 "도원 이", "고택 ," 처럼 조사 앞에 공백이 생긴다.
 */
function AnswerCard({ answer, titles }: { answer: string; titles: string[] }) {
  if (!answer.trim()) return null
  return <div className="mb-[1.125rem] rounded-xl border border-line-soft bg-panel px-[1.625rem] py-[1.375rem]">
    <div className="flex items-center gap-[0.5625rem]">
      <span className="grid h-[1.625rem] w-[1.625rem] flex-none place-items-center rounded-lg bg-primary text-white" aria-hidden="true"><ChatGlyph size={15} /></span>
      <strong className="text-sm font-extrabold text-ink">AI 요약</strong>
      <span className="text-xs text-muted-2">아래 근거 문서에서 찾은 내용만 답합니다</span>
    </div>
    <p className="m-0 mt-[0.875rem] whitespace-pre-line text-sm leading-[1.8] text-body">
      {highlightTitles(answer, titles).map((segment, index) => segment.bold
        ? <b className="font-bold text-ink" key={index}>{segment.text}</b>
        : <Fragment key={index}>{segment.text}</Fragment>)}
    </p>
  </div>
}

/** 결과 영역의 빈 상태 한 장. 제목 + 부연 + (있으면) 재시도·추적자. */
function PortalNotice({ title, children, trace, onRetry }: {
  title: string
  children?: ReactNode
  trace?: string
  onRetry?: () => void
}) {
  return <div className="flex flex-col items-start gap-2 rounded-xl border border-line-soft bg-panel px-7 py-10">
    <strong className="text-[1.0625rem] font-extrabold tracking-[-.03em] text-ink">{title}</strong>
    {children != null && <span className="text-sm leading-[1.7] text-body">{children}</span>}
    {onRetry && <button type="button" onClick={onRetry} className="mt-2 rounded-full bg-primary px-5 py-2 text-[0.8125rem] font-bold text-white">다시 시도</button>}
    {trace && <span className="mt-1 text-xs text-muted-3">{trace}</span>}
  </div>
}

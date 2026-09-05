import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { withParticle } from './particle'
import { PORTAL_TABS } from './portal-meta'
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
        <SampleNotice className="mb-8">
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

type MockResult = { name: string; categoryId: string; cat: string; addr: string; desc: string }

/**
 * 코퍼스(`tourism-sample-documents-500.json`)에 실재하는 문서만 담는다. 이름·분류·주소·개요는
 * 원문에서 가져왔고, 없는 값은 비운다(대동고택은 `[개요]` 줄이 없어 desc가 빈 문자열).
 *
 * <p>여기 담긴 8건은 "주소에 전주가 들어가는 문서 전부"라는 사실의 결과일 뿐 노출 건수 결정이 아니다.
 * 배선 뒤에는 `CITATION_LIMIT = 3`처럼 더 적을 수 있으므로 카드 수에 기대는 레이아웃을 두지 않는다.
 *
 * <p>`categoryId`는 탭 접두 매핑(portal-meta)과 맞춰 뒀다. I7이 이 배열을 공개 검색 API 응답으로
 * 바꿀 때 필터 축이 이미 붙어 있게 하려는 것이고, 지금 화면 표시에는 쓰지 않는다.
 */
const MOCK_RESULTS: MockResult[] = [
  { name: '도원', categoryId: 'AC03', cat: '숙박 > 펜션/민박', addr: '전북특별자치도 전주시 완산구 팔달로 58-3 (서서학동)', desc: '다가도원은 객리단길에 위치한 한옥독채스테이다. 마당에서 실외 욕조를 사용 할 수 있다. 오직 한 팀만을 위한 독채 숙소로 운영 중이다.' },
  { name: '대동고택', categoryId: 'AC03', cat: '숙박 > 펜션/민박', addr: '전북특별자치도 전주시 완산구 대동로 7-13 (태평동)', desc: '' },
  { name: '더 한옥', categoryId: 'AC03', cat: '숙박 > 펜션/민박', addr: '전북특별자치도 전주시 완산구 은행로 68-15 (교동)', desc: '더한옥은 한옥마을 최중심지에 위치하여, 40년 동안 3명의 박사를 배출한 정남향의 명당터로서 현재 3대째 살고 있으며, 한옥마을 볼거리인 전동성당, 풍남문, 오목대, 향교, 전주천 및 공용주차장을 걸어서 5분 거리에 갈수 있는 최적의 위치에 자리 잡고 있다.' },
  { name: '베니키아 전주한성 호텔', categoryId: 'AC_ETC', cat: '숙박 > 호텔·콘도·모텔·호스텔', addr: '전북특별자치도 전주시 완산구 전주객사5길 43-3 (고사동)', desc: '전주 한성 관광호텔은 1949년 전라북도 최초로 창립된 전통 여관에서 시작된 호텔이다. 현재는 3대째 가업을 이어오며 관광호텔로 발전하였고, 세계에서 하나뿐인 스테인리스 전통욕조를 체험할 수 있다.' },
  { name: '블루원호텔', categoryId: 'AC_ETC', cat: '숙박 > 호텔·콘도·모텔·호스텔', addr: '전북특별자치도 전주시 덕진구 용산2길 18', desc: '전주시에 위치한 블루원호텔은 모던한 인테리어 꾸며진 객실에는 인터넷이 설치되어 있고, 에어컨, 냉장고 등이 구비되어 있는 숙소이다.' },
  { name: '밥상위의한우', categoryId: 'FD01', cat: '음식 > 한식', addr: '전북특별자치도 전주시 완산구 천잠로 341', desc: "전주대학교 입구에 있는 '밥상위의한우'는 드라이에이징 기법으로 한우를 숙성시켜서 판매하고 있는 전문점이다. 넓은 좌석을 보유하고 있어 각종 모임에 적합하다." },
  { name: '삼천빌리지 카페', categoryId: 'FD05', cat: '음식 > 카페/찻집', addr: '전북특별자치도 전주시 완산구 용와길 4-27 (평화동3가)', desc: '삼천빌리지카페는 바쁜 일상 속에서 잠시 쉬어갈 수 있는 여유로운 공간이다. 자연스러운 감성과 세련된 인테리어가 조화를 이루어 편안하면서도 감각적인 분위기를 자아낸다.' },
  { name: '호남제일문', categoryId: 'HS01', cat: '역사관광 > 역사유적지', addr: '전북특별자치도 전주시 덕진구 여의동 1217-9', desc: '전주 IC 인근에 있는 호남제일문은 길이 43m, 폭 3.5m, 높이 12.4m의 규모를 자랑하는 국내에서 가장 큰 일주문이다. 전주의 지역 특색과도 잘 어울리는 한옥으로 지어졌다.' },
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
          {/* 시안의 "OO 근처의 검색결과 표시"는 위치 기능이 없어 옮기지 않았다. 건수도 적지 않는다 —
              지금 값은 고정 배열 길이일 뿐이고 배선 뒤 건수를 여기서 약속할 근거가 없다. */}
          <h1 className="m-0 mb-3 text-[clamp(1.5rem,2.6vw,2rem)] font-extrabold tracking-[-.04em] text-ink">
            {query ? `“${query}”${withParticle(query, '과', '와')} 일치하는 검색 결과` : '검색 결과'}
          </h1>
          <SampleNotice className="mb-7">
            아래 목록은 코퍼스에 실재하는 문서를 고정해 둔 것입니다. <b className="font-semibold">검색어와 카테고리 탭은 아직 결과에 반영되지 않습니다</b> — 검색 API 배선(I7) 전이라 무엇을 입력하거나 선택해도 같은 목록이 나옵니다.
          </SampleNotice>

          <div className="flex flex-col gap-[0.875rem]">
            {MOCK_RESULTS.map((result) => <PortalResultCard
              key={result.name}
              title={result.name}
              excerpt={result.desc}
              categoryLabel={result.cat}
              address={result.addr}
            />)}
          </div>
        </div>
      </div>
    </div>
  </main>
}

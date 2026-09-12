import { PORTAL_TABS, type PortalTab } from './portal-meta'

/**
 * 포털 도메인(고객사 업종) 상수. 02 문서 "도메인 전환 구조" — 도메인 정체성(스킨·탭·
 * 프롬프트·문구)은 프로젝트 속성이고, 도메인 2개가 확정 범위라 Frontend 상수로 처리한다.
 *
 * <p>브랜드명·색은 여기 없다 — 그건 CMS 템플릿 데이터다(관광) 또는 도메인 상수의 최소
 * 항목(중기부)이다. 여기에는 화면 구조가 참조하는 도메인 고정값만 둔다: 검색 탭, 검색
 * 문구, 챗봇 추천 질문.
 */
export type PortalDomain = {
  /** 경로 첫 세그먼트. null이면 루트(관광) 포털이다. */
  slug: string | null
  /** 검색 페이지 경로 — 내부 이동이 도메인 접두를 잃지 않게 한 곳에서 만든다. */
  searchPath: string
  tabs: PortalTab[]
  searchAria: string
  searchPlaceholder: string
  chatSuggestions: string[]
  /** 챗봇 버블의 호버 문구·창 제목·부제·인사말. 위젯이 도메인과 무관하게 재사용되므로
   *  "관광"을 하드코딩하면 /sme에서도 관광 챗봇처럼 보인다 — 9/12 로컬 화면 확인으로 발견. */
  chatTagline: string
  chatTitle: string
  chatEyebrow: string
  chatGreeting: string
}

export const TOUR_DOMAIN: PortalDomain = {
  slug: null,
  searchPath: '/search',
  tabs: PORTAL_TABS,
  searchAria: '여행지 검색',
  searchPlaceholder: '어디로 떠나볼까요?',
  chatSuggestions: ['지금 하는 축제 알려줘', '전주 한옥스테이 추천'],
  chatTagline: '관광에 대한 모든 것! 무엇이든 물어보세요',
  chatTitle: '관광 도우미',
  chatEyebrow: 'AI 여행 안내',
  chatGreeting: '전주 한옥스테이, 축제 일정처럼 여행지에 대해 물어보세요. 수집된 관광 문서에서 근거를 찾아 답해 드립니다.',
}

/**
 * 중기부 지원사업 탭 8종(전체 + 7분야). 분야 값은 원천의
 * {@code pldirSportRealmLclasCodeNm}이 그대로 {@code source_document.category}에 들어간
 * 한글 라벨이라, 접두 배열도 라벨 자신이다(라벨 == 자기 접두).
 */
export const SME_DOMAIN: PortalDomain = {
  slug: 'sme',
  searchPath: '/sme/search',
  tabs: [
    { id: 'all', label: '전체', prefixes: null, tone: 'idle', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
    { id: 'management', label: '경영', prefixes: ['경영'], tone: 'ok', icon: 'M4 8h16v11H4zM9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2' },
    { id: 'technology', label: '기술', prefixes: ['기술'], tone: 'run', icon: 'M13 2 4 14h6l-1 8 9-12h-6l1-8z' },
    { id: 'export', label: '수출', prefixes: ['수출'], tone: 'teal', icon: 'M3 12h14M13 6l6 6-6 6' },
    { id: 'domestic', label: '내수', prefixes: ['내수'], tone: 'idle', icon: 'm4 11 8-7 8 7M6 10v9h12v-9' },
    { id: 'people', label: '인력', prefixes: ['인력'], tone: 'wait', icon: 'M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM5 21a7 7 0 0 1 14 0' },
    { id: 'finance', label: '금융', prefixes: ['금융'], tone: 'ok', icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v10M9 10.5h6M9 13.5h6' },
    { id: 'startup', label: '창업', prefixes: ['창업'], tone: 'fail', icon: 'm5 19 4-4M12 3c4 1 6 5 5 9l-4 4-6-6 5-7z' },
  ],
  searchAria: '지원사업 검색',
  searchPlaceholder: '예: 청년 창업, 수출 바우처, 기술개발',
  chatSuggestions: ['청년 창업 지원 사업 알려줘', '수출 바우처 신청 방법이 궁금해'],
  chatTagline: '지원사업에 대한 모든 것! 무엇이든 물어보세요',
  chatTitle: '지원사업 도우미',
  chatEyebrow: 'AI 사업 안내',
  chatGreeting: '청년 창업, 수출 바우처처럼 지원사업에 대해 물어보세요. 수집된 공고 문서에서 근거를 찾아 답해 드립니다.',
}

/** 경로 첫 세그먼트로 도메인을 고른다. 모르는 경로는 루트(관광)다. */
export function portalDomainOf(pathname: string): PortalDomain {
  const slug = pathname.split('/').find(Boolean) ?? ''
  return slug === 'sme' ? SME_DOMAIN : TOUR_DOMAIN
}

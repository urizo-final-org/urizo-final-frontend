/**
 * 관광 포털 카테고리 탭(I8 확정: 전체 + 7종).
 *
 * <p>매핑은 반드시 코퍼스 `category_id` 접두 기준이다 — `contenttypeid`를 쓰면 AC05 캠핑 24건이
 * contenttypeid 28(레포츠)로 잡혀 숙박 탭에서 전량 누락된다. `체험·레저`가 LS와 EX를 함께 덮고
 * `쇼핑`(SH)을 별도 탭으로 두어, 500건 코퍼스의 모든 접두가 정확히 한 탭에 속한다.
 *
 * <p>`prefixes`는 I7에서 공개 검색 API의 category 파라미터로 그대로 전달한다(탭 전환 = 재검색).
 * `icon`은 24x24 Lucide 계열 외곽선 path, `tone`은 tokens.css 상태 토큰 이름이다.
 */
export type PortalTab = {
  id: string
  label: string
  /** category_id 접두 목록. null은 전체(필터 없음). */
  prefixes: string[] | null
  tone: 'ok' | 'teal' | 'wait' | 'run' | 'idle' | 'fail'
  icon: string
}

export const PORTAL_TABS: PortalTab[] = [
  { id: 'all', label: '전체', prefixes: null, tone: 'idle', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
  { id: 'attraction', label: '관광지', prefixes: ['NA', 'HS', 'VE'], tone: 'ok', icon: 'm3 20 6-12 4 7 2.5-3.5L21 20H3z' },
  { id: 'stay', label: '숙박', prefixes: ['AC'], tone: 'teal', icon: 'M3 5v14M3 15h18v4M3 11h9V8H6a3 3 0 0 0-3 3M12 8h6a3 3 0 0 1 3 3v4' },
  { id: 'food', label: '음식', prefixes: ['FD'], tone: 'wait', icon: 'M6 3v6a2 2 0 0 0 4 0V3M8 11v10M17 3c-1.7 0-3 2-3 4.5S15.3 12 17 12s3-2 3-4.5S18.7 3 17 3zM17 12v9' },
  { id: 'leisure', label: '체험·레저', prefixes: ['LS', 'EX'], tone: 'run', icon: 'M3 12h4l3 8 4-16 3 8h4' },
  { id: 'course', label: '추천코스', prefixes: ['C01'], tone: 'run', icon: 'M18 4a2 2 0 1 1 0 4h-9a3 3 0 0 0 0 6h9a2 2 0 1 1 0 4H6' },
  { id: 'shopping', label: '쇼핑', prefixes: ['SH'], tone: 'idle', icon: 'M6 7h12l1 13H5L6 7zM9 10V7a3 3 0 0 1 6 0v3' },
  { id: 'event', label: '축제·행사', prefixes: ['EV'], tone: 'fail', icon: 'M5 21V4c4-2 8 2 12 0v9c-4 2-8-2-12 0' },
]

/**
 * 본문의 `[주소]` 줄에서 주소를 꺼낸다. 코퍼스 500건 중 478건에 이 줄이 있고 나머지는 null이다.
 *
 * <p>`source_document`에는 주소 컬럼이 없어 본문 파싱이 유일한 경로다. I7이 검색 결과 카드의
 * 주소줄에 사용한다. 컴포넌트 파일에 두면 React Fast Refresh가 깨지므로 분리했다.
 */
export function addressLine(excerpt: string): string | null {
  const line = excerpt.split('\n').find((row) => row.startsWith('[주소]'))
  const value = line?.slice('[주소]'.length).trim()
  return value || null
}

/**
 * 본문의 `[홈페이지]` 줄에서 링크로 쓸 URL을 꺼낸다. 값이 `http://`·`https://`로 **시작할 때만**
 * 돌려주고, 아니면 null이다.
 *
 * <p>R26 대응이다. `citation.sourceUrl`은 로더가 만든 합성 주소(`https://api-test.local/...`)라
 * 열리지 않아 쓸 수 없고, 실제 홈페이지 주소는 본문에만 있다. `excerpt`가 앞 500자 절단이고
 * `[홈페이지]` 오프셋 중앙값이 71이라 대개 절단선 안에 들어온다(9/5 측정).
 *
 * <p>스킴을 추측해 붙이지 않는다 — `www.gokseong.go.kr`처럼 스킴이 없는 값은 버린다.
 * 줄 앞에 설명이 붙은 값(`공식 홈페이지 https://…`)도 버린다: 그런 줄은 URL과 한글이 공백 없이
 * 붙어 있는 경우가 있어(`https://blog.naver.com/murungfarm공식 인스타그램…`) 잘라내면 틀린
 * 주소가 된다. 없는 링크보다 틀린 링크가 나쁘다.
 */
export function homepageLine(excerpt: string): string | null {
  const line = excerpt.split('\n').find((row) => row.startsWith('[홈페이지]'))
  const value = line?.slice('[홈페이지]'.length).trim().split(/\s+/)[0]
  return value && /^https?:\/\//.test(value) ? value : null
}

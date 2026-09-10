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
 * 카드 본문에 쓸 소개글을 꺼낸다 — `[개요]` 다음 줄부터 다음 라벨 줄 직전까지다.
 *
 * <p>`excerpt`는 원문 앞 500자를 그대로 자른 값이라 `[분류]`·`[유형]`·`[이름]`·`[주소]`·
 * `[홈페이지]`·`[상세정보]` 라벨이 전부 들어 있다. 그대로 본문에 넣으면 화면에
 * `[분류] 숙박 > 펜션/민박 [유형] 숙박 …`이 보인다(9/6 실호출에서 확인). 라벨은 각자
 * 제 자리(뱃지·주소·링크)로 올라가므로 본문에는 개요만 남긴다.
 *
 * <p>`[개요]`가 없거나 값이 비면 **원문을 그대로 돌려준다.** 개요가 없는 문서(대동고택 등)에서
 * 본문을 통째로 비우는 것보다, 라벨이 섞여도 내용을 보여주는 편이 낫다.
 */
export function overviewText(excerpt: string): string {
  const rows = excerpt.split('\n')
  const start = rows.findIndex((row) => row.startsWith('[개요]'))
  if (start < 0) return excerpt
  // `[개요]` 뒤에 같은 줄로 붙는 경우와 다음 줄로 내려가는 경우가 둘 다 있다.
  const head = rows[start].slice('[개요]'.length).trim()
  const rest: string[] = []
  for (let index = start + 1; index < rows.length; index += 1) {
    if (rows[index].startsWith('[')) break
    rest.push(rows[index])
  }
  const body = [head, ...rest].join('\n').trim()
  return body || excerpt
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

/**
 * 홈 축제 스트립의 뱃지. `진행 중` · `D-n` · `종료` 중 하나다.
 *
 * <p>시안은 `D-23`을 고정 문자열로 썼지만 그대로 옮기면 시연 날짜가 하루만 지나도 거짓이 된다.
 * 기간에서 계산해 화면이 스스로 맞게 둔다.
 *
 * <p>비교는 `YYYY-MM-DD` 문자열끼리 한다 — `Date.parse`는 UTC 자정으로 읽어서 KST 오전에는
 * 하루 전으로 밀린다. 남은 일수만 두 UTC 자정의 차이로 구하므로 시간대에 영향받지 않는다.
 */
export function festivalBadge(start: string, end: string, today: Date = new Date()): string {
  const now = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  if (now > end) return '종료'
  if (now >= start) return '진행 중'
  return `D-${Math.round((Date.parse(start) - Date.parse(now)) / 86_400_000)}`
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

/**
 * AI 요약 문장에서 근거 문서 제목만 굵게 나눈다. 굵은 조각과 평문 조각을 순서대로 돌려준다.
 *
 * <p>돌려준 조각은 **사이에 공백 없이 이어 붙여야 한다.** 렌더에서 줄바꿈이나 공백 텍스트 노드가
 * 끼면 "도원 이", "고택 ," 처럼 조사 앞에 공백이 생긴다.
 *
 * <p>같은 제목이 다른 제목의 접두인 경우가 있어 긴 제목부터 맞춘다. 답변에 없는 제목은 버린다 —
 * 서버가 근거로 올린 문서라도 문장에 이름이 안 나오는 경우가 있다.
 */
export function highlightTitles(answer: string, titles: string[]): { text: string; bold: boolean }[] {
  const found = titles.filter((title) => title !== '' && answer.includes(title)).sort((a, b) => b.length - a.length)
  if (found.length === 0) return [{ text: answer, bold: false }]
  // 앞쪽만 막는다. 뒤는 조사가 붙으므로("도원이") 열어 둬야 하고, 앞을 열어 두면 "다가도원은"의
  // 꼬리가 제목 "도원"으로 잡혀 낱말 중간이 굵어진다(9/10 실호출에서 확인).
  const pattern = new RegExp(`(?<![가-힣A-Za-z0-9])(${found.map(escapeForRegExp).join('|')})`, 'g')
  return answer.split(pattern).filter((part) => part !== '').map((part) => ({ text: part, bold: found.includes(part) }))
}

/** 문서 제목에 `(`·`?` 같은 글자가 들어와도 패턴이 깨지지 않게 한다. */
function escapeForRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

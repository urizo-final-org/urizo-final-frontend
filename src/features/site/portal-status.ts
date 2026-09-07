import { ProductApiError } from '../../shared/api/error'
import type { AsyncState } from '../../shared/hooks/useAsync'

/**
 * 공개 RAG 경로의 비정상 상태 → 사용자 문구. 검색(A)과 챗봇(B)이 같은 엔드포인트를 쓰므로
 * 같은 상태가 나오고, 두 화면이 같은 말을 해야 한다.
 *
 * <p>**문구만 공유하고 마크업은 공유하지 않는다.** 검색은 결과 영역의 빈 상태로, 챗봇은
 * 시스템 말풍선으로 그려야 해서 형태가 다르다. 여기서 형태까지 정하면 두 화면 중 하나가
 * 어색해진다.
 *
 * <p>`REFUSED`는 오류가 아니라 정상 응답이다 — "근거가 없어 답하지 않았다"는 RAG의 동작이지
 * 장애가 아니므로 경고색·재시도 버튼을 붙이지 않는다.
 *
 * <p>화면 6종의 디자인(D1)은 별도 작업이다. 여기서는 문구와 재시도 가능 여부만 정한다.
 */
export type PortalStatus = {
  /** 한 줄 제목. */
  title: string
  /** 부연 한 줄. 없으면 제목만 그린다. */
  detail?: string
  /** [다시 시도]를 그릴지. 거절은 재시도해도 같은 답이라 false다. */
  retry: boolean
  /** `trace ab12cd34` 형태의 축약 추적자. 공개 경로에만 있고 CMS 경로(RFC 7807)에는 없다. */
  trace?: string
}

const RETRY_SECONDS = (ms?: number) => Math.max(1, Math.round((ms ?? 60_000) / 1000))

/**
 * `idle`·`loading`·`ready`는 정상 흐름이라 null을 준다 — 화면이 각자 스켈레톤·결과를 그린다.
 */
export function describePortalStatus(state: AsyncState<unknown>): PortalStatus | null {
  switch (state.phase) {
    case 'refused':
      return {
        title: '근거 문서를 찾지 못했습니다',
        detail: '수집된 관광 문서에 있는 내용만 답합니다.',
        retry: false,
      }
    case 'rate_limited':
      return {
        title: '요청이 많습니다',
        detail: `${RETRY_SECONDS(state.retryAfterMs)}초 후 다시 시도해 주세요.`,
        retry: false,
      }
    case 'not_ready':
      return {
        title: '일시적으로 검색할 수 없습니다',
        detail: '잠시 후 다시 시도해 주세요.',
        retry: true,
      }
    case 'error':
      return {
        title: '검색 중 문제가 생겼습니다',
        detail: '잠시 후 다시 시도해 주세요.',
        retry: true,
        trace: traceOf(state.error),
      }
    default:
      return null
  }
}

/**
 * 추적자는 있을 때만 보여준다. 시연 중 추적 가능한 경로와 아닌 경로를 즉시 구분하기 위한
 * 것이므로, 없는 경로에서 빈 자리를 만들지 않는다.
 */
function traceOf(failure: unknown): string | undefined {
  if (!(failure instanceof ProductApiError) || !failure.traceId) return undefined
  return `trace ${failure.traceId.slice(0, 8)}`
}

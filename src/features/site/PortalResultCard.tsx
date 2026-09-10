import { homepageLine, overviewText } from './portal-meta'
import { Placeholder, PhotoTag } from './portal-primitives'

/**
 * 검색 결과 카드 1건. 시안 `Portal-Search.dc.html`의 결과 카드를 그대로 옮겼다 —
 * 240px 사진 + 카테고리 뱃지 → 제목 → 주소 → 개요 → 홈페이지 링크 순이다.
 *
 * <p>props 이름은 공개 챗봇 계약(`PublicCitation`)에 맞춰 뒀다. `PortalSearch`가 citation
 * 하나를 그대로 넘긴다.
 *
 * <p>`categoryLabel`은 라벨만 받는다("숙박 > 펜션/민박"). 백엔드가 `category_id` 접두를 빼고
 * 라벨만 싣기로 확정했고(9/5), 접두는 내부 분류 코드라 사용자 화면에 쓰지 않는다.
 *
 * <p>"홈페이지" 링크는 `excerpt`의 `[홈페이지]` 줄에서 나온다(R26). `sourceUrl`이 아니다 —
 * 그쪽은 합성 주소라 죽은 링크다. 줄이 없거나 스킴이 없으면 아무것도 그리지 않는다.
 *
 * <p>`address`는 계약에 없는 값이다. `addressLine(citation.excerpt)`으로 본문의 `[주소]`
 * 줄에서 뽑아 넘긴다(`portal-meta.ts`).
 */
export function PortalResultCard({ title, excerpt, categoryLabel, address, eventStatus }: {
  title: string
  excerpt: string
  categoryLabel?: string
  /**
   * 렌더하지 않는다. 값이 `https://api-test.local/documents/{id}` 형태의 합성 주소라 열리지
   * 않는다(R26, 9/5 확정). 수집 단계에서 실제 원문 주소가 채워지면 그때 켠다.
   */
  sourceUrl?: string
  address?: string
  /**
   * `'ENDED'`일 때만 "종료된 행사" 칩을 단다. 경고가 아니라 사실 표시다 — 지난 행사도
   * 참고 정보라 결과에서 빼지 않고, 빼면 검색 지표까지 흔들린다.
   */
  eventStatus?: string | null
}) {
  const homepage = homepageLine(excerpt)
  const ended = eventStatus === 'ENDED'
  return <article className="grid grid-cols-[15rem_minmax(0,1fr)] overflow-hidden rounded-xl border border-line-soft bg-panel max-[680px]:grid-cols-1">
    <div className="relative">
      <Placeholder label={`사진 · ${title}`} className="h-full min-h-[12.25rem] w-60 max-[680px]:aspect-[16/9] max-[680px]:h-auto max-[680px]:min-h-0 max-[680px]:w-full" />
      <PhotoTag />
    </div>
    <div className="flex flex-col gap-[0.4375rem] px-[1.625rem] py-[1.375rem]">
      {(categoryLabel != null || ended) && <div className="flex flex-wrap gap-1.5">
        {categoryLabel != null && <span className="rounded-md border border-line px-2 py-1 text-[0.6875rem] font-bold text-primary">{categoryLabel}</span>}
        {ended && <span className="rounded-md border border-line px-2 py-1 text-[0.6875rem] font-bold text-muted">종료된 행사</span>}
      </div>}
      <strong className="text-[1.1875rem] font-extrabold tracking-[-.03em] text-ink">{title}</strong>
      {address != null && <span className="text-[0.8125rem] text-muted">{address}</span>}
      {/* 라벨 줄은 각자 제 자리(뱃지·주소·링크)로 올라갔다. 본문에는 개요만 남긴다 —
          raw를 그대로 넣으면 `[분류] 숙박 [유형] 펜션 …`이 화면에 보인다. */}
      <span className="mt-1 line-clamp-3 text-[0.8125rem] leading-[1.6] text-body">{overviewText(excerpt)}</span>
      {homepage && <a href={homepage} target="_blank" rel="noopener noreferrer" className="mt-1 self-start text-[0.8125rem] font-bold text-primary underline underline-offset-4">홈페이지 ↗</a>}
    </div>
  </article>
}

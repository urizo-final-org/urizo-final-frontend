import { categoryBadge, homepageLine, overviewText } from './portal-meta'
import { CardPhoto, PhotoTag } from './portal-primitives'

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
export function PortalResultCard({ title, excerpt, categoryLabel, address, eventStatus, imageUrl }: {
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
  /**
   * 원천 대표 사진. 없거나 로드에 실패하면 `CardPhoto`가 빗금 플레이스홀더로 되돌린다 —
   * 코퍼스 500건 중 95건은 원천에 사진이 없고, 그건 정상이라 지어내지 않는다.
   */
  imageUrl?: string | null
}) {
  const homepage = homepageLine(excerpt)
  const ended = eventStatus === 'ENDED'
  // 실수집 본문은 제목 + 라벨 줄뿐이라 남길 소개글이 없다. 빈 칸을 그리면 여백만 벌어진다.
  const overview = overviewText(excerpt, title)
  // 실수집 코퍼스는 분류 코드(`EV03`)를 보낸다. 탭과 같은 원본으로 한글 이름을 찾는다.
  const badge = categoryBadge(categoryLabel)
  return <article className="grid grid-cols-[15rem_minmax(0,1fr)] overflow-hidden rounded-xl border border-line-soft bg-panel max-[680px]:grid-cols-1">
    <div className="relative">
      <CardPhoto name={title} img={imageUrl} className="h-full min-h-[12.25rem] w-60 max-[680px]:aspect-[16/9] max-[680px]:h-auto max-[680px]:min-h-0 max-[680px]:w-full" />
      <PhotoTag />
    </div>
    <div className="flex flex-col gap-[0.4375rem] px-[1.625rem] py-[1.375rem]">
      {(badge != null || ended) && <div className="flex flex-wrap gap-1.5">
        {badge != null && <span className="rounded-md border border-line px-2 py-1 text-[0.6875rem] font-bold text-primary">{badge}</span>}
        {/* 카테고리 뱃지와 **모양으로** 갈린다 — 저쪽은 테두리형, 이쪽은 채움형이다. 둘 다
            테두리형이던 때는 두 카드가 한눈에 거의 같아 보여서, 진행 중 행사와 종료된 행사를
            나란히 놓아도 사람이 차이를 못 짚었다. 색만으로 구분하지 않으려고 "종료된 행사"
            글자는 그대로 둔다. 경고색(fail)이 아니라 주의색(wait)인 것은 의도다 — 지난 행사도
            참고 정보라 오류가 아니다. */}
        {ended && <span className="rounded-md border border-wait-fg/35 bg-wait-bg px-2 py-1 text-[0.6875rem] font-bold text-wait-fg">종료된 행사</span>}
      </div>}
      <strong className="text-[1.1875rem] font-extrabold tracking-[-.03em] text-ink">{title}</strong>
      {address != null && <span className="text-[0.8125rem] text-muted">{address}</span>}
      {/* 라벨 줄은 각자 제 자리(뱃지·주소·링크)로 올라갔다. 본문에는 개요만 남긴다 —
          raw를 그대로 넣으면 `[분류] 숙박 [유형] 펜션 …`이 화면에 보인다. */}
      {overview !== '' && <span className="mt-1 line-clamp-3 text-[0.8125rem] leading-[1.6] text-body">{overview}</span>}
      {homepage && <a href={homepage} target="_blank" rel="noopener noreferrer" className="mt-1 self-start text-[0.8125rem] font-bold text-primary underline underline-offset-4">홈페이지 ↗</a>}
    </div>
  </article>
}

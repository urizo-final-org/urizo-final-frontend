/**
 * 공개 RAG 경로(A 검색 · B 챗봇)의 계약 타입.
 *
 * <p>기준: 백엔드 `PublicChatContract`(커밋 `5839566`)와 `api_contract_extract_0903.md`.
 * 관리자 전용 값(`queryId`·`knowledgeVersionId`·`documentId`·`score`)은 응답에 오지 않으므로
 * 타입에도 두지 않는다 — 타입에 있으면 결국 누군가 쓴다.
 */

export type PublicCitation = {
  title: string
  excerpt: string
  /**
   * TODO(S2): 백엔드 F10 확장(`5839566`)이 병합·배포되면 required로 좁힌다. 지금 떠 있는
   * 서버는 아직 `title`·`excerpt` 2필드만 준다.
   */
  sourceUrl?: string
  /**
   * 라벨만 온다("숙박 > 펜션/민박"). `category_id` 접두는 싣지 않기로 확정했다(9/5).
   * TODO(S2): 위와 같은 시점에 required로 좁힌다.
   */
  categoryLabel?: string
  /**
   * `'ENDED'`(종료된 행사) 또는 null. 백엔드 axms-ai02-008이 추가하는 필드라 지금 떠 있는
   * 서버는 아직 싣지 않는다 — optional로 두고 배포 후 `string | null`로 좁힌다.
   */
  eventStatus?: string | null
  /**
   * 원천 대표 사진 주소. 사진이 없는 문서는 null이다(코퍼스 500건 중 95건). 백엔드
   * axms-ai02-012가 추가하는 필드라 배포 전 서버는 싣지 않는다 — optional로 둔다.
   *
   * <p>`sourceUrl`과 달리 원천이 준 실제 주소라 열린다. 대신 http가 섞여 있어 https 페이지에서는
   * 혼합 콘텐츠로 차단될 수 있고, 그때는 `CardPhoto`가 플레이스홀더로 되돌린다.
   */
  imageUrl?: string | null
}

export type PublicChatRequest = {
  query: string
  conversationId?: string
  /**
   * 같은 대화의 직전 사용자 질문. 서버가 대화를 저장하지 않으므로 클라이언트가 들고 온다.
   * 백엔드는 이 값을 검색 임베딩에만 얹고 근거 필터·문장 추출에는 쓰지 않는다.
   * 한 건만 보낸다 — 대명사를 푸는 데 필요한 것은 직전 턴이다.
   */
  previousQuery?: string
  /**
   * `category_id` 접두 목록. 탭 하나가 접두 둘 이상인 경우(체험·레저 = LS + EX,
   * 관광지 = NA + HS + VE)가 있어 단일 값으로는 표현되지 않는다. "전체" 탭은 보내지 않는다.
   */
  category?: string[]
}

export type PublicChatOutcome = 'ANSWERED' | 'REFUSED'

export type PublicChatResponse = {
  schemaVersion: string
  traceId: string
  conversationId: string
  outcome: PublicChatOutcome
  answer: string
  citations: PublicCitation[]
  generatedAt: string
}

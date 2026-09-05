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
}

export type PublicChatRequest = {
  query: string
  conversationId?: string
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

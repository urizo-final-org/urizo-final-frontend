/**
 * 공용 버튼 스타일에서 hover 규칙만 걷어낸다.
 *
 * <p>`shared/ui/primitives.tsx`에서 직접 지우면 그 스타일을 함께 쓰는 다른 담당자 화면
 * 9곳이 같이 바뀐다. 공용 정의는 그대로 두고 RAG 관리 화면에서만 벗겨 쓴다.
 *
 * <p>`RagAdminPanel`에 두지 않는다 — `ActivationRequests`가 그 파일을 다시 import하면
 * 순환 참조가 된다(RagAdminPanel → ActivationRequests → RagAdminPanel).
 */
export const noHover = (style: string) => style.replace(/\benabled:hover:\S+\s*/g, '').trim()

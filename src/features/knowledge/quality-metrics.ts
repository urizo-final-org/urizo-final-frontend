/**
 * 오프라인 실측 스냅샷(A4 품질 지표)이 잰 프로젝트. 지표는 관광(1호) 측정치라 다른
 * 고객사 화면에 그대로 보이면 안 된다 — 프로젝트가 2개가 되는 순간 중기부를 고르면
 * 하드코딩된 관광 수치가 그대로 보인다(WBS AI02-011).
 *
 * <p>UUID는 로컬 데모 DB {@code app.project}의 관광 행이다. 상수 시대의 규칙이며
 * 버전별 지표가 계약에 실리는 날 이 파일째 사라진다.
 */
export const MEASURED_PROJECT_ID = 'be8bc06d-74d4-4436-93c3-b38069f710e1'

export function qualityMeasured(projectId: string | undefined): boolean {
  return projectId === MEASURED_PROJECT_ID
}

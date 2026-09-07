/**
 * 관리자 RAG 경로(C)의 계약 타입.
 *
 * <p>기준: 백엔드 `ProductApiContract`(dev `ba11b29`). 공개 경로(`types.ts`)와 달리 관리자
 * 응답은 `knowledgeVersionId`·`status`·`buildJobId`를 그대로 준다 — F10의 차단은 공개 응답
 * 한정이다.
 */

/**
 * `knowledge_version.status`. Java enum은 없고 Flyway CHECK 제약이 정의다
 * (`V20260811210000__create_stage3_product_core.sql:85-86`).
 *
 * <p>**빌드 진행 중을 뜻하는 값이 둘**이다 — `BUILD_REQUESTED`(생성 시)와 `BUILDING`
 * (`collect()` 진입 시). `WAITING_APPROVAL`은 이쪽이 아니라 `product_job`의 상태다.
 */
export type KnowledgeVersionStatus =
  | 'BUILD_REQUESTED'
  | 'BUILDING'
  | 'APPROVAL_PENDING'
  | 'ACTIVE'
  | 'ARCHIVED'
  | 'FAILED'

/** 진행 중 판정. 화면 진입 시 폴링을 켤지 이 값으로 정한다. */
export const IN_PROGRESS_STATUSES: readonly KnowledgeVersionStatus[] = ['BUILD_REQUESTED', 'BUILDING']

export function isBuildInProgress(status: string): boolean {
  return (IN_PROGRESS_STATUSES as readonly string[]).includes(status)
}

export type KnowledgeVersion = {
  knowledgeVersionId: string
  knowledgeBaseId: string
  connectorVersionId: string
  /** 계약상 nullable이다. 없으면 job 폴링 없이 경과 시간만 쓴다. */
  buildJobId?: string
  versionNumber: number
  label?: string
  status: KnowledgeVersionStatus
  configDigest?: string
  documentCount: number
  chunkCount: number
  /** 빌드 시작 시각. 경과 시간의 기준이며 새로고침 후에도 복구된다. */
  createdAt: string
  /**
   * EVALUATE 단계가 무조건 100으로 세운다(`ProductBatchService.java:258`). 실제 평가 로직이
   * 아니므로 품질 지표로 쓰지 않는다 — A4는 오프라인 실측 스냅샷을 따로 쓴다.
   */
  score?: number
  readyAt?: string
  activatedAt?: string
}

export type KnowledgeVersionList = {
  schemaVersion: string
  traceId: string
  items: KnowledgeVersion[]
}

/**
 * ⚠️ **응답 최상위가 아니라 `progress` 객체 안에 있다.** 9/6 실호출에서 경로를 틀려
 * 전부 `undefined`를 읽은 적이 있다 — 화면은 조용히 빈 값을 그린다.
 *
 * <p>`percent`는 phase별 고정 상수이고 `successCount`는 CHUNK 완료 시점 값이 그대로
 * 고정된다(9/6 빌드 1회 실측: `CHUNK` 45% · 500/500에서 8분 36초 정지). **둘 다 진행
 * 표시로 쓰지 않는다.** 타입에는 남겨 두되 화면이 읽지 않는다.
 */
export type JobProgress = {
  phase: string
  percent: number
  targetCount?: number
  successCount?: number
  failedCount?: number
}

export type JobFailure = {
  code: string
  message: string
  retryable: boolean
  retryAfterMs?: number
}

export type AgentJob = {
  schemaVersion: string
  traceId: string
  jobId: string
  jobType: string
  status: string
  stateVersion: number
  progress?: JobProgress
  failure?: JobFailure
  createdAt: string
  startedAt?: string
  /** 9/6 실측에서 빌드 8분 36초 동안 두 값밖에 나오지 않았다. 정체 판정에 쓸 수 없다. */
  updatedAt?: string
  finishedAt?: string
}

/** 빌드·활성화·롤백이 공통으로 요구하는 본문 필드. */
export const ADMIN_SCHEMA_VERSION = '1.0'

export type Project = {
  projectId: string
  name: string
  status: string
}

export type KnowledgeBase = {
  knowledgeBaseId: string
  projectId: string
  name: string
  /** 활성 버전이 없으면 null. 계약이 ALWAYS 직렬화라 키는 항상 온다. */
  activeVersionId: string | null
}

/**
 * 화면이 다룰 지식 베이스를 정하는 결과.
 *
 * <p>UUID를 상수로 박지 않는다. `5352d53e…`는 **이 노트북 DB의 값**이라 팀원이 콜드
 * 스타트로 환경을 세우면 다른 UUID가 생기고, 박아 두면 그 환경에서 관리자 화면이 통째로
 * 깨진다(함정 24 — 문서값은 "마지막 확인 시점의 기록"이다).
 */
export type KnowledgeTarget =
  | {
    kind: 'ready'; projectId: string; knowledgeBaseId: string; name: string
    /** 드롭다운을 계속 그리기 위해 후보를 함께 들고 온다. */
    projects: Project[]; project: Project; bases: KnowledgeBase[]
  }
  /** 0건. 콜드 스타트 직후 상태다. */
  | { kind: 'empty'; what: 'project' | 'knowledgeBase'; projects?: Project[]; project?: Project }
  /**
   * 여러 건인데 아직 고르지 않았다. **첫 번째를 조용히 고르지 않는다** — 잘못된 KB를 보고도
   * 모르게 된다. 후보를 그대로 올려 사람이 고르게 한다.
   */
  | {
    kind: 'choose'; what: 'project' | 'knowledgeBase'
    projects: Project[]; project?: Project; bases?: KnowledgeBase[]
  }

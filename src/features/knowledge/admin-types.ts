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

/**
 * 빌드가 스스로 잰 검색 평가(AI02-019).
 *
 * **시험지가 아니다.** `TITLE_SELF_RETRIEVAL`은 문서 제목으로 검색해 그 문서가 상위에
 * 돌아오는지 본 것이라, 증명하는 것은 "색인이 검색 가능한가"이지 "사용자 질문에 잘
 * 답하는가"가 아니다. 화면 문구가 이 구분을 지워서는 안 된다.
 *
 * 정답이 질의당 하나라 Recall@K와 Hit@K가 같은 값이고, 그래서 Hit만 싣는다.
 */
export type BuildEvaluation = {
  method: 'TITLE_SELF_RETRIEVAL' | 'GOLDEN_QUESTION'
  sampleSize: number
  hit5: number
  hit10: number
  mrr10: number
  /** AI02-020. 골든 세트 버전. 같은 값으로 잰 버전끼리만 점수 비교가 성립한다. */
  setVersion?: number
  /** 채점 **전에** 동결된 제외 문항. 순위를 보고 뺀 문항은 이 목록에 존재할 수 없다. */
  excluded?: { id: string; reason: string }[]
  /** 정답 문서 내용이 세트 생성 시점과 달라진 문항 수 — 제외 사유가 아니라 기록이다. */
  modifiedCount?: number
}

/** 빌드가 LLM에게 받아 저장한 청킹 규칙. `reason`은 모델이 적은 근거 한 문장이다. */
export type ChunkingStrategy = {
  maxCharacters: number
  overlapCharacters: number
  reason: string
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
  /**
   * AI02-018. 이 버전이 쓴 청킹 규칙. **없으면 문서당 1청크로 만든 버전이다** —
   * 계약상 선택 항목이라 AI02-018 이전에 만들어진 버전은 값이 없다.
   */
  chunkingStrategy?: ChunkingStrategy
  /** AI02-019. 빌드가 잰 검색 평가. 없으면 평가 전에 만들어진 버전이다. */
  evaluation?: BuildEvaluation
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

/**
 * 원천 변경 점검 요약(AI02-022). 스케줄러가 활성 버전과 원천 API를 (공고 ID, 내용 해시)로
 * 대조해 남긴다. "소멸"은 삭제가 아니라 원천 조회 창에서 빠진 것까지 포함한다.
 */
export type SourceChangeSummary = {
  checkedAt: string
  /** 비교 기준이 된 활성 버전 번호. 이 버전을 갈아끼우면 요약도 0으로 돌아간다. */
  comparedVersion: number
  added: number
  modified: number
  missing: number
}

export type KnowledgeBase = {
  knowledgeBaseId: string
  projectId: string
  name: string
  /** 활성 버전이 없으면 null. 계약이 ALWAYS 직렬화라 키는 항상 온다. */
  activeVersionId: string | null
  /** AI02-022. 점검된 적 없으면 없다. 활성 버전이 없는 지식베이스는 점검 대상이 아니다. */
  sourceChangeSummary?: SourceChangeSummary
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

/**
 * 자료 갱신 요청. 권한 없는 관리자가 최고 관리자에게 남기는 한 줄이다.
 *
 * <p>`knowledgeVersionId`가 **nullable**이다 — "이 버전을 켜 주세요"와 "새로 만들어
 * 주세요"를 한 계약으로 받는데, 후자는 대상 버전이 아직 없다.
 *
 * <p>`status`는 `OPEN`·`RESOLVED` 둘뿐이고 목록은 `OPEN`만 내려준다. **닫는 것은 화면의
 * 일이 아니다** — 활성화·롤백이 곧 처리이고 서버가 그때 닫는다.
 */
export type ActivationRequest = {
  requestId: string
  knowledgeBaseId: string
  knowledgeVersionId: string | null
  reason: string | null
  status: 'OPEN' | 'RESOLVED'
  /** 서버가 세션에서 읽는다. 본문에 자리가 없어 위조할 수 없다. */
  requestedBy: string
  requestedByName: string
  createdAt: string
}

export type ActivationRequestList = {
  schemaVersion: string
  traceId: string
  items: ActivationRequest[]
}

/**
 * 커넥터 계약 타입. 기준은 Backend `contracts/public/openapi.yaml`(dev `bda6ec3`)이고
 * 최종 판정은 `ConnectorStore.validateConnector`다 — 화면은 같은 규칙을 입력 단계에서
 * 안내만 하고, 통과 여부는 서버 응답을 따른다.
 *
 * <p>⚠️ **`status`는 커넥터가 아니라 선택된 버전의 상태다.** 응답이 `active_version_id`
 * 또는 최신 버전을 조인해 내려주므로(`ConnectorStore.connectorSelect()`), 한 커넥터를
 * 여러 번 등록하면 같은 `connectorId`에 버전만 쌓인다.
 */
export type ConnectorStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'

export type Connector = {
  schemaVersion: string
  traceId: string
  projectId: string
  connectorId: string
  connectorVersionId: string
  name: string
  status: ConnectorStatus
  configDigest: string
  createdAt: string
}

export type ConnectorList = {
  schemaVersion: string
  traceId: string
  items: Connector[]
}

/**
 * ⚠️ **`secretRef`는 참조 문자열이지 키 값이 아니다.** 화면·로그·커밋 어디에도 실제
 * API Key가 남지 않는 유일한 이유가 이것이다 — 폼에 키 값을 받는 입력을 만들지 않는다.
 */
export type ConnectorAuthentication = {
  type: 'API_KEY'
  location: 'QUERY' | 'HEADER'
  name: string
  secretRef: string
}

export type ConnectorParameterType = 'STRING' | 'INTEGER' | 'NUMBER' | 'BOOLEAN'

export type ConnectorRequestParameter = {
  name: string
  type: ConnectorParameterType
  required: boolean
  description?: string
  defaultValue?: string | number | boolean
}

export type ConnectorResponseMapping = {
  itemsPath: string
  successCodePath?: string
  /** 계약이 `minItems: 1`이다 — 비면 키 자체를 빼야 한다. */
  successValues?: (string | number)[]
  totalCountPath?: string
}

export type ConnectorPagination = {
  type: 'PAGE'
  pageParameter: string
  pageSizeParameter: string
  startPage: number
  pageSize: number
}

/**
 * `metadata`는 **키를 라벨로 쓴다**(02번 문서 「도메인과 커넥터」). 표시 순서도 이 매핑이
 * 정하므로 객체 키 삽입 순서를 보존한다 — 한글 키는 정수 키가 아니라 순서가 유지된다.
 */
export type ConnectorDocumentMapping = {
  documentId: string
  title: string
  content: string
  category?: string
  sourceUpdatedAt?: string
  sourceUrl?: string
  metadata?: Record<string, string>
}

export type CreateConnectorRequest = {
  name: string
  baseUrl: string
  endpoint: string
  /** 계약이 `const: GET`이다. 고를 수 있는 값이 아니라 화면에 읽기 전용으로 적는다. */
  method: 'GET'
  authentication: ConnectorAuthentication
  requestParameters: ConnectorRequestParameter[]
  response: ConnectorResponseMapping
  pagination: ConnectorPagination
  documentMapping: ConnectorDocumentMapping
}

export type PreviewDocument = {
  documentId: string
  title: string
  content: string
  /** 계약상 배열이다 — 단수 문자열이 아니다. */
  category?: string[]
  sourceUrl?: string
  sourceUpdatedAt?: string
}

export type ConnectorPreview = {
  schemaVersion: string
  traceId: string
  connectorId: string
  itemCount: number
  totalCount?: number
  documents: PreviewDocument[]
  truncated: boolean
  checkedAt: string
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { describeFailure } from '../../shared/api/error'
import { Badge, Callout, PanelTitle, control, fieldLabel, panel, smallButton, tableButton, textarea, type Tone } from '../../shared/ui/primitives'
import { Icon } from '../../shared/ui/icons'
import { noHover } from './no-hover'
import type { KnowledgeAdminApi } from './admin-api'
import type {
  Connector, ConnectorPreview, ConnectorRequestParameter, ConnectorStatus, ConnectorParameterType,
  CreateConnectorRequest,
} from './admin-types'

/**
 * 데이터 소스(커넥터) 등록·미리보기·활성화.
 *
 * <p>**메우는 구멍**: 지금까지 커넥터를 만드는 길이 화면에 없었다. `RagAdminPanel`의
 * 「Build 시작」은 **최신 지식 버전이 쓴 `connectorVersionId`를 그대로 재사용**하므로,
 * 자료원이 이미 DB에 있어야만 화면이 돌아갔다. 고객사를 바꾸려면 사람이 SQL이나 curl로
 * 커넥터를 넣어야 했다 — 그 한 칸이 여기다.
 *
 * <p>⚠️ **허용 원천은 서버가 정하고 시점에 따라 다르다.** `origin/dev` 기준으로는
 * `https://*.fixture.invalid`만 통과하지만, Backend `AXMS-AI02-009`이 병합되면
 * `ConnectorSourcePolicy`의 허용 호스트 목록(기본 `apis.data.go.kr`)으로 바뀐다. 공개 계약은
 * 양쪽이 같다 — 그래서 **화면은 어느 호스트가 되는지 스스로 판정하지 않는다.** 거절 사유는
 * 서버 응답 문장을 그대로 보인다. 규정이 바뀌어도 프론트가 틀린 쪽이 되지 않는 유일한 방법이다.
 *
 * <p>대신 **원천 종류와 인증 참조의 짝**은 양쪽 시점에 공통이라 폼에서 안내한다 — 픽스처
 * 호스트는 `fixture://`, 실제 원천은 `cms-secret://`다. 어긋나면 등록 시점에 422다
 * (`ConnectorStore.validateSecretRef`). "등록은 되는데 수집에서 실패"를 막으려는 규칙이다.
 *
 * <p>**범위 밖**: Connector Sync(`POST /api/connectors/{id}/sync`) — 시연 동선(등록 →
 * 빌드 → 승인 → 활성화)이 이 Job을 쓰지 않고, 백엔드가 아직 픽스처 건수를 보고한다.
 * 빌드가 쓸 커넥터를 고르는 것도 이번 범위가 아니다 — 기존 빌드 동작을 바꾸지 않는다.
 */

/** 쓰기 4종과 같은 문장. 역할로 미리 판별해 눌러서 403을 받지 않는다. */
const WRITE_DENIED = 'SUPER_ADMIN 권한이 필요합니다. 최고 관리자에게 요청하세요.'

/**
 * 쓸 수 있는 참조는 두 갈래뿐이다. **계약 정규식(`^[A-Za-z][A-Za-z0-9+.-]*://`)보다 좁게 막는다.**
 *
 * <p>서버 규칙은 `ConnectorSecretResolver.NAME`(`^[a-z0-9][a-z0-9-]{0,63}$`) 하나이고,
 * 등록 검증(`validateSecretRef`)과 값 해석이 같은 것을 쓴다. 경로 조작을 막으려고 이름에
 * `/`와 `.`을 금지한 규칙이라 슬래시 넣은 참조는 422다.
 *
 * <p>같은 규칙을 폼에도 두는 것은 중복이 아니라 **거절 지점을 앞으로 당기는 것**이다 —
 * 서버가 422로 막아 줘도 사람은 폼을 다 채우고 저장을 누른 뒤에야 알게 된다. 여기서는
 * 그 칸에서 바로 안다. 서버가 여전히 최종 판정이므로 규칙이 갈라져도 통과되지는 않는다.
 */
const SECRET_REF_PATTERN = 'fixture://.+|cms-secret://[a-z0-9][a-z0-9-]{0,63}'

/** 계약 상한이 20이다. 5건이면 매핑이 맞는지 눈으로 보기에 충분하다. */
const PREVIEW_MAX_ITEMS = 5

/** 미리보기 본문은 매핑 확인용이다 — 전문을 붙이면 카드가 화면을 덮는다. */
const PREVIEW_CONTENT_CHARS = 200

const STATUS_TONE: Record<ConnectorStatus, Tone> = { DRAFT: 'wait', ACTIVE: 'ok', ARCHIVED: 'idle' }
const STATUS_LABEL: Record<ConnectorStatus, string> = { DRAFT: '초안', ACTIVE: '활성', ARCHIVED: '보관' }

type ParameterRow = { name: string; type: ConnectorParameterType; required: boolean }

export type ConnectorForm = {
  name: string
  baseUrl: string
  endpoint: string
  authLocation: 'QUERY' | 'HEADER'
  authName: string
  secretRef: string
  requestParameters: ParameterRow[]
  itemsPath: string
  successCodePath: string
  successValues: string
  totalCountPath: string
  pageParameter: string
  pageSizeParameter: string
  startPage: string
  pageSize: string
  documentId: string
  title: string
  content: string
  category: string
  sourceUpdatedAt: string
  sourceUrl: string
  metadata: string
}

/**
 * 프리셋 둘. **지어낸 값이 아니다** — 중기부 쪽은 02번 문서 「도메인과 커넥터」의 확정 표와
 * 같고, 픽스처 쪽은 오늘 백엔드가 실제로 통과시키는 유일한 조합이다.
 *
 * <p>픽스처 프리셋을 남겨 두는 이유: 이것이 없으면 최고 관리자가 이 화면에서 **성공을 한 번도
 * 볼 수 없다**. 등록이 되는지, 미리보기가 도는지, 활성화가 먹는지를 오늘 확인할 수 있는 경로다.
 */
export const PRESETS: Record<'sme' | 'fixture', { label: string; hint: string; form: ConnectorForm }> = {
  sme: {
    label: '중기부 공고',
    hint: '공공데이터포털 「중소기업 지원사업 공고 조회 서비스」 확정값입니다.',
    form: {
      name: 'SME_SUPPORT_ANNOUNCEMENT',
      baseUrl: 'https://apis.data.go.kr/1421000/bizinfo',
      endpoint: '/pblancBsnsService',
      authLocation: 'QUERY',
      authName: 'serviceKey',
      secretRef: 'cms-secret://sme-support-api',
      requestParameters: [],
      itemsPath: '$.response.body.items.item',
      successCodePath: '$.response.header.resultCode',
      successValues: '00',
      totalCountPath: '$.response.body.totalCount',
      pageParameter: 'pageNo',
      pageSizeParameter: 'numOfRows',
      startPage: '1',
      pageSize: '100',
      documentId: '$.pblancId',
      title: '$.pblancNm',
      content: '$.bsnsSumryCn',
      category: '$.pldirSportRealmLclasCodeNm',
      sourceUpdatedAt: '$.updtPnttm',
      sourceUrl: '$.pblancUrl',
      metadata: [
        '신청기간=$.reqstBeginEndDe',
        '지원대상=$.trgetNm',
        '소관기관=$.jrsdInsttNm',
        '수행기관=$.excInsttNm',
        '신청방법=$.reqstMthPapersCn',
        '문의처=$.refrncNm',
      ].join('\n'),
    },
  },
  fixture: {
    label: '픽스처 (1호 관광 코퍼스)',
    hint: '결정적 픽스처 어댑터가 처리하는 원천입니다. 실제 호출 없이 등록·미리보기·활성화를 확인할 수 있습니다.',
    form: {
      name: 'LOCAL_FIXTURE',
      baseUrl: 'https://fixture.invalid',
      endpoint: '/documents',
      authLocation: 'QUERY',
      authName: 'serviceKey',
      secretRef: 'fixture://local-demo',
      requestParameters: [],
      itemsPath: '$.items',
      successCodePath: '',
      successValues: '',
      totalCountPath: '$.totalCount',
      pageParameter: 'pageNo',
      pageSizeParameter: 'numOfRows',
      startPage: '1',
      pageSize: '100',
      documentId: '$.documentId',
      title: '$.title',
      content: '$.content',
      category: '$.category',
      sourceUpdatedAt: '',
      sourceUrl: '$.sourceUrl',
      metadata: '',
    },
  },
}

/**
 * `라벨=$.경로` 줄을 매핑으로 만든다. **순서가 곧 표시 순서다**(02번 문서) — 객체 키
 * 삽입 순서가 그대로 남는다.
 *
 * <p>`=`가 값 안에 또 나올 수 있으므로 **첫 `=`에서만** 자른다.
 */
export function parseMetadata(text: string): Record<string, string> | undefined {
  const entries = text.split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.includes('='))
    .map((line) => {
      const at = line.indexOf('=')
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()] as const
    })
    .filter(([label, path]) => label.length > 0 && path.length > 0)
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

/**
 * 성공 코드 목록. **문자열로 둔다** — `resultCode`의 `00`을 숫자로 바꾸면 `0`이 되어
 * 원본 응답과 영영 일치하지 않는다. 계약은 문자열도 정수도 받는다.
 */
export function parseSuccessValues(text: string): string[] | undefined {
  const values = [...new Set(text.split(',').map((value) => value.trim()).filter(Boolean))]
  return values.length > 0 ? values : undefined
}

/**
 * 폼 → 계약 본문. **비어 있는 선택 항목은 키 자체를 빼야 한다** — 백엔드
 * `requireFields`가 허용 목록 밖의 키를 거절하고, 빈 문자열은 JSONPath 검사(`^\$`)에서
 * 막힌다. `JSON.stringify`가 `undefined` 키를 지우는 것에 기댄다.
 */
export function buildCreateRequest(form: ConnectorForm): CreateConnectorRequest {
  const path = (value: string) => (value.trim() ? value.trim() : undefined)
  return {
    name: form.name.trim(),
    baseUrl: form.baseUrl.trim(),
    endpoint: form.endpoint.trim(),
    method: 'GET',
    authentication: {
      type: 'API_KEY',
      location: form.authLocation,
      name: form.authName.trim(),
      secretRef: form.secretRef.trim(),
    },
    requestParameters: form.requestParameters
      .filter((row) => row.name.trim().length > 0)
      .map((row): ConnectorRequestParameter => ({
        name: row.name.trim(), type: row.type, required: row.required,
      })),
    response: {
      itemsPath: form.itemsPath.trim(),
      successCodePath: path(form.successCodePath),
      successValues: parseSuccessValues(form.successValues),
      totalCountPath: path(form.totalCountPath),
    },
    pagination: {
      type: 'PAGE',
      pageParameter: form.pageParameter.trim(),
      pageSizeParameter: form.pageSizeParameter.trim(),
      startPage: Number(form.startPage),
      pageSize: Number(form.pageSize),
    },
    documentMapping: {
      documentId: form.documentId.trim(),
      title: form.title.trim(),
      content: form.content.trim(),
      category: path(form.category),
      sourceUpdatedAt: path(form.sourceUpdatedAt),
      sourceUrl: path(form.sourceUrl),
      metadata: parseMetadata(form.metadata),
    },
  }
}

export function ConnectorPanel({ api, projectId, mayWrite, onFirstBuild }: {
  api: KnowledgeAdminApi
  /** 대상 프로젝트가 정해지기 전에는 목록을 읽을 곳이 없다. */
  projectId: string | null
  mayWrite: boolean
  /**
   * 첫 빌드를 시작할 수 있을 때만 온다(버전 0건 · 쓰기 권한 · 진행 중 빌드 없음).
   * **빌드 자체는 이 패널의 일이 아니다** — 어느 커넥터로 시작할지만 올려 보내고,
   * 확인창과 실행은 `RagAdminPanel`이 자기 기계로 처리한다.
   */
  onFirstBuild?: (connector: Connector) => void
}) {
  const [connectors, setConnectors] = useState<Connector[] | null>(null)
  // 실패를 null로 표현하면 "불러오는 중…"과 구분이 안 돼 실패가 로딩으로 위장한다.
  const [listFailed, setListFailed] = useState(false)
  const [form, setForm] = useState<ConnectorForm | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const [created, setCreated] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ connectorId: string; result: ConnectorPreview } | null>(null)
  const alive = useRef(true)

  // 마운트마다 되살린다. StrictMode는 mount → unmount → mount로 두 번 도는데 정리에서
  // false로만 두면 두 번째 마운트가 영원히 막힌다(AI02-005 함정 3).
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  // 프로젝트가 바뀌면 이전 프로젝트의 목록·미리보기·폼을 들고 있지 않는다.
  useEffect(() => {
    setConnectors(null)
    setListFailed(false)
    setPreview(null)
    setForm(null)
    setCreated(null)
    setFailure(null)
  }, [projectId])

  const load = useCallback(async () => {
    if (!projectId) return
    try {
      const list = await api.listConnectors(projectId)
      if (alive.current) { setConnectors(list.items ?? []); setListFailed(false) }
    }
    catch {
      // 커넥터 목록 하나 때문에 RAG 화면 전체가 오류로 덮이면 안 된다. 패널은 세워 둔다.
      if (alive.current) setListFailed(true)
    }
  }, [api, projectId])

  useEffect(() => { void load() }, [load])

  const submit = useCallback(async () => {
    if (!projectId || !form) return
    setBusy(true)
    setFailure(null)
    try {
      const connector = await api.createConnector(projectId, buildCreateRequest(form))
      if (alive.current) { setCreated(connector.name); setForm(null) }
    }
    catch (error) {
      // 422 본문에 사유가 그대로 들어 있다. 화면이 다시 쓰지 않고 서버 문장을 보인다.
      if (alive.current) setFailure(error)
    }
    finally {
      await load()
      if (alive.current) setBusy(false)
    }
  }, [api, projectId, form, load])

  const runPreview = useCallback(async (connector: Connector) => {
    setBusy(true)
    setFailure(null)
    setPreview(null)
    try {
      const result = await api.previewConnector(connector.connectorId, PREVIEW_MAX_ITEMS)
      if (alive.current) setPreview({ connectorId: connector.connectorId, result })
    }
    catch (error) {
      if (alive.current) setFailure(error)
    }
    finally {
      if (alive.current) setBusy(false)
    }
  }, [api])

  const activate = useCallback(async (connector: Connector) => {
    setBusy(true)
    setFailure(null)
    try {
      await api.activateConnectorVersion(connector.connectorId, connector.connectorVersionId)
    }
    catch (error) {
      if (alive.current) setFailure(error)
    }
    finally {
      await load()
      if (alive.current) setBusy(false)
    }
  }, [api, load])

  if (!projectId) return null

  const items = connectors ?? []

  return <section className={panel}>
    <PanelTitle title="데이터 소스" sub={connectors ? `커넥터 ${items.length}건` : undefined}>
      <button
        className={tableButton}
        disabled={!mayWrite || busy}
        onClick={() => { setForm(form ? null : PRESETS.sme.form); setCreated(null); setFailure(null) }}
        title={!mayWrite ? WRITE_DENIED : '고객사 외부 API 연결정보를 등록합니다.'}
      ><Icon name="plus" size={12} />{form ? '등록 취소' : '커넥터 등록'}</button>
    </PanelTitle>

    {form && <RegisterForm
      form={form}
      busy={busy}
      onChange={setForm}
      onSubmit={() => { void submit() }}
    />}

    {created && <div className="border-b border-line-soft px-4 py-[0.875rem]">
      <Callout tone="ok" icon="check">
        {created} 초안을 저장했습니다. 아래 목록에서 미리보기로 매핑을 확인한 뒤 활성화하세요.
      </Callout>
    </div>}
    {failure != null && <div className="border-b border-line-soft px-4 py-[0.875rem]">
      <Callout tone="warn" icon="triangle-alert">{describeFailure(failure)}</Callout>
    </div>}

    <div>
      {connectors == null && !listFailed && <p className="m-0 px-4 py-[0.875rem] text-xs text-muted-3">커넥터를 불러오는 중…</p>}
      {listFailed && <div className="flex items-center gap-2 px-4 py-[0.875rem]">
        <p className="m-0 text-xs text-muted-3">커넥터 목록을 불러오지 못했습니다.</p>
        <button className={noHover(smallButton)} onClick={() => { void load() }}>다시 시도</button>
      </div>}
      {connectors != null && !listFailed && items.length === 0 && <p className="m-0 px-4 py-[0.875rem] text-xs text-muted-3">
        등록된 커넥터가 없습니다. 지금 보이는 지식 버전은 기존 자료원으로 만들어진 것입니다.
      </p>}

      {items.map((connector) => <div key={connector.connectorId} className="border-b border-row-line px-4 py-[0.625rem] text-xs text-body last:border-b-0">
        <div className="flex flex-wrap items-center gap-2">
          <Icon name="plug" size={13} className="text-muted-3" />
          <b className="text-[0.78125rem] font-semibold text-ink">{connector.name}</b>
          <Badge tone={STATUS_TONE[connector.status]}>{STATUS_LABEL[connector.status]}</Badge>
          {/* 설정 지문. 같은 이름으로 재등록했을 때 실제로 다른 설정인지 여기서 갈린다. */}
          <span className="font-mono text-[0.6875rem] text-muted-3" title={connector.configDigest}>
            {connector.configDigest.slice(7, 19)}
          </span>
          <span className="ml-auto flex items-center gap-2">
            <span className="font-mono text-[0.6875rem] text-muted-3">
              {new Date(connector.createdAt).toLocaleDateString('ko-KR')}
            </span>
            <button
              className={tableButton}
              disabled={!mayWrite || busy}
              onClick={() => { void runPreview(connector) }}
              title={!mayWrite ? WRITE_DENIED : '문서 몇 건을 실제로 가져와 매핑 결과를 봅니다.'}
            ><Icon name="search-check" size={12} />미리보기</button>
            <button
              className={tableButton}
              disabled={!mayWrite || busy || connector.status === 'ARCHIVED'}
              onClick={() => { void activate(connector) }}
              title={!mayWrite ? WRITE_DENIED
                : connector.status === 'ARCHIVED' ? '보관된 버전은 활성화할 수 없습니다.'
                  : connector.status === 'ACTIVE' ? '이미 활성입니다.'
                    : '다음 빌드가 이 자료원을 쓰게 합니다.'}
            ><Icon name="check" size={12} />활성화</button>
            {/* 활성 버전에만 단다. 백엔드가 ACTIVE가 아닌 커넥터 버전으로는 빌드를 거절한다
                (`ProductJobStore.createKnowledgeBuild` → 409 `CONNECTOR_VERSION_NOT_ACTIVE`).
                눌러서 409를 받는 대신 누를 수 없게 둔다. */}
            {onFirstBuild && connector.status === 'ACTIVE' && <button
              className={tableButton}
              disabled={busy}
              onClick={() => onFirstBuild(connector)}
              title="이 커넥터로 이 지식 베이스의 첫 지식 버전을 만듭니다 (8분대)."
            ><Icon name="play" size={12} />첫 빌드</button>}
          </span>
        </div>
        {preview?.connectorId === connector.connectorId && <PreviewResult result={preview.result} />}
      </div>)}
    </div>
  </section>
}

/**
 * 미리보기 결과. **건수와 문서를 함께 보인다** — 건수만 보이면 매핑이 틀려 제목이 비어도
 * 성공으로 읽힌다.
 *
 * <p>⚠️ **`totalCount`를 "원천 전체 건수"로 쓰지 않는다.** 실제 원천에서는 이번에 받아온
 * 건수와 같다 — 전체를 세려면 페이지를 끝까지 돌아야 해서 미리보기가 하지 않는다
 * (`ConnectorStore.previewConnector`). 픽스처에서만 진짜 전체 건수라, 응답만 보고는 어느
 * 쪽인지 구분할 수 없다. 그래서 **받아온 건수와 「더 있음」만 말한다** — 두 경우 모두 참인 표현이다.
 */
function PreviewResult({ result }: { result: ConnectorPreview }) {
  return <div className="mt-[0.625rem] rounded-[0.3125rem] border border-line-soft bg-sub p-[0.6875rem]">
    <p className="m-0 text-[0.71875rem] text-muted-2">
      표본 {result.itemCount}건{result.truncated && ' · 더 있음'}
      {' · '}{new Date(result.checkedAt).toLocaleString('ko-KR')}
    </p>
    <p className="m-0 mt-[0.1875rem] text-[0.65625rem] text-muted-3">
      미리보기는 별도 한도({PREVIEW_MAX_ITEMS}건)로만 조회하며, 표시 건수는 원천 전체가 아닙니다.
    </p>
    {result.documents.length === 0 && <p className="m-0 mt-2 text-[0.71875rem] text-muted-3">
      응답은 왔지만 매핑된 문서가 0건입니다. itemsPath를 확인하세요.
    </p>}
    <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
      {result.documents.map((document) => <li key={document.documentId} className="border-t border-line-soft pt-2 first:border-t-0 first:pt-0">
        <b className="block text-[0.71875rem] font-semibold text-ink">{document.title}</b>
        <p className="m-0 mt-[0.1875rem] text-[0.6875rem] leading-[1.6] text-muted-2">
          {document.content.slice(0, PREVIEW_CONTENT_CHARS)}{document.content.length > PREVIEW_CONTENT_CHARS && '…'}
        </p>
        <span className="mt-[0.1875rem] block font-mono text-[0.625rem] text-muted-3">
          {document.documentId}
          {document.category?.length ? ` · ${document.category.join(', ')}` : ''}
          {document.sourceUpdatedAt ? ` · ${new Date(document.sourceUpdatedAt).toLocaleDateString('ko-KR')}` : ''}
        </span>
      </li>)}
    </ul>
  </div>
}

/**
 * 등록 폼. **검증 규칙은 백엔드 `validateConnector`가 기준이고 화면은 안내만 한다** —
 * 같은 규칙을 두 곳에 적어 두면 서로 달라졌을 때 화면이 틀린 쪽이 된다. 네이티브
 * `required`·`pattern`으로 오타를 먼저 걸러 내고 최종 판정은 서버 응답을 그대로 보인다.
 */
function RegisterForm({ form, busy, onChange, onSubmit }: {
  form: ConnectorForm
  busy: boolean
  onChange: (next: ConnectorForm) => void
  onSubmit: () => void
}) {
  const set = <K extends keyof ConnectorForm>(key: K, value: ConnectorForm[K]) => onChange({ ...form, [key]: value })

  return <form
    className="flex flex-col gap-4 border-b border-line-soft px-4 py-[0.875rem]"
    onSubmit={(event) => { event.preventDefault(); onSubmit() }}
  >
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[0.6875rem] text-muted-3">기본값</span>
      {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((key) => <button
        key={key}
        type="button"
        className={noHover(smallButton)}
        onClick={() => onChange(PRESETS[key].form)}
        title={PRESETS[key].hint}
      >{PRESETS[key].label}</button>)}
    </div>

    <Callout tone="warn" icon="lock">
      API Key 값은 여기에 넣지 않습니다. 서버가 보관한 비밀의 <b>참조 문자열</b>만 적습니다.
      참조 방식은 원천과 짝이어야 합니다 — 픽스처는 <code className="font-mono">fixture://</code>,
      실제 원천은 <code className="font-mono">cms-secret://</code>입니다. 허용되지 않은 호스트는
      서버가 등록을 거절하며, 사유는 아래에 응답 문장 그대로 나옵니다.
    </Callout>

    <Group title="연결">
      <Text label="이름" value={form.name} onChange={(value) => set('name', value)}
        required pattern="[A-Z][A-Z0-9_]*" hint="대문자·숫자·밑줄. 예: SME_BIZINFO" />
      <Text label="baseUrl" value={form.baseUrl} onChange={(value) => set('baseUrl', value)}
        required pattern="https://[^/?#@]+(/[^?#]*)?" hint="HTTPS 원본과 선택적 경로. 질의·조각·계정 정보는 넣지 않습니다." />
      <Text label="endpoint" value={form.endpoint} onChange={(value) => set('endpoint', value)}
        required pattern="/[^/].*" hint="원본 기준 상대 경로. / 로 시작합니다." />
      <Read label="method" value="GET" hint="계약이 GET으로 고정합니다." />
    </Group>

    <Group title="인증">
      <Select label="위치" value={form.authLocation} onChange={(value) => set('authLocation', value as 'QUERY' | 'HEADER')}
        options={[['QUERY', '질의 문자열'], ['HEADER', '헤더']]} hint="공공데이터포털은 질의 문자열입니다." />
      <Text label="파라미터 이름" value={form.authName} onChange={(value) => set('authName', value)}
        required hint="예: serviceKey" />
      <Text label="secretRef" value={form.secretRef} onChange={(value) => set('secretRef', value)}
        required pattern={SECRET_REF_PATTERN}
        hint="키 값이 아니라 참조입니다. 실제 원천은 cms-secret://<이름>(소문자·숫자·하이픈), 픽스처는 fixture:// 입니다." />
    </Group>

    <Group title="응답 매핑">
      <Text label="itemsPath" value={form.itemsPath} onChange={(value) => set('itemsPath', value)}
        required pattern="\$.*" hint="문서 배열의 위치. 예: $.response.body.items.item" />
      <Text label="successCodePath (선택)" value={form.successCodePath} onChange={(value) => set('successCodePath', value)}
        pattern="\$.*" hint="예: $.response.header.resultCode" />
      <Text label="successValues (선택)" value={form.successValues} onChange={(value) => set('successValues', value)}
        hint="쉼표로 구분합니다. 예: 00" />
      <Text label="totalCountPath (선택)" value={form.totalCountPath} onChange={(value) => set('totalCountPath', value)}
        pattern="\$.*" hint="예: $.response.body.totalCount" />
    </Group>

    <Group title="페이지네이션">
      <Read label="방식" value="PAGE" hint="계약이 PAGE로 고정합니다." />
      <Text label="페이지 파라미터" value={form.pageParameter} onChange={(value) => set('pageParameter', value)} required hint="예: pageNo" />
      <Text label="건수 파라미터" value={form.pageSizeParameter} onChange={(value) => set('pageSizeParameter', value)} required hint="예: numOfRows" />
      <Text label="시작 페이지" value={form.startPage} onChange={(value) => set('startPage', value)} required type="number" min="0" />
      <Text label="페이지 크기" value={form.pageSize} onChange={(value) => set('pageSize', value)} required type="number" min="1" max="1000" />
    </Group>

    <Group title="문서 매핑">
      <Text label="documentId" value={form.documentId} onChange={(value) => set('documentId', value)} required pattern="\$.*" hint="예: $.pblancId" />
      <Text label="title" value={form.title} onChange={(value) => set('title', value)} required pattern="\$.*" hint="예: $.pblancNm" />
      <Text label="content" value={form.content} onChange={(value) => set('content', value)} required pattern="\$.*" hint="예: $.bsnsSumryCn" />
      <Text label="category (선택)" value={form.category} onChange={(value) => set('category', value)} pattern="\$.*" />
      <Text label="sourceUpdatedAt (선택)" value={form.sourceUpdatedAt} onChange={(value) => set('sourceUpdatedAt', value)} pattern="\$.*" />
      <Text label="sourceUrl (선택)" value={form.sourceUrl} onChange={(value) => set('sourceUrl', value)} pattern="\$.*" />
    </Group>

    <label className="block">
      <span className={fieldLabel}>metadata (선택)</span>
      <textarea
        className={textarea}
        rows={6}
        value={form.metadata}
        onChange={(event) => set('metadata', event.target.value)}
        placeholder="신청기간=$.reqstBeginEndDe"
      />
      {/* 키가 곧 화면 라벨이고 적은 순서가 표시 순서다 — 이 규칙을 모르면 라벨이 영문 필드명으로 나간다. */}
      <small className="mt-[0.25rem] block text-[0.65625rem] text-muted-3">
        한 줄에 <code className="font-mono">라벨=$.경로</code> 하나. <b>적은 순서가 표시 순서</b>이고 라벨이 그대로 화면에 나옵니다.
      </small>
    </label>

    <details>
      <summary className="cursor-pointer text-[0.6875rem] text-muted-3">요청 파라미터 (선택 · {form.requestParameters.length}건)</summary>
      <div className="mt-2 flex flex-col gap-2">
        {form.requestParameters.map((row, index) => <div key={index} className="flex flex-wrap items-center gap-2">
          <input
            className={`${control} mt-0 w-[10rem]`}
            value={row.name}
            placeholder="이름"
            onChange={(event) => set('requestParameters', form.requestParameters.map((item, at) => at === index ? { ...item, name: event.target.value } : item))}
          />
          <select
            className={`${control} mt-0 w-[8rem]`}
            value={row.type}
            onChange={(event) => set('requestParameters', form.requestParameters.map((item, at) => at === index ? { ...item, type: event.target.value as ConnectorParameterType } : item))}
          >
            {(['STRING', 'INTEGER', 'NUMBER', 'BOOLEAN'] as const).map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <label className="flex items-center gap-1 text-[0.6875rem] text-muted-3">
            <input
              type="checkbox"
              checked={row.required}
              onChange={(event) => set('requestParameters', form.requestParameters.map((item, at) => at === index ? { ...item, required: event.target.checked } : item))}
            />필수
          </label>
          <button
            type="button"
            className={noHover(smallButton)}
            onClick={() => set('requestParameters', form.requestParameters.filter((_, at) => at !== index))}
          >삭제</button>
        </div>)}
        <button
          type="button"
          className={noHover(smallButton)}
          onClick={() => set('requestParameters', [...form.requestParameters, { name: '', type: 'STRING', required: false }])}
        >파라미터 추가</button>
      </div>
    </details>

    <div>
      {/* 만들어지는 것은 DRAFT 버전이다. "등록"이라고 쓰면 이미 쓰이는 것처럼 읽힌다 —
          실제로 자료원이 되는 시점은 활성화이고, 그 전까지는 되돌릴 것도 없다. */}
      <button className={tableButton} type="submit" disabled={busy}>
        {busy ? '저장 중…' : '초안 저장'}
      </button>
    </div>
  </form>
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset className="m-0 border-0 p-0">
    <legend className="mb-2 p-0 text-[0.71875rem] font-semibold text-muted-2">{title}</legend>
    <div className="grid gap-3 sm:grid-cols-2">{children}</div>
  </fieldset>
}

function Text({ label, value, onChange, hint, ...rest }: {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return <label className="block">
    <span className={fieldLabel}>{label}</span>
    <input className={control} value={value} onChange={(event) => onChange(event.target.value)} {...rest} />
    {hint && <small className="mt-[0.25rem] block text-[0.65625rem] text-muted-3">{hint}</small>}
  </label>
}

function Select({ label, value, onChange, options, hint }: {
  label: string
  value: string
  onChange: (value: string) => void
  options: [string, string][]
  hint?: string
}) {
  return <label className="block">
    <span className={fieldLabel}>{label}</span>
    <select className={control} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
    </select>
    {hint && <small className="mt-[0.25rem] block text-[0.65625rem] text-muted-3">{hint}</small>}
  </label>
}

/** 계약이 고정한 값. 고를 수 없는 것을 고를 수 있는 것처럼 그리지 않는다. */
function Read({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="block">
    <span className={fieldLabel}>{label}</span>
    <output className={`${control} leading-8 text-muted-2`}>{value}</output>
    <small className="mt-[0.25rem] block text-[0.65625rem] text-muted-3">{hint}</small>
  </div>
}

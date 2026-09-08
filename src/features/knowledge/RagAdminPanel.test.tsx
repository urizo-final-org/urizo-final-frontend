import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import type { KnowledgeAdminApi } from './admin-api'
import type { KnowledgeVersion } from './admin-types'
import { RagAdminPanel } from './RagAdminPanel'

function version(overrides: Partial<KnowledgeVersion> = {}): KnowledgeVersion {
  return {
    knowledgeVersionId: `kv-${overrides.versionNumber ?? 8}`, knowledgeBaseId: 'kb-1',
    connectorVersionId: 'cv-1', versionNumber: 8, status: 'ACTIVE',
    documentCount: 500, chunkCount: 500, createdAt: '2026-08-31T03:00:00.000Z',
    activatedAt: '2026-08-31T03:04:00.000Z', label: 'post-repair rebuild 0831', ...overrides,
  }
}

const project = { projectId: 'p-1', name: '관광 프로젝트', status: 'ACTIVE' }
const base = { knowledgeBaseId: 'kb-1', projectId: 'p-1', name: '관광 지식 베이스', activeVersionId: 'kv-8' }

/** useSearchParams가 라우터 컨텍스트를 요구한다. 선택 상태를 URL에 두기 때문이다. */
function show(ui: React.ReactElement, entry = '/admin/rag') {
  return render(<MemoryRouter initialEntries={[entry]}>{ui}</MemoryRouter>)
}

function api(overrides: Partial<Record<keyof KnowledgeAdminApi, unknown>> = {}) {
  return {
    resolveTarget: vi.fn().mockResolvedValue({
      kind: 'ready', projectId: 'p-1', knowledgeBaseId: 'kb-1', name: '관광 지식 베이스',
      projects: [project], project, bases: [base],
    }),
    listVersions: vi.fn().mockResolvedValue({ items: [version()] }),
    getJob: vi.fn(),
    ...overrides,
  } as unknown as KnowledgeAdminApi
}

test('a summary reads the active version from the versions call', async () => {
  show(<RagAdminPanel api={api()} role="SUPER_ADMIN" />)
  const heading = await screen.findByText('관광 지식 베이스')
  // v8은 요약과 버전 표 양쪽에 나오므로 요약 섹션으로 좁혀 단언한다.
  const summary = within(heading.closest('section') as HTMLElement)
  expect(summary.getByText('활성 버전')).toBeInTheDocument()
  expect(summary.getByText('v8')).toBeInTheDocument()
  // 문서·청크는 목업이던 고정 문자열이 아니라 응답에서 온다.
  expect(summary.getAllByText('500')).toHaveLength(2)
})

test('a general admin sees the screen but every write button is already disabled', async () => {
  show(<RagAdminPanel api={api()} role="GENERAL_ADMIN" />)
  await screen.findByText('관광 지식 베이스')
  // 눌러서 403을 받는 게 아니라 세션 역할로 미리 판별한다. 403은 방어선이지 UI가 아니다.
  expect(screen.getByRole('button', { name: 'Build 시작' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '이전 활성 버전으로 롤백' })).toBeDisabled()
  expect(screen.getByText(/SUPER_ADMIN 권한이 필요합니다/)).toBeInTheDocument()
})

test('entering the screen starts polling only when a build is already running', async () => {
  const idle = api()
  show(<RagAdminPanel api={idle} role="SUPER_ADMIN" />)
  await screen.findByText('관광 지식 베이스')
  // 설계 §5 정책 — 빌드가 없으면 폴링하지 않는다. job 조회가 한 번도 일어나면 안 된다.
  expect(idle.getJob).not.toHaveBeenCalled()
  expect(screen.queryByText(/지식 빌드 진행 중/)).not.toBeInTheDocument()
})

test('a reload during a build recovers the progress panel from the versions call', async () => {
  // 8분 빌드 도중 새로고침이 한 번만 나도 jobId가 메모리에서 사라진다. 진입 시 versions
  // 1회 조회로 진행 중 버전을 찾아 복구한다 — 추가 API 호출 없이.
  const running = api({
    listVersions: vi.fn().mockResolvedValue({
      items: [version({ versionNumber: 10, status: 'BUILDING', buildJobId: 'job-1', activatedAt: undefined }), version()],
    }),
    getJob: vi.fn().mockResolvedValue({ progress: { phase: 'CHUNK', percent: 45 } }),
  })
  show(<RagAdminPanel api={running} role="SUPER_ADMIN" />)
  expect(await screen.findByText(/지식 빌드 진행 중/)).toBeInTheDocument()
  await waitFor(() => expect(running.getJob).toHaveBeenCalledWith('job-1'))
})

test('the progress panel never shows a percent bar or a processed count', async () => {
  const running = api({
    listVersions: vi.fn().mockResolvedValue({
      items: [version({ versionNumber: 10, status: 'BUILDING', buildJobId: 'job-1', activatedAt: undefined })],
    }),
    getJob: vi.fn().mockResolvedValue({ progress: { phase: 'CHUNK', percent: 45, targetCount: 500, successCount: 500 } }),
  })
  show(<RagAdminPanel api={running} role="SUPER_ADMIN" />)
  await screen.findByText(/지식 빌드 진행 중/)
  // 9/6 실측: CHUNK 45%에서 8분 36초 정지, successCount는 500/500으로 얼어붙었다.
  // 둘 다 화면에 나오면 사용자가 "멈췄다"로 읽는다.
  await waitFor(() => expect(running.getJob).toHaveBeenCalled())
  expect(screen.queryByText(/45%/)).not.toBeInTheDocument()
  expect(screen.queryByText(/500 ?\/ ?500건/)).not.toBeInTheDocument()
})

test('several knowledge bases offer a choice instead of picking one', async () => {
  const bases = [base, { ...base, knowledgeBaseId: 'kb-2', name: '다른 지식 베이스' }]
  show(<RagAdminPanel api={api({ resolveTarget: vi.fn().mockResolvedValue({ kind: 'choose', what: 'knowledgeBase', projects: [project], project, bases }) })} role="SUPER_ADMIN" />)
  // 첫 번째를 조용히 고르면 잘못된 지식 베이스를 보고도 모른다. 사람이 고르게 한다.
  const field = await screen.findByLabelText('지식 베이스')
  expect(within(field).getAllByRole('option').map((o) => o.textContent)).toContain('다른 지식 베이스')
  expect(screen.getByText(/자동으로 고르지 않습니다/)).toBeInTheDocument()
})

test('choosing a project puts it in the url and drops the stale knowledge base', async () => {
  const projects = [project, { ...project, projectId: 'p-2', name: '다른 프로젝트' }]
  const resolveTarget = vi.fn().mockResolvedValue({ kind: 'choose', what: 'project', projects })
  show(<RagAdminPanel api={api({ resolveTarget })} role="SUPER_ADMIN" />, '/admin/rag?projectId=p-1&knowledgeBaseId=kb-1')

  fireEvent.change(await screen.findByLabelText('프로젝트'), { target: { value: 'p-2' } })
  // 프로젝트를 바꾸면 하위 선택은 버린다 — 다른 프로젝트의 kb id가 남으면 목록에 없어
  // 무시되고, 남아 있는 것만으로 헷갈린다.
  await waitFor(() => expect(resolveTarget).toHaveBeenLastCalledWith({ projectId: 'p-2', knowledgeBaseId: undefined }))
})

test('a url selection survives a reload', async () => {
  const resolveTarget = vi.fn().mockResolvedValue({
    kind: 'ready', projectId: 'p-2', knowledgeBaseId: 'kb-2', name: '다른 지식 베이스',
    projects: [project], project, bases: [base],
  })
  show(<RagAdminPanel api={api({ resolveTarget })} role="SUPER_ADMIN" />, '/admin/rag?projectId=p-2&knowledgeBaseId=kb-2')
  // 선택을 URL에 두는 이유다. 새로고침해도 같은 대상을 본다.
  await waitFor(() => expect(resolveTarget).toHaveBeenCalledWith({ projectId: 'p-2', knowledgeBaseId: 'kb-2' }))
})

test('a cold start says the knowledge base is missing', async () => {
  show(<RagAdminPanel api={api({ resolveTarget: vi.fn().mockResolvedValue({ kind: 'empty', what: 'knowledgeBase', projects: [project], project }) })} role="SUPER_ADMIN" />)
  expect(await screen.findByText(/지식 베이스가 없습니다/)).toBeInTheDocument()
})

test('the quality panel labels its source and leaves Faithfulness out', async () => {
  show(<RagAdminPanel api={api()} role="SUPER_ADMIN" />)
  const metrics = within(await screen.findByText('품질 지표').then((node) => node.closest('section') as HTMLElement))
  // 계약에 지표가 없다. 실시간으로 보이면 안 되고 출처가 붙어야 한다.
  expect(metrics.getByText(/2026-08-29 측정 · 252 TC/)).toBeInTheDocument()
  expect(metrics.getByText('0.975')).toBeInTheDocument()
  // 97/246건에 12개 카테고리가 0건이라 모집단 추정치로 쓸 수 없다.
  expect(metrics.queryByText(/0\.9734/)).not.toBeInTheDocument()
  expect(metrics.getByText(/Faithfulness는 표본이 모집단을 대표하지 못해/)).toBeInTheDocument()
})

test('StrictMode double mount still fills the screen', async () => {
  // 9/6 실화: 언마운트 정리에서 alive ref를 false로만 두고 마운트에서 되살리지 않아,
  // StrictMode의 mount → unmount → mount 뒤 모든 setState가 막혀 화면이 "조회 중…"에서
  // 영원히 멈췄다. 단위 테스트는 통과하는데 브라우저에서만 죽는 종류라 여기에 고정한다.
  show(<StrictMode><RagAdminPanel api={api()} role="SUPER_ADMIN" /></StrictMode>)
  expect(await screen.findByText('관광 지식 베이스')).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByText('조회 중…')).not.toBeInTheDocument())
})

test('a blocked target says so instead of waiting forever', async () => {
  const projects = [project, { ...project, projectId: 'p-2', name: '다른 프로젝트' }]
  show(<RagAdminPanel api={api({ resolveTarget: vi.fn().mockResolvedValue({ kind: 'choose', what: 'project', projects }) })} role="SUPER_ADMIN" />)
  await screen.findByLabelText('프로젝트')
  // 대상이 없으면 버전을 부를 수 없다. 기다리는 것처럼 두면 사용자가 원인을 위쪽 안내가
  // 아니라 네트워크에서 찾게 된다.
  expect(screen.getByText(/위 안내를 해결해야 버전을 불러올 수 있습니다/)).toBeInTheDocument()
  expect(screen.queryByText('조회 중…')).not.toBeInTheDocument()
})

/**
 * 상태마다 다른 엔드포인트를 부른다. 이 분기가 없으면 보관 버전에서 409
 * KNOWLEDGE_VERSION_NOT_APPROVABLE이 난다 — 9/7 실호출로 확인한 사고다.
 */
test('an archived version rolls back while an approval-pending one activates', async () => {
  const rollback = vi.fn().mockResolvedValue({})
  const activate = vi.fn().mockResolvedValue({})
  const calls = api({
    listVersions: vi.fn().mockResolvedValue({
      items: [
        version({ versionNumber: 11, status: 'ARCHIVED', knowledgeVersionId: 'kv-11' }),
        version({ versionNumber: 10, status: 'APPROVAL_PENDING', knowledgeVersionId: 'kv-10', activatedAt: undefined }),
        version(),
      ],
    }),
    rollback, activate,
  })
  show(<RagAdminPanel api={calls} role="SUPER_ADMIN" />)

  fireEvent.click(await screen.findByTitle('포털이 v11 기준으로 답하게 합니다.'))
  fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
  await waitFor(() => expect(rollback).toHaveBeenCalledWith('kb-1', 'kv-11'))
  expect(activate).not.toHaveBeenCalled()

  fireEvent.click(await screen.findByTitle('포털이 v10 기준으로 답하게 합니다.'))
  fireEvent.click(screen.getByRole('button', { name: '활성화 (승인)' }))
  await waitFor(() => expect(activate).toHaveBeenCalledWith('kv-10'))
})

test('a failed build cannot be activated — it would make the chatbot see an empty knowledge', async () => {
  const rollback = vi.fn()
  const calls = api({
    listVersions: vi.fn().mockResolvedValue({
      items: [version({ versionNumber: 4, status: 'FAILED', documentCount: 0, chunkCount: 0, activatedAt: undefined }), version()],
    }),
    rollback,
  })
  show(<RagAdminPanel api={calls} role="SUPER_ADMIN" />)

  const denied = await screen.findByTitle('실패한 빌드는 활성화할 수 없습니다.')
  expect(denied).toBeDisabled()
  fireEvent.click(denied)
  expect(rollback).not.toHaveBeenCalled()
})

test('the confirmation shows the document count before a switch — an empty version activates silently otherwise', async () => {
  show(<RagAdminPanel api={api({
    listVersions: vi.fn().mockResolvedValue({
      items: [version({ versionNumber: 11, status: 'ARCHIVED', knowledgeVersionId: 'kv-11', documentCount: 500, chunkCount: 500 }), version()],
    }),
    rollback: vi.fn().mockResolvedValue({}),
  })} role="SUPER_ADMIN" />)

  fireEvent.click(await screen.findByTitle('포털이 v11 기준으로 답하게 합니다.'))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText('문서 500 · 청크 500')).toBeInTheDocument()
  expect(within(dialog).getByText(/포털 검색·챗봇이 즉시 v11 기준으로 답합니다/)).toBeInTheDocument()
})

test('cancelling the confirmation calls nothing', async () => {
  const rollback = vi.fn()
  show(<RagAdminPanel api={api({
    listVersions: vi.fn().mockResolvedValue({
      items: [version({ versionNumber: 11, status: 'ARCHIVED', knowledgeVersionId: 'kv-11' }), version()],
    }),
    rollback,
  })} role="SUPER_ADMIN" />)

  fireEvent.click(await screen.findByTitle('포털이 v11 기준으로 답하게 합니다.'))
  fireEvent.click(screen.getByRole('button', { name: '취소' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(rollback).not.toHaveBeenCalled()
})

test('the top rollback targets the most recently activated archived version', async () => {
  const rollback = vi.fn().mockResolvedValue({})
  show(<RagAdminPanel api={api({
    listVersions: vi.fn().mockResolvedValue({
      items: [
        version({ versionNumber: 11, status: 'ACTIVE', knowledgeVersionId: 'kv-11', activatedAt: '2026-09-07T02:00:00.000Z' }),
        version({ versionNumber: 9, status: 'ARCHIVED', knowledgeVersionId: 'kv-9', activatedAt: '2026-09-01T00:00:00.000Z' }),
        version({ versionNumber: 8, status: 'ARCHIVED', knowledgeVersionId: 'kv-8', activatedAt: '2026-09-06T12:00:00.000Z' }),
      ],
    }),
    rollback,
  })} role="SUPER_ADMIN" />)

  fireEvent.click(await screen.findByTitle('마지막으로 활성화됐던 버전으로 되돌립니다.'))
  fireEvent.click(screen.getByRole('button', { name: '롤백' }))
  // v9가 아니라 v8이다 — 버전 번호가 아니라 마지막 활성화 시각으로 고른다.
  await waitFor(() => expect(rollback).toHaveBeenCalledWith('kb-1', 'kv-8'))
})

test('a build reuses the newest version connector and warns it will not auto-activate', async () => {
  const startBuild = vi.fn().mockResolvedValue({})
  show(<RagAdminPanel api={api({
    listVersions: vi.fn().mockResolvedValue({ items: [version({ connectorVersionId: 'cv-9' })] }),
    startBuild,
  })} role="SUPER_ADMIN" />)

  fireEvent.click(await screen.findByRole('button', { name: 'Build 시작' }))
  expect(screen.getByText(/자동 활성화되지 않고 승인 대기 상태로 멈춥니다/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '빌드 시작' }))
  await waitFor(() => expect(startBuild).toHaveBeenCalledWith('kb-1', 'cv-9', expect.any(String)))
})

test('a general admin sees every write disabled and can open no dialog', async () => {
  const rollback = vi.fn()
  show(<RagAdminPanel api={api({
    listVersions: vi.fn().mockResolvedValue({
      items: [version({ versionNumber: 11, status: 'ARCHIVED', knowledgeVersionId: 'kv-11' }), version()],
    }),
    rollback,
  })} role="GENERAL_ADMIN" />)

  // 쓰기 버튼 전부가 같은 안내를 단다 — 롤백 · 버전별 활성화 · Build 시작
  const denied = await screen.findAllByTitle('SUPER_ADMIN 권한이 필요합니다. 최고 관리자에게 요청하세요.')
  expect(denied.length).toBeGreaterThan(1)
  denied.forEach((button) => expect(button).toBeDisabled())
  expect(screen.getByRole('button', { name: 'Build 시작' })).toBeDisabled()
  fireEvent.click(denied[0])
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(rollback).not.toHaveBeenCalled()
})

test('a failing switch surfaces the error and leaves the table refreshed', async () => {
  const listVersions = vi.fn().mockResolvedValue({
    items: [version({ versionNumber: 11, status: 'ARCHIVED', knowledgeVersionId: 'kv-11' }), version()],
  })
  show(<RagAdminPanel api={api({
    listVersions,
    rollback: vi.fn().mockRejectedValue(new Error('boom')),
  })} role="SUPER_ADMIN" />)

  fireEvent.click(await screen.findByTitle('포털이 v11 기준으로 답하게 합니다.'))
  fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
  // 실패해도 창은 닫히고, 화면이 실제 상태와 어긋나지 않도록 목록을 다시 읽는다.
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(listVersions.mock.calls.length).toBeGreaterThan(1)
})

test('the metrics cell speaks in deltas, counts, a baseline badge and a source label — not raw scores', async () => {
  show(<RagAdminPanel api={api({
    listVersions: vi.fn().mockResolvedValue({
      items: [
        version({ versionNumber: 16, status: 'APPROVAL_PENDING', knowledgeVersionId: 'kv-16', activatedAt: undefined }),
        version({ versionNumber: 14, status: 'ARCHIVED', knowledgeVersionId: 'kv-14' }),
        version({ versionNumber: 12, knowledgeVersionId: 'kv-12' }),
      ],
    }),
  })} role="SUPER_ADMIN" />)
  const table = within((await screen.findByText('RAG 버전')).closest('section') as HTMLElement)

  // 활성 v12는 비교 기준이라 델타 대신 "기준"과 단일 건수(0.975 × 252 ≈ 246).
  expect(table.getByText('검색 정확도 기준')).toBeInTheDocument()
  expect(table.getByText('252문항 중 정답 포함 246건')).toBeInTheDocument()
  // 승인 대기 v16은 활성 대비 상승 — 원값 0.981이 아니라 %p 델타와 건수 환산으로 말한다.
  expect(table.getByText('검색 정확도 ▲ +0.6%p')).toBeInTheDocument()
  expect(table.getByText('252문항 중 정답 포함 246 → 247건')).toBeInTheDocument()
  // 보관 v14는 하락이고 기준선 미달 배지를 단다.
  expect(table.getByText('검색 정확도 ▼ -3.4%p')).toBeInTheDocument()
  expect(table.getByText('기준선 ≥0.95 미달')).toBeInTheDocument()
  expect(table.getAllByText('기준선 ≥0.95 통과')).toHaveLength(2)
  // 원값은 맨 아래 작게만 남는다.
  expect(table.getByText('R@5 0.981 · MRR 0.974')).toBeInTheDocument()
  // 출처 라벨은 숫자가 있는 셀 전부에 붙는다 — evaluate가 스텁(score=100 고정)이라
  // 이 라벨이 없으면 방금 잰 값처럼 보이는 거짓말이 된다.
  expect(table.getAllByText('오프라인 측정 · 8/29')).toHaveLength(3)
})

test('a version without an offline measurement says so instead of inventing numbers', async () => {
  show(<RagAdminPanel api={api({
    listVersions: vi.fn().mockResolvedValue({
      items: [
        // v14는 측정 상수에 키가 있지만 FAILED다 — 문서 0건 빌드에 측정값이 떠 있으면 거짓이다.
        version({ versionNumber: 14, status: 'FAILED', knowledgeVersionId: 'kv-14', documentCount: 0, chunkCount: 0, activatedAt: undefined }),
        version({ versionNumber: 15, status: 'FAILED', knowledgeVersionId: 'kv-15', documentCount: 0, chunkCount: 0, activatedAt: undefined }),
        version({ versionNumber: 12, knowledgeVersionId: 'kv-12' }),
      ],
    }),
  })} role="SUPER_ADMIN" />)
  const table = within((await screen.findByText('RAG 버전')).closest('section') as HTMLElement)
  expect(table.getAllByText('측정 전')).toHaveLength(2)
  // 미측정 셀에는 출처 라벨도 붙지 않는다 — 붙일 숫자가 없다.
  expect(table.getAllByText('오프라인 측정 · 8/29')).toHaveLength(1)
})

function ladder() {
  // 실제 로컬 상태와 같은 모양 — 활성이 중간에 있고(롤백 흔적) 실패 버전이 섞여 있다.
  return [
    version({ versionNumber: 11, status: 'ARCHIVED', knowledgeVersionId: 'kv-11' }),
    version({ versionNumber: 10, status: 'APPROVAL_PENDING', knowledgeVersionId: 'kv-10', activatedAt: undefined }),
    version({ versionNumber: 9, status: 'ARCHIVED', knowledgeVersionId: 'kv-9' }),
    version({ versionNumber: 8, status: 'ACTIVE', knowledgeVersionId: 'kv-8' }),
    version({ versionNumber: 4, status: 'FAILED', knowledgeVersionId: 'kv-4', documentCount: 0, chunkCount: 0, activatedAt: undefined }),
    version({ versionNumber: 3, status: 'FAILED', knowledgeVersionId: 'kv-3', documentCount: 0, chunkCount: 0, activatedAt: undefined }),
  ]
}

/** 11건이 한 번에 깔리면 지금 무엇을 봐야 하는지가 묻힌다. 지우지 않고 접는다. */
test('the table opens on the versions that matter and folds the rest away', async () => {
  show(<RagAdminPanel api={api({ listVersions: vi.fn().mockResolvedValue({ items: ladder() }) })} role="SUPER_ADMIN" />)

  // v8은 요약 카드에도 나오므로 버전 표 안으로 좁혀 단언한다.
  const table = within((await screen.findByText('RAG 버전')).closest('section') as HTMLElement)
  expect(table.getByText('v11')).toBeInTheDocument()
  expect(table.getByText('v10')).toBeInTheDocument()
  // 활성 버전은 최신 2건 밖에 있어도 항상 보인다 — 롤백하면 목록 중간으로 내려간다.
  expect(table.getByText('v8')).toBeInTheDocument()
  expect(table.queryByText('v9')).not.toBeInTheDocument()
  expect(table.queryByText('v4')).not.toBeInTheDocument()
  // 접었을 뿐 지운 것이 아니라는 사실을 숫자로 남긴다.
  expect(table.getByText('6건')).toBeInTheDocument()
  expect(table.getByRole('button', { name: '이전 버전 3건 더 보기' })).toBeInTheDocument()
})

test('the folded versions are still one click away', async () => {
  show(<RagAdminPanel api={api({ listVersions: vi.fn().mockResolvedValue({ items: ladder() }) })} role="SUPER_ADMIN" />)

  fireEvent.click(await screen.findByRole('button', { name: '이전 버전 3건 더 보기' }))
  // 실패한 빌드가 남아 있는 것이 "버전은 고치지 않고 새로 만든다"의 증거다.
  expect(screen.getByText('v4')).toBeInTheDocument()
  expect(screen.getByText('v3')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '접기' }))
  expect(screen.queryByText('v4')).not.toBeInTheDocument()
})

function building() {
  return api({
    listVersions: vi.fn().mockResolvedValue({
      items: [version({ versionNumber: 12, status: 'BUILDING', knowledgeVersionId: 'kv-12', buildJobId: 'job-1', createdAt: new Date(Date.now() - 8 * 60_000).toISOString(), activatedAt: undefined })],
    }),
    getJob: vi.fn().mockResolvedValue({ progress: { phase: 'CHUNK', percent: 45 } }),
  })
}

/**
 * 9/7 실화: 빌드가 끝났는데 화면이 「진행 중 · 8분 33초」로 얼어붙었다. 시계가 폴링
 * 안에만 있어서, 폴링이 멈추면 경과와 12분 정체 경고가 함께 멈췄다.
 */
test('the clock keeps moving even when every call fails', async () => {
  vi.useFakeTimers()
  try {
    const dead = api({
      listVersions: vi.fn()
        .mockResolvedValueOnce({
          items: [version({ versionNumber: 12, status: 'BUILDING', knowledgeVersionId: 'kv-12', createdAt: new Date(Date.now() - 8 * 60_000).toISOString(), activatedAt: undefined })],
        })
        .mockRejectedValue(new Error('network down')),
      getJob: vi.fn().mockRejectedValue(new Error('network down')),
    })
    show(<RagAdminPanel api={dead} role="SUPER_ADMIN" />)
    await vi.waitFor(() => expect(screen.getByText(/8분 \d+초 경과/)).toBeInTheDocument())

    // 호출이 전부 죽은 채로 5분을 흘린다. 시계가 폴링에 묶여 있으면 여기서 멈춘다.
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    // 12분을 넘겼으므로 진행 문구와 정체 경고 양쪽에 13분이 찍힌다.
    expect(screen.getAllByText(/13분 \d+초 경과/)).toHaveLength(2)
    // 정체 경고 자체도 떠야 한다 — 예전에는 이것도 시계와 함께 얼어붙었다.
    expect(screen.getByText(/응답이 정체됐습니다/, { selector: 'span' })).toBeInTheDocument()
  }
  finally {
    vi.useRealTimers()
  }
})

test('returning to the tab catches up at once instead of waiting for the next poll', async () => {
  const running = building()
  show(<RagAdminPanel api={running} role="SUPER_ADMIN" />)
  await screen.findByText(/지식 빌드 진행 중/)
  await waitFor(() => expect(running.getJob).toHaveBeenCalled())
  const before = (running.getJob as ReturnType<typeof vi.fn>).mock.calls.length

  // 브라우저가 얼렸다 푼 상황. 다음 폴링을 기다리면 최대 5초를 옛 화면으로 보낸다.
  Object.defineProperty(document, 'hidden', { value: false, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))

  await waitFor(() => expect((running.getJob as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(before))
})

test('a hidden tab does not trigger the catch-up', async () => {
  const running = building()
  show(<RagAdminPanel api={running} role="SUPER_ADMIN" />)
  await screen.findByText(/지식 빌드 진행 중/)
  await waitFor(() => expect(running.getJob).toHaveBeenCalled())
  const before = (running.getJob as ReturnType<typeof vi.fn>).mock.calls.length

  Object.defineProperty(document, 'hidden', { value: true, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
  expect((running.getJob as ReturnType<typeof vi.fn>).mock.calls.length).toBe(before)
  Object.defineProperty(document, 'hidden', { value: false, configurable: true })
})

/** 빌드가 없으면 시계도 돌지 않는다 — 진행 패널이 없는데 1초마다 렌더할 이유가 없다. */
test('an idle screen runs no clock', async () => {
  vi.useFakeTimers()
  try {
    show(<RagAdminPanel api={api()} role="SUPER_ADMIN" />)
    await vi.waitFor(() => expect(screen.getByText('관광 지식 베이스')).toBeInTheDocument())
    await vi.advanceTimersByTimeAsync(10_000)
    expect(screen.queryByText(/경과/)).not.toBeInTheDocument()
  }
  finally {
    vi.useRealTimers()
  }
})

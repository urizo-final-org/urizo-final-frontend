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
    listActivationRequests: vi.fn().mockResolvedValue({ items: [] }),
    listConnectors: vi.fn().mockResolvedValue({ items: [] }),
    getJob: vi.fn(),
    ...overrides,
  } as unknown as KnowledgeAdminApi
}

// 스케줄러가 남긴 변경 요약이 있으면 갱신 필요 콜아웃이 뜨고, 요청 패널로 안내한다(AI02-022).
test('a stored source change summary raises the refresh-needed callout', async () => {
  const changed = {
    ...base,
    sourceChangeSummary: {
      checkedAt: '2026-09-13T09:00:00.000Z', comparedVersion: 8,
      added: 3, modified: 5, missing: 1,
    },
  }
  show(<RagAdminPanel api={api({
    resolveTarget: vi.fn().mockResolvedValue({
      kind: 'ready', projectId: 'p-1', knowledgeBaseId: 'kb-1', name: '관광 지식 베이스',
      projects: [project], project, bases: [changed],
    }),
  })} role="GENERAL_ADMIN" />)

  expect(await screen.findByText(/원천 데이터 변경 감지/)).toBeInTheDocument()
  expect(screen.getByText(/신규 3 · 수정 5 · 소멸 1건/)).toBeInTheDocument()
  expect(screen.getByText(/RAG 갱신이 필요합니다/)).toBeInTheDocument()
})

// 0건 요약은 "점검했고 이상 없음"이다 — 알림으로 띄우면 늑대 소년이 된다.
test('an all-zero change summary raises nothing', async () => {
  const unchanged = {
    ...base,
    sourceChangeSummary: {
      checkedAt: '2026-09-13T09:00:00.000Z', comparedVersion: 8,
      added: 0, modified: 0, missing: 0,
    },
  }
  show(<RagAdminPanel api={api({
    resolveTarget: vi.fn().mockResolvedValue({
      kind: 'ready', projectId: 'p-1', knowledgeBaseId: 'kb-1', name: '관광 지식 베이스',
      projects: [project], project, bases: [unchanged],
    }),
  })} role="GENERAL_ADMIN" />)

  await screen.findByText('관광 지식 베이스')
  expect(screen.queryByText(/원천 데이터 변경 감지/)).not.toBeInTheDocument()
})

/**
 * 새 지식 베이스의 첫 빌드. `Build 시작`은 최신 버전의 커넥터를 재사용하는 구조라 버전이
 * 0개면 눌리지 않는다 — 갓 만든 고객사에서 첫 빌드를 시작할 길이 화면에 없었다.
 */
test('a knowledge base with no versions starts its first build from the connector', async () => {
  const startBuild = vi.fn().mockResolvedValue({ jobId: 'j-1', status: 'QUEUED', statusUrl: '/x' })
  const fresh = api({
    listVersions: vi.fn().mockResolvedValue({ items: [] }),
    listConnectors: vi.fn().mockResolvedValue({
      items: [{
        schemaVersion: '1.0', traceId: 't', projectId: 'p-1', connectorId: 'c-1',
        connectorVersionId: 'cv-7', name: 'SME_SUPPORT_ANNOUNCEMENT', status: 'ACTIVE',
        configDigest: `sha256:${'a'.repeat(64)}`, createdAt: '2026-09-12T03:00:00.000Z',
      }],
    }),
    startBuild,
  })
  show(<RagAdminPanel api={fresh} role="SUPER_ADMIN" />)

  // 기존 진입점은 여전히 꺼져 있다 — 재사용할 최신 버전이 없다.
  expect(await screen.findByRole('button', { name: '새 자료 만들기' })).toBeDisabled()

  fireEvent.click(await screen.findByRole('button', { name: /첫 빌드/ }))
  // 8분짜리 작업이라 확인창을 거친다. 커넥터 패널이 직접 시작하지 않는 이유다.
  fireEvent.click(await screen.findByRole('button', { name: '만들기 시작' }))
  await waitFor(() => expect(startBuild).toHaveBeenCalledWith('kb-1', 'cv-7', expect.stringContaining('first build')))
})

test('a knowledge base that already has versions keeps one build entry point', async () => {
  const used = api({
    listConnectors: vi.fn().mockResolvedValue({
      items: [{
        schemaVersion: '1.0', traceId: 't', projectId: 'p-1', connectorId: 'c-1',
        connectorVersionId: 'cv-7', name: 'SME_SUPPORT_ANNOUNCEMENT', status: 'ACTIVE',
        configDigest: `sha256:${'a'.repeat(64)}`, createdAt: '2026-09-12T03:00:00.000Z',
      }],
    }),
  })
  show(<RagAdminPanel api={used} role="SUPER_ADMIN" />)
  await screen.findByText('관광 지식 베이스')
  // 버전이 있으면 위 「Build 시작」이 그 일을 한다. 같은 동작의 버튼을 둘로 두지 않는다.
  expect(screen.queryByRole('button', { name: /첫 빌드/ })).not.toBeInTheDocument()
})

test('a summary reads the active version from the versions call', async () => {
  show(<RagAdminPanel api={api()} role="SUPER_ADMIN" />)
  const heading = await screen.findByText('관광 지식 베이스')
  // v8은 요약과 버전 표 양쪽에 나오므로 요약 섹션으로 좁혀 단언한다.
  const summary = within(heading.closest('section') as HTMLElement)
  expect(summary.getByText('활성 버전')).toBeInTheDocument()
  expect(summary.getByText('v8')).toBeInTheDocument()
  // 문서·청크는 목업이던 고정 문자열이 아니라 응답에서 온다.
  expect(summary.getByText('500건')).toBeInTheDocument()
  expect(summary.queryByText('청크')).not.toBeInTheDocument()
})

test('a general admin sees the screen but every write button is already disabled', async () => {
  show(<RagAdminPanel api={api()} role="GENERAL_ADMIN" />)
  await screen.findByText('관광 지식 베이스')
  // 눌러서 403을 받는 게 아니라 세션 역할로 미리 판별한다. 403은 방어선이지 UI가 아니다.
  expect(screen.getByRole('button', { name: '새 자료 만들기' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '이전 버전 롤백' })).toBeDisabled()
  expect(screen.getByText(/SUPER_ADMIN 권한이 필요합니다/)).toBeInTheDocument()
})

test('entering the screen starts polling only when a build is already running', async () => {
  const idle = api()
  show(<RagAdminPanel api={idle} role="SUPER_ADMIN" />)
  await screen.findByText('관광 지식 베이스')
  // 설계 §5 정책 — 빌드가 없으면 폴링하지 않는다. job 조회가 한 번도 일어나면 안 된다.
  expect(idle.getJob).not.toHaveBeenCalled()
  expect(screen.queryByText(/자료를 만들고 있습니다/)).not.toBeInTheDocument()
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
  expect(await screen.findByText(/자료를 만들고 있습니다/)).toBeInTheDocument()
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
  await screen.findByText(/자료를 만들고 있습니다/)
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

/**
 * 관광 fixture 기반 오프라인 스냅샷은 실수집 버전의 상태가 아니다(AI02-023). 패널째 지웠고,
 * 되살아나면 실수집 RAG 화면에 옛 측정치가 다시 섞인다.
 */
test('the offline quality snapshot panel is gone', async () => {
  show(<RagAdminPanel api={api()} role="SUPER_ADMIN" />)
  expect(await screen.findByText('RAG 버전')).toBeInTheDocument()
  expect(screen.queryByText('품질 지표')).not.toBeInTheDocument()
  expect(screen.queryByText('0.975')).not.toBeInTheDocument()
  expect(screen.queryByText(/2026-08-29 측정/)).not.toBeInTheDocument()
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
 * 승인 대기 버전은 표에서 바로 활성화한다. 보관 버전은 표에 없고(AI02-023) 되돌리기는
 * 목록 위 전용 버튼이 맡는다 — `switchPath`의 엔드포인트 분기 자체는 그대로 남아 있어,
 * 보관 행이 다시 보이게 되더라도 409 KNOWLEDGE_VERSION_NOT_APPROVABLE로 가지 않는다.
 */
test('an approval-pending version activates from the table', async () => {
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

  fireEvent.click(await screen.findByTitle('포털이 v10 기준으로 답하게 합니다.'))
  fireEvent.click(screen.getByRole('button', { name: '활성화 (승인)' }))
  await waitFor(() => expect(activate).toHaveBeenCalledWith('kv-10'))
  expect(rollback).not.toHaveBeenCalled()
  // 보관 버전은 행이 없으므로 표에서 되돌릴 수 없다 — 전용 버튼이 그 자리다.
  expect(screen.queryByTitle('포털이 v11 기준으로 답하게 합니다.')).not.toBeInTheDocument()
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

  const denied = await screen.findByTitle('실패한 자료는 활성화할 수 없습니다.')
  expect(denied).toBeDisabled()
  fireEvent.click(denied)
  expect(rollback).not.toHaveBeenCalled()
})

// 빌드가 잰 값이 있으면 그것을 쓴다. 정적 스냅샷은 관광 한 도메인의 과거 측정치라
// 다른 고객사 화면에 보이면 잘못된 신뢰를 만든다.
test('a version shows the evaluation its own build measured', async () => {
  show(<RagAdminPanel api={api({
    listVersions: vi.fn().mockResolvedValue({
      items: [version({
        versionNumber: 3, knowledgeVersionId: 'kv-3', activatedAt: undefined,
        status: 'APPROVAL_PENDING',
        evaluation: { method: 'TITLE_SELF_RETRIEVAL', sampleSize: 50, hit5: 0.94, hit10: 0.98, mrr10: 0.882 },
      })],
    }),
  })} role="SUPER_ADMIN" />)

  // 표에는 값 하나만 둔다. 세부 수치는 셀 툴팁으로 미룬다(AI02-023).
  expect(await screen.findByText('색인 검색 94%')).toBeInTheDocument()
  // 무엇을 잰 것인지가 화면에 남아야 한다 — 시험지로 읽히면 안 된다.
  const cell = screen.getByTitle(/사용자 질문 기반 시험지가 아닙니다/)
  expect(cell.title).toMatch(/Hit@5 0\.940 · Hit@10 0\.980 · MRR 0\.882/)
})

// 골든 점수는 같은 세트 버전끼리만 비교가 성립한다. 표는 값 하나만 보이고, 세트 버전과
// 동결된 제외는 툴팁이 든다 — 없어지면 "몇 문항짜리 시험이었는지"를 알 길이 사라진다.
test('a golden evaluation keeps its set version and frozen exclusions in the tooltip', async () => {
  show(<RagAdminPanel api={api({
    listVersions: vi.fn().mockResolvedValue({
      items: [version({
        versionNumber: 4, knowledgeVersionId: 'kv-4', activatedAt: undefined,
        status: 'APPROVAL_PENDING',
        evaluation: {
          method: 'GOLDEN_QUESTION', sampleSize: 47, hit5: 0.787, hit10: 0.872, mrr10: 0.703,
          setVersion: 1, excluded: [{ id: 'q07', reason: 'DOCUMENT_MISSING' }], modifiedCount: 2,
        },
      })],
    }),
  })} role="SUPER_ADMIN" />)

  expect(await screen.findByText('Golden 79%')).toBeInTheDocument()
  const cell = screen.getByTitle(/같은 세트 버전끼리만 비교하세요/)
  expect(cell.title).toMatch(/세트 v1 · 문항 47/)
  expect(cell.title).toMatch(/제외된 문항 1건/)
})

// 청킹 규칙은 구현 정보다(AI02-024). 청크 수 칸을 지운 뒤로 "왜 청크 수가 다른가"라는
// 질문 자체가 화면에서 사라져, 그 답만 남아 있을 이유가 없다.
test('the chunking rule never reaches the screen', async () => {
  show(<RagAdminPanel api={api({
    listVersions: vi.fn().mockResolvedValue({
      items: [
        version({
          versionNumber: 3, knowledgeVersionId: 'kv-3', chunkCount: 1247, activatedAt: undefined,
          status: 'APPROVAL_PENDING',
          chunkingStrategy: { maxCharacters: 900, overlapCharacters: 120, reason: '공고 본문이 짧아 문단 단위로 충분합니다.' },
        }),
        version({
          versionNumber: 5, knowledgeVersionId: 'kv-5', activatedAt: undefined, status: 'APPROVAL_PENDING',
          chunkingStrategy: { maxCharacters: 0, overlapCharacters: 0, reason: '문서 전체를 한 청크로 둔다(LLM 전략 없음).' },
        }),
      ],
    }),
  })} role="SUPER_ADMIN" />)
  await screen.findByText('RAG 버전')

  // 서버는 여전히 규칙을 내려준다 — 화면이 그리지 않을 뿐이다.
  expect(screen.queryByText(/LLM 900자/)).not.toBeInTheDocument()
  expect(screen.queryByText('문서당 1청크')).not.toBeInTheDocument()
  expect(screen.queryByText(/청크/)).not.toBeInTheDocument()
})

test('the confirmation shows the document count before a switch — an empty version activates silently otherwise', async () => {
  show(<RagAdminPanel api={api({
    listVersions: vi.fn().mockResolvedValue({
      items: [version({ versionNumber: 11, status: 'APPROVAL_PENDING', knowledgeVersionId: 'kv-11', documentCount: 500, chunkCount: 500, activatedAt: undefined }), version()],
    }),
    activate: vi.fn().mockResolvedValue({}),
  })} role="SUPER_ADMIN" />)

  fireEvent.click(await screen.findByTitle('포털이 v11 기준으로 답하게 합니다.'))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText('문서 500건')).toBeInTheDocument()
  expect(within(dialog).getByText(/포털 검색·챗봇이 즉시 v11 기준으로 답합니다/)).toBeInTheDocument()
})

test('cancelling the confirmation calls nothing', async () => {
  const activate = vi.fn()
  show(<RagAdminPanel api={api({
    listVersions: vi.fn().mockResolvedValue({
      items: [version({ versionNumber: 11, status: 'APPROVAL_PENDING', knowledgeVersionId: 'kv-11', activatedAt: undefined }), version()],
    }),
    activate,
  })} role="SUPER_ADMIN" />)

  fireEvent.click(await screen.findByTitle('포털이 v11 기준으로 답하게 합니다.'))
  fireEvent.click(screen.getByRole('button', { name: '취소' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(activate).not.toHaveBeenCalled()
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

  fireEvent.click(await screen.findByRole('button', { name: '새 자료 만들기' }))
  expect(screen.getByText(/자동 활성화되지 않고 승인 대기 상태로 멈춥니다/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '만들기 시작' }))
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
  expect(screen.getByRole('button', { name: '새 자료 만들기' })).toBeDisabled()
  fireEvent.click(denied[0])
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(rollback).not.toHaveBeenCalled()
})

test('a failing switch surfaces the error and leaves the table refreshed', async () => {
  const listVersions = vi.fn().mockResolvedValue({
    items: [version({ versionNumber: 11, status: 'APPROVAL_PENDING', knowledgeVersionId: 'kv-11', activatedAt: undefined }), version()],
  })
  show(<RagAdminPanel api={api({
    listVersions,
    activate: vi.fn().mockRejectedValue(new Error('boom')),
  })} role="SUPER_ADMIN" />)

  fireEvent.click(await screen.findByTitle('포털이 v11 기준으로 답하게 합니다.'))
  fireEvent.click(screen.getByRole('button', { name: '활성화 (승인)' }))
  // 실패해도 창은 닫히고, 화면이 실제 상태와 어긋나지 않도록 목록을 다시 읽는다.
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(listVersions.mock.calls.length).toBeGreaterThan(1)
})

/**
 * 관광 fixture 오프라인 스냅샷은 통째로 사라졌다(AI02-023). 서버가 잰 값이 없는 버전은
 * 하드코딩된 과거 수치가 아니라 "측정 전"이다 — 되살아나면 다른 고객사 화면에 관광 수치가
 * 다시 붙는다.
 */
test('a version without a server measurement says so instead of borrowing old numbers', async () => {
  show(<RagAdminPanel api={api({
    listVersions: vi.fn().mockResolvedValue({
      items: [
        version({ versionNumber: 18, status: 'APPROVAL_PENDING', knowledgeVersionId: 'another-db-v18', activatedAt: undefined }),
        version({ versionNumber: 12, knowledgeVersionId: 'another-db-v12' }),
      ],
    }),
  })} role="SUPER_ADMIN" />)
  const table = within((await screen.findByText('RAG 버전')).closest('section') as HTMLElement)

  expect(table.getAllByText('측정 전')).toHaveLength(2)
  expect(table.queryByText(/검색 정확도/)).not.toBeInTheDocument()
  expect(table.queryByText(/오프라인 측정 · 9\/9/)).not.toBeInTheDocument()
  expect(table.queryByText(/기준선/)).not.toBeInTheDocument()
})

test('the switch button label is just 전환 while the endpoint split stays elsewhere', async () => {
  show(<RagAdminPanel api={api({
    listVersions: vi.fn().mockResolvedValue({
      items: [
        version({ versionNumber: 11, status: 'ARCHIVED', knowledgeVersionId: 'kv-11' }),
        version({ versionNumber: 10, status: 'APPROVAL_PENDING', knowledgeVersionId: 'kv-10', activatedAt: undefined }),
        version(),
      ],
    }),
  })} role="SUPER_ADMIN" />)
  // 표에 나오는 전환 가능한 행은 승인 대기 하나뿐이다(보관 v11은 목록에서 빠진다).
  expect(await screen.findAllByRole('button', { name: '전환' })).toHaveLength(1)
  expect(screen.queryByRole('button', { name: /활성화\(승인\)/ })).not.toBeInTheDocument()
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

/**
 * 표는 지금 운영에 관계된 버전만 낸다(AI02-023) — 활성과 승인 대기. 보관·실패 버전을 함께
 * 늘어놓으면 "지금 서비스되는 것이 무엇인가"가 한눈에 읽히지 않고, 평가 방식이 서로 다른 옛
 * 줄이 나란히 놓여 성립하지 않는 대조를 만든다. <b>DB에서는 지우지 않으므로</b> 보관 건수는
 * 부제에 남고 되돌리기는 전용 버튼이 든다.
 */
test('the table lists only the versions in operation and counts the archived ones', async () => {
  show(<RagAdminPanel api={api({ listVersions: vi.fn().mockResolvedValue({ items: ladder() }) })} role="SUPER_ADMIN" />)

  // v8은 요약 카드에도 나오므로 버전 표 안으로 좁혀 단언한다.
  const table = within((await screen.findByText('RAG 버전')).closest('section') as HTMLElement)
  // 활성·승인 대기는 물론, 실패한 빌드도 남는다 — 지금 처리해야 할 상태다.
  for (const shown of ['v10', 'v8', 'v4', 'v3']) {
    expect(table.getByText(shown)).toBeInTheDocument()
  }
  for (const hidden of ['v11', 'v9']) {
    expect(table.queryByText(hidden)).not.toBeInTheDocument()
  }
  // 사라진 것이 아니라 보관된 것이다 — 건수로 남는다.
  expect(table.getByText('운영 4건 · 보관 2건')).toBeInTheDocument()
  expect(table.queryByRole('button', { name: /더 보기|접기/ })).not.toBeInTheDocument()
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
  await screen.findByText(/자료를 만들고 있습니다/)
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
  await screen.findByText(/자료를 만들고 있습니다/)
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

/**
 * 활성화·롤백이 곧 요청 처리다. 서버가 그때 열린 요청을 닫으므로 화면은 다시 읽기만 하면
 * 되는데, **버전 목록만 갱신하면 이미 처리된 요청이 계속 남아 보인다.**
 */
test('a successful activation refetches the open requests too', async () => {
  const listActivationRequests = vi.fn().mockResolvedValue({ items: [] })
  const calls = api({
    listVersions: vi.fn().mockResolvedValue({
      items: [version({ versionNumber: 10, status: 'APPROVAL_PENDING', knowledgeVersionId: 'kv-10', activatedAt: undefined })],
    }),
    activate: vi.fn().mockResolvedValue({}),
    listActivationRequests,
  })
  show(<RagAdminPanel api={calls} role="SUPER_ADMIN" />)
  await waitFor(() => expect(listActivationRequests).toHaveBeenCalledTimes(1))

  fireEvent.click(await screen.findByTitle('포털이 v10 기준으로 답하게 합니다.'))
  fireEvent.click(screen.getByRole('button', { name: '활성화 (승인)' }))
  await waitFor(() => expect(listActivationRequests).toHaveBeenCalledTimes(2))
})

/** 회색 버튼 툴팁의 "최고 관리자에게 요청하세요"가 이제 실제 경로를 가리킨다. */
test('a general admin gets a request path instead of a dead-ended tooltip', async () => {
  show(<RagAdminPanel api={api()} role="GENERAL_ADMIN" />)
  expect(await screen.findByRole('button', { name: '갱신 요청' })).toBeEnabled()
  expect(screen.getByText(/아래 「갱신 요청」에 남기면/)).toBeInTheDocument()
})

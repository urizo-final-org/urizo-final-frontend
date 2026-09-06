import { render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
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

function api(overrides: Partial<Record<keyof KnowledgeAdminApi, unknown>> = {}) {
  return {
    resolveTarget: vi.fn().mockResolvedValue({ kind: 'ready', projectId: 'p-1', knowledgeBaseId: 'kb-1', name: '관광 지식 베이스' }),
    listVersions: vi.fn().mockResolvedValue({ items: [version()] }),
    getJob: vi.fn(),
    ...overrides,
  } as unknown as KnowledgeAdminApi
}

test('a summary reads the active version from the versions call', async () => {
  render(<RagAdminPanel api={api()} role="SUPER_ADMIN" />)
  const heading = await screen.findByText('관광 지식 베이스')
  // v8은 요약과 버전 표 양쪽에 나오므로 요약 섹션으로 좁혀 단언한다.
  const summary = within(heading.closest('section') as HTMLElement)
  expect(summary.getByText('활성 버전')).toBeInTheDocument()
  expect(summary.getByText('v8')).toBeInTheDocument()
  // 문서·청크는 목업이던 고정 문자열이 아니라 응답에서 온다.
  expect(summary.getAllByText('500')).toHaveLength(2)
})

test('a general admin sees the screen but every write button is already disabled', async () => {
  render(<RagAdminPanel api={api()} role="GENERAL_ADMIN" />)
  await screen.findByText('관광 지식 베이스')
  // 눌러서 403을 받는 게 아니라 세션 역할로 미리 판별한다. 403은 방어선이지 UI가 아니다.
  expect(screen.getByRole('button', { name: 'Build 시작' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '이전 활성 버전으로 롤백' })).toBeDisabled()
  expect(screen.getByText(/SUPER_ADMIN 권한이 필요합니다/)).toBeInTheDocument()
})

test('entering the screen starts polling only when a build is already running', async () => {
  const idle = api()
  render(<RagAdminPanel api={idle} role="SUPER_ADMIN" />)
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
  render(<RagAdminPanel api={running} role="SUPER_ADMIN" />)
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
  render(<RagAdminPanel api={running} role="SUPER_ADMIN" />)
  await screen.findByText(/지식 빌드 진행 중/)
  // 9/6 실측: CHUNK 45%에서 8분 36초 정지, successCount는 500/500으로 얼어붙었다.
  // 둘 다 화면에 나오면 사용자가 "멈췄다"로 읽는다.
  await waitFor(() => expect(running.getJob).toHaveBeenCalled())
  expect(screen.queryByText(/45%/)).not.toBeInTheDocument()
  expect(screen.queryByText(/500 ?\/ ?500건/)).not.toBeInTheDocument()
})

test('several knowledge bases stop the screen instead of picking one', async () => {
  render(<RagAdminPanel api={api({ resolveTarget: vi.fn().mockResolvedValue({ kind: 'ambiguous', what: 'knowledgeBase', count: 3 }) })} role="SUPER_ADMIN" />)
  // 첫 번째를 조용히 고르면 잘못된 지식 베이스를 보고도 모른다.
  expect(await screen.findByText(/지식 베이스가 3개입니다/)).toBeInTheDocument()
})

test('a cold start says the knowledge base is missing', async () => {
  render(<RagAdminPanel api={api({ resolveTarget: vi.fn().mockResolvedValue({ kind: 'empty', what: 'knowledgeBase' }) })} role="SUPER_ADMIN" />)
  expect(await screen.findByText(/지식 베이스가 없습니다/)).toBeInTheDocument()
})

test('the quality panel labels its source and leaves Faithfulness out', async () => {
  render(<RagAdminPanel api={api()} role="SUPER_ADMIN" />)
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
  render(<StrictMode><RagAdminPanel api={api()} role="SUPER_ADMIN" /></StrictMode>)
  expect(await screen.findByText('관광 지식 베이스')).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByText('조회 중…')).not.toBeInTheDocument())
})

test('a blocked target says so instead of waiting forever', async () => {
  render(<RagAdminPanel api={api({ resolveTarget: vi.fn().mockResolvedValue({ kind: 'ambiguous', what: 'project', count: 2 }) })} role="SUPER_ADMIN" />)
  await screen.findByText(/프로젝트가 2개입니다/)
  // 대상이 없으면 버전을 부를 수 없다. 기다리는 것처럼 두면 사용자가 원인을 위쪽 안내가
  // 아니라 네트워크에서 찾게 된다.
  expect(screen.getByText(/위 안내를 해결해야 버전을 불러올 수 있습니다/)).toBeInTheDocument()
  expect(screen.queryByText('조회 중…')).not.toBeInTheDocument()
})

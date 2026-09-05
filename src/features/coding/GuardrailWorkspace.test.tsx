import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import GuardrailWorkspace from './GuardrailWorkspace'
import type {
  CodingConsoleApiClient, GuardrailRepository, GuardrailScanResult, GuardrailSelection,
} from './api'

const SCAN_ID = '33333333-4444-4555-8666-777777777777'

const FRONTEND_FOLDERS = ['src/app', 'src/features/cms', 'src/shared/api', 'src/styles']
const BACKEND_FOLDERS = [
  'src/main/java/org/urizo/axmodulestudio/backend/cms',
  'src/main/java/org/urizo/axmodulestudio/backend/core',
  'src/main/java/org/urizo/axmodulestudio/backend/health',
  'src/main/java/org/urizo/axmodulestudio/backend/integration',
]

function scanOf(repository: GuardrailRepository): GuardrailScanResult {
  return {
    scanId: SCAN_ID,
    repository,
    status: 'SUCCEEDED',
    sha: `sha1:${'a'.repeat(40)}`,
    folders: repository === 'frontend' ? FRONTEND_FOLDERS : BACKEND_FOLDERS,
  }
}

function guardrailApi(overrides: Partial<CodingConsoleApiClient> = {}): CodingConsoleApiClient {
  return {
    createJob: vi.fn(),
    listJobs: vi.fn().mockResolvedValue({ schemaVersion: '1.0', items: [] }),
    getJob: vi.fn(),
    decideApproval: vi.fn(),
    cancelJob: vi.fn(),
    guardrailSelections: vi.fn().mockImplementation(
      (repository: GuardrailRepository) => Promise.resolve({ repository, selections: [] })),
    saveGuardrailSelections: vi.fn().mockImplementation(
      (repository: GuardrailRepository, selections: GuardrailSelection[]) =>
        Promise.resolve({ repository, selections })),
    startGuardrailScan: vi.fn().mockImplementation(
      (repository: GuardrailRepository) => Promise.resolve({ scanId: SCAN_ID, repository })),
    guardrailScan: vi.fn().mockImplementation(
      (_scanId: string, repository: GuardrailRepository) => Promise.resolve(scanOf(repository))),
    guardrailRules: vi.fn().mockResolvedValue(
      { allowNewDependency: false, maxChangedFiles: null, maxChangedLines: null }),
    saveGuardrailRules: vi.fn().mockImplementation((rules) => Promise.resolve(rules)),
    // The execution-history screen added these two to the client after this helper was
    // written, and a Partial cannot supply a required member. Missing, the file stopped type
    // checking - which the frontend candidate check now runs, so every screen request would
    // have failed on a stub nobody had filled in.
    runnerStatus: vi.fn().mockResolvedValue({ schemaVersion: '1.0', alive: true }),
    notifications: vi.fn().mockResolvedValue({ schemaVersion: '1.0', items: [] }),
    ...overrides,
  }
}

/*
 * The pipeline skips the path check entirely when nothing is allowed, so an unconfigured
 * system is wide open rather than locked. Saying so is the reason this screen exists.
 */
test('an empty fence is reported as the open door it is', async () => {
  render(<GuardrailWorkspace api={guardrailApi()} />)

  expect(await screen.findByText(/AI 가 저장소의 어느 파일이든 고칠 수 있습니다/))
    .toBeInTheDocument()
})

/* 7-화면.md draws the two repositories side by side; fencing only one would leave the other
 * to start unfenced when its jobs arrive. */
test('both repositories are offered, labeled for a person rather than a developer', async () => {
  render(<GuardrailWorkspace api={guardrailApi()} />)

  expect(await screen.findByText('📁 프론트엔드')).toBeInTheDocument()
  expect(screen.getByText('📁 백엔드')).toBeInTheDocument()
  // The guide's own label examples: features/cms → "CMS 화면", backend/cms → "CMS 기능".
  expect(await screen.findByRole('checkbox', { name: /CMS 화면/ })).toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: /CMS 기능/ })).toBeInTheDocument()
})

test('a scan ticks the folders already allowed', async () => {
  render(<GuardrailWorkspace api={guardrailApi({
    guardrailSelections: vi.fn().mockImplementation(
      (repository: GuardrailRepository) => Promise.resolve({
        repository,
        selections: repository === 'backend'
          ? [{ path: BACKEND_FOLDERS[0], enabled: true }] : [],
      })),
  })} />)

  expect(await screen.findByRole('checkbox', { name: /CMS 기능/ })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: /상태 점검/ })).not.toBeChecked()
})

/*
 * The server replaces the whole stored choice per repository, so a request carrying only the
 * ticked folders would silently un-allow everything shown beside them.
 */
test('saving sends every listed folder of both repositories, with its label', async () => {
  const api = guardrailApi()
  render(<GuardrailWorkspace api={api} />)

  fireEvent.click(await screen.findByRole('checkbox', { name: /CMS 기능/ }))
  fireEvent.click(screen.getByRole('button', { name: '저장' }))

  await waitFor(() => expect(api.saveGuardrailSelections).toHaveBeenCalledTimes(2))
  expect(api.saveGuardrailSelections).toHaveBeenCalledWith('frontend',
    FRONTEND_FOLDERS.map((path) => expect.objectContaining({ path, enabled: false })))
  expect(api.saveGuardrailSelections).toHaveBeenCalledWith('backend', [
    { path: BACKEND_FOLDERS[0], enabled: true, label: 'CMS 기능' },
    expect.objectContaining({ path: BACKEND_FOLDERS[1], enabled: false }),
    expect.objectContaining({ path: BACKEND_FOLDERS[2], enabled: false }),
    expect.objectContaining({ path: BACKEND_FOLDERS[3], enabled: false }),
  ])
})

test('ticking a folder alone never reaches the server', async () => {
  const api = guardrailApi()
  render(<GuardrailWorkspace api={api} />)

  fireEvent.click(await screen.findByRole('checkbox', { name: /CMS 기능/ }))

  expect(api.saveGuardrailSelections).not.toHaveBeenCalled()
  expect(screen.getByText('저장하지 않은 변경이 있습니다.')).toBeInTheDocument()
})

/* The ⚠ tier of 7-화면.md: a folder every screen depends on opens only past a spelled-out
 * yes, never on a stray click. */
test('a shared folder asks for confirmation before it is allowed', async () => {
  render(<GuardrailWorkspace api={guardrailApi()} />)

  fireEvent.click(await screen.findByRole('checkbox', { name: /외부 연동/ }))

  expect(screen.getByRole('checkbox', { name: /외부 연동/ })).not.toBeChecked()
  expect(screen.getByText(/여러 기능의 통신에 영향이 갑니다/)).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '알고 있습니다. 허용합니다' }))
  expect(screen.getByRole('checkbox', { name: /외부 연동/ })).toBeChecked()
})

/*
 * A side with nothing ticked is refused at intake: the server reads the sentence, sees the
 * side it belongs to is closed, and turns the request down before any work starts. Both sides
 * take requests now, so the warning names whichever side is empty rather than only backend.
 */
test('a side with no folder warns that its requests are refused at intake', async () => {
  render(<GuardrailWorkspace api={guardrailApi()} />)

  fireEvent.click(await screen.findByRole('checkbox', { name: /CMS 화면/ }))

  expect(screen.getByText(/백엔드 쪽\s*허용 폴더가 없습니다/)).toBeInTheDocument()
  expect(screen.getByText(/접수 단계에서 거절됩니다/)).toBeInTheDocument()
})

/* 6-울타리.md 6-6: the rules that name no path travel through their own endpoint. */
test('changing a rule saves it alongside the folders', async () => {
  const api = guardrailApi()
  render(<GuardrailWorkspace api={api} />)

  fireEvent.click(await screen.findByRole('checkbox', { name: /새 라이브러리 추가 허용/ }))
  fireEvent.click(screen.getByRole('button', { name: '저장' }))

  await waitFor(() => expect(api.saveGuardrailRules).toHaveBeenCalledWith(
    { allowNewDependency: true, maxChangedFiles: null, maxChangedLines: null }))
})

/*
 * React mounts, unmounts and remounts a component in development. A "screen is gone" flag that
 * is only ever set true survives that remount and then discards every response, which left the
 * screen reading "불러오는 중입니다…" forever while the scan had in fact finished in a second.
 */
test('the screen still loads after the development remount', async () => {
  render(<StrictMode><GuardrailWorkspace api={guardrailApi()} /></StrictMode>)

  expect(await screen.findByRole('checkbox', { name: /상태 점검/ })).toBeInTheDocument()
  expect(screen.queryByText('불러오는 중입니다…')).not.toBeInTheDocument()
})

/*
 * A queued scan with no runner up never fails, it just never finishes. Waiting forever with
 * no explanation is the failure the operator actually experiences.
 */
test('a scan that never leaves the queue names the runner instead of waiting forever', async () => {
  vi.useFakeTimers()
  try {
    render(<GuardrailWorkspace api={guardrailApi({
      guardrailScan: vi.fn().mockImplementation(
        (_scanId: string, repository: GuardrailRepository) => Promise.resolve({
          scanId: SCAN_ID, repository, status: 'PENDING', folders: [],
        })),
    })} />)

    await act(async () => { await vi.advanceTimersByTimeAsync(70_000) })

    expect(screen.getAllByText(/실행기가 응답하지 않습니다/).length).toBeGreaterThan(0)
  }
  finally {
    vi.useRealTimers()
  }
})

test('a failed scan reports the failure rather than an empty folder list', async () => {
  render(<GuardrailWorkspace api={guardrailApi({
    guardrailScan: vi.fn().mockImplementation(
      (_scanId: string, repository: GuardrailRepository) => Promise.resolve({
        scanId: SCAN_ID, repository, status: 'FAILED', folders: [], errorCode: 'RUNNER_TASK_FAILED',
      })),
  })} />)

  expect((await screen.findAllByText(/폴더를 읽지 못했습니다/)).length).toBeGreaterThan(0)
})

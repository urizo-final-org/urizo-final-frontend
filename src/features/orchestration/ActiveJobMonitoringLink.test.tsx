import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest'
import ActiveJobMonitoringLink, { monitoringJobHref } from './ActiveJobMonitoringLink'
import type { AgentSettingsApiClient } from './api'

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

// jsdom has no native dialog implementation; browser focus trapping is verified separately.
beforeAll(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value() { this.setAttribute('open', '') } },
    close: { configurable: true, value() { this.removeAttribute('open') } },
  })
})
afterAll(() => {
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
})

afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else Reflect.deleteProperty(navigator, 'clipboard')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
})

test.each(['NATURAL_CMS', 'LLM_OPS'] as const)('copies the full UUID for %s and only confirms a successful write', async (profileKey) => {
  const jobId = '1bc6a436-0e4c-49fb-abfc-0e8022c7f413'
  let resolveWrite!: () => void
  const writeText = vi.fn().mockReturnValue(new Promise<void>((resolve) => { resolveWrite = resolve }))
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  const listMonitoringJobs = vi.fn().mockResolvedValue({ jobs: [{ jobId, profileKey, domainTerminal: false }] })
  render(<ActiveJobMonitoringLink api={{ listMonitoringJobs } as unknown as AgentSettingsApiClient} profileKey={profileKey} />)
  const copy = await screen.findByRole('button', { name: '전체 Job ID 복사' })
  expect(writeText).not.toHaveBeenCalled()
  expect(screen.getByLabelText(`활성 Job ${jobId}`)).toHaveTextContent('Job 1bc6a436…')
  fireEvent.click(copy)
  expect(writeText).toHaveBeenCalledExactlyOnceWith(jobId)
  expect(copy).toBeDisabled()
  expect(screen.getByRole('status')).toBeEmptyDOMElement()
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  await act(async () => resolveWrite())
  expect(copy).toBeEnabled()
  expect(copy).toHaveAttribute('title', 'Job ID 복사 완료')
  expect(screen.getByRole('status')).toHaveTextContent('Job ID 복사 완료')
  expect(screen.getByRole('link')).toHaveAttribute('href', monitoringJobHref(jobId))
  const dialog = screen.getByRole('alertdialog', { name: '복사 완료' })
  expect(dialog).toHaveTextContent('Job ID가 복사되었습니다.')
  expect(within(dialog).getByRole('button', { name: '확인' })).toHaveFocus()
  fireEvent.click(within(dialog).getByRole('button', { name: '확인' }))
  expect(dialog).toHaveAttribute('data-closing', 'true')
  expect(dialog).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  expect(copy).toHaveFocus()
  await act(async () => fireEvent.click(copy))
  fireEvent(screen.getByRole('alertdialog'), new Event('cancel', { cancelable: true }))
  expect(screen.getByRole('alertdialog')).toHaveAttribute('data-closing', 'true')
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  expect(copy).toHaveFocus()
})

test.each([false, true])('keeps the success notice for 2.6 seconds, including reduced motion=%s', async (reducedMotion) => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: reducedMotion })))
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })
  const listMonitoringJobs = vi.fn().mockResolvedValue({ jobs: [{ jobId: 'active-job', profileKey: 'LLM_OPS', domainTerminal: false }] })
  render(<ActiveJobMonitoringLink api={{ listMonitoringJobs } as unknown as AgentSettingsApiClient} profileKey="LLM_OPS" />)
  await act(async () => {})
  const copy = screen.getByRole('button', { name: '전체 Job ID 복사' })
  await act(async () => fireEvent.click(copy))
  expect(screen.getByRole('alertdialog')).toHaveClass('cms-success-toast', 'job-copy-alert')
  await act(async () => { await vi.advanceTimersByTimeAsync(2599) })
  expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(copy).toHaveFocus()
  await act(async () => fireEvent.click(copy))
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '확인' }))
  expect(screen.getByRole('alertdialog')).toHaveAttribute('data-closing', 'true')
  await act(async () => { await vi.advanceTimersByTimeAsync(reducedMotion ? 0 : 571) })
  if (!reducedMotion) {
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  }
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
})

test.each(['denied', 'unavailable'])('reports clipboard %s without falsely confirming success', async (failure) => {
  const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'))
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: failure === 'unavailable' ? undefined : { writeText } })
  const listMonitoringJobs = vi.fn().mockResolvedValue({ jobs: [{ jobId: 'active-job', profileKey: 'LLM_OPS', domainTerminal: false }] })
  render(<ActiveJobMonitoringLink api={{ listMonitoringJobs } as unknown as AgentSettingsApiClient} profileKey="LLM_OPS" />)
  const copy = await screen.findByRole('button', { name: '전체 Job ID 복사' })
  await act(async () => fireEvent.click(copy))
  expect(screen.getByRole('status')).toHaveTextContent('복사하지 못했습니다.')
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(copy).toHaveAttribute('title', '전체 Job ID 복사')
  expect(copy).toBeEnabled()
  expect(screen.getByRole('link')).toHaveAttribute('href', monitoringJobHref('active-job'))
  if (failure === 'denied') {
    writeText.mockResolvedValue(undefined)
    await act(async () => fireEvent.click(copy))
    expect(screen.getByRole('status')).toHaveTextContent('Job ID 복사 완료')
  }
})

test('does not carry a pending clipboard result to a different active Job', async () => {
  vi.useFakeTimers()
  let resolveWrite!: () => void
  const writeText = vi.fn().mockReturnValueOnce(new Promise<void>((resolve) => { resolveWrite = resolve })).mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  const listMonitoringJobs = vi.fn().mockResolvedValue({ jobs: [{ jobId: 'old-job', profileKey: 'LLM_OPS', domainTerminal: false }] })
  render(<ActiveJobMonitoringLink api={{ listMonitoringJobs } as unknown as AgentSettingsApiClient} profileKey="LLM_OPS" />)
  await act(async () => {})
  fireEvent.click(screen.getByRole('button', { name: '전체 Job ID 복사' }))
  listMonitoringJobs.mockResolvedValue({ jobs: [{ jobId: 'new-job', profileKey: 'LLM_OPS', domainTerminal: false }] })
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
  await act(async () => resolveWrite())
  expect(screen.getByRole('status')).toBeEmptyDOMElement()
  expect(screen.getByRole('button', { name: '전체 Job ID 복사' })).toBeEnabled()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '전체 Job ID 복사' })))
  expect(writeText).toHaveBeenLastCalledWith('new-job')
  expect(screen.getByRole('status')).toHaveTextContent('Job ID 복사 완료')
  listMonitoringJobs.mockResolvedValue({ jobs: [] })
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('discovers the latest active Job of the matching Profile and removes the link on completion', async () => {
  vi.useFakeTimers()
  const listMonitoringJobs = vi.fn().mockResolvedValue({ jobs: [] })
  render(<ActiveJobMonitoringLink api={{ listMonitoringJobs } as unknown as AgentSettingsApiClient} profileKey="NATURAL_CMS" />)
  await act(async () => {})
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
  listMonitoringJobs.mockResolvedValue({ jobs: [
    { jobId: 'llm-job', profileKey: 'LLM_OPS', domainTerminal: false },
    { jobId: 'ended', profileKey: 'NATURAL_CMS', domainTerminal: true },
    { jobId: 'natural-job', profileKey: 'NATURAL_CMS', domainTerminal: false },
  ] })
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
  expect(screen.getByRole('link', { name: '실시간 모니터링' })).toHaveAttribute('href', monitoringJobHref('natural-job'))
  expect(screen.getByLabelText('활성 Job natural-job')).toHaveTextContent('Job natural-…')
  const latestJobId = '1bc6a436-0e4c-49fb-abfc-0e8022c7f413'
  listMonitoringJobs.mockResolvedValue({ jobs: [{ jobId: latestJobId, profileKey: 'NATURAL_CMS', domainTerminal: false }] })
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
  expect(screen.getByRole('link')).toHaveAttribute('href', monitoringJobHref(latestJobId))
  expect(screen.getByLabelText(`활성 Job ${latestJobId}`)).toHaveTextContent('Job 1bc6a436…')
  expect(screen.getByLabelText(`활성 Job ${latestJobId}`)).toHaveAttribute('title', `Job ${latestJobId}`)
  expect(screen.queryByLabelText('활성 Job natural-job')).not.toBeInTheDocument()
  listMonitoringJobs.mockResolvedValue({ jobs: [{ jobId: latestJobId, profileKey: 'NATURAL_CMS', domainTerminal: true }] })
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
  expect(screen.queryByLabelText(`활성 Job ${latestJobId}`)).not.toBeInTheDocument()
})

test('does not overlap requests, ignores hidden stale responses, resumes, and aborts on unmount', async () => {
  vi.useFakeTimers()
  let resolveFirst!: (value: unknown) => void
  const listMonitoringJobs = vi.fn().mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve }))
    .mockResolvedValue({ jobs: [{ jobId: 'new', profileKey: 'LLM_OPS', domainTerminal: false }] })
  const view = render(<ActiveJobMonitoringLink api={{ listMonitoringJobs } as unknown as AgentSettingsApiClient} profileKey="LLM_OPS" />)
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
  expect(listMonitoringJobs).toHaveBeenCalledTimes(1)
  Object.defineProperty(document, 'hidden', { configurable: true, value: true })
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(listMonitoringJobs.mock.calls[0][0].aborted).toBe(true)
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  await act(async () => document.dispatchEvent(new Event('visibilitychange')))
  await act(async () => resolveFirst({ jobs: [{ jobId: 'stale', profileKey: 'LLM_OPS', domainTerminal: false }] }))
  expect(screen.getByRole('link')).toHaveAttribute('href', monitoringJobHref('new'))
  listMonitoringJobs.mockRejectedValue(new Error('Unavailable'))
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
  view.unmount()
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
  expect(listMonitoringJobs).toHaveBeenCalledTimes(3)
})

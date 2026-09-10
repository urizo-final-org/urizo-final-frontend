import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import ActiveJobMonitoringLink, { monitoringJobHref } from './ActiveJobMonitoringLink'
import type { AgentSettingsApiClient } from './api'

afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
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

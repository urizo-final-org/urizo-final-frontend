import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import App from './App'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  window.localStorage.clear()
  window.location.hash = '#providers'
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
    csrfToken: 'fixture-csrf',
    checkedAt: '2026-08-11T06:00:00Z',
    providers: [
      { provider: 'OPENAI', configured: false, state: null, fingerprintSuffix: null, updatedAt: null, lastTestedAt: null },
      { provider: 'GOOGLE_GENAI', configured: false, state: null, fingerprintSuffix: null, updatedAt: null, lastTestedAt: null },
      { provider: 'ANTHROPIC', configured: false, state: null, fingerprintSuffix: null, updatedAt: null, lastTestedAt: null },
    ],
  })))
})

test('preserves all provider forms without exposing a prefilled credential', async () => {
  render(<App />)

  expect(await screen.findByText('OpenAI')).toBeInTheDocument()
  expect(screen.getByText('Google Gemini')).toBeInTheDocument()
  expect(screen.getByText('Anthropic Claude')).toBeInTheDocument()
  for (const input of screen.getAllByLabelText('API Key')) {
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveValue('')
  }
})

test('restores a saved project through the real list and get client boundaries', async () => {
  window.location.hash = '#local-full'
  const project = {
    schemaVersion: '1.0',
    traceId: '66666666-6666-4666-8666-666666666666',
    projectId: '11111111-1111-4111-8111-111111111111',
    name: 'Restored Local Project',
    status: 'ACTIVE',
    createdAt: '2026-08-11T12:00:00Z',
  }
  window.localStorage.setItem('axms.local-full.active-project', project.projectId)

  const fetcher = vi.fn((input: RequestInfo | URL) => {
    const path = String(input)
    if (path === '/internal/dev/product-session') {
      return Promise.resolve(jsonResponse({ accessToken: 'boot-random-session-token', tokenType: 'Bearer' }))
    }
    if (path === '/api/health') {
      return Promise.resolve(jsonResponse({ schemaVersion: '1.0', traceId: project.traceId, status: 'UP', checkedAt: project.createdAt }))
    }
    if (path === '/api/readiness') {
      return Promise.resolve(jsonResponse({ schemaVersion: '1.0', traceId: project.traceId, status: 'READY', checkedAt: project.createdAt, checks: [] }))
    }
    if (path === '/api/projects') return Promise.resolve(jsonResponse({ items: [project] }))
    if (path === `/api/projects/${project.projectId}`) return Promise.resolve(jsonResponse(project))
    if (path === `/api/projects/${project.projectId}/connectors`) return Promise.resolve(jsonResponse({ items: [] }))
    if (path === `/api/knowledge-bases?projectId=${project.projectId}`) return Promise.resolve(jsonResponse({ items: [] }))
    if (path === `/api/projects/${project.projectId}/chatbots`) return Promise.resolve(jsonResponse({ items: [] }))
    if (path === `/api/agent-jobs?projectId=${project.projectId}`) return Promise.resolve(jsonResponse({ items: [] }))
    return Promise.resolve(jsonResponse({ error: { code: 'UNEXPECTED_TEST_PATH', message: path } }, 500))
  })
  vi.stubGlobal('fetch', fetcher)

  render(<App />)

  expect(await screen.findByText('Project에서 RAG 답변까지')).toBeInTheDocument()
  expect(await screen.findAllByText('Restored Local Project')).not.toHaveLength(0)
  await waitFor(() => expect(fetcher).toHaveBeenCalledWith(
    `/api/projects/${project.projectId}`,
    expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }),
  ))
})

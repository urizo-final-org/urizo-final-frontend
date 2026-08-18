import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import AppShell from './AppShell'

const TOKEN_KEY = 'axms.auth.session-token'
const STORED_TOKEN = 'restored-opaque-session-token'
const actorId = '11111111-1111-4111-8111-111111111111'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function currentSession(role: 'SUPER_ADMIN' | 'GENERAL_ADMIN' = 'SUPER_ADMIN'): Response {
  return jsonResponse({
    schemaVersion: '1.0',
    traceId: '66666666-6666-4666-8666-666666666666',
    actor: { actorId, role, assignedProjectIds: [] },
    expiresAt: '2026-08-13T17:00:00Z',
  })
}

const providerOverview = {
  csrfToken: 'fixture-csrf',
  checkedAt: '2026-08-11T06:00:00Z',
  providers: [
    { provider: 'OPENAI', configured: false, state: null, fingerprintSuffix: null, updatedAt: null, lastTestedAt: null },
    { provider: 'GOOGLE_GENAI', configured: false, state: null, fingerprintSuffix: null, updatedAt: null, lastTestedAt: null },
    { provider: 'ANTHROPIC', configured: false, state: null, fingerprintSuffix: null, updatedAt: null, lastTestedAt: null },
  ],
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  window.history.pushState({}, '', '/providers')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('asks for credentials when there is no session', async () => {
  vi.stubGlobal('fetch', vi.fn())

  render(<AppShell />)

  expect(await screen.findByRole('heading', { name: '관리자 로그인' })).toBeInTheDocument()
  expect(screen.queryByText('OpenAI')).not.toBeInTheDocument()
})

test('a rejected credential keeps the operator on the sign-in screen', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
    schemaVersion: '1.0',
    error: { code: 'AUTHENTICATION_REQUIRED', message: 'A valid administrator session is required.', retryable: false },
  }, 401)))

  render(<AppShell />)
  fireEvent.change(await screen.findByLabelText('아이디'), { target: { value: 'super-admin' } })
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'wrong-password' } })
  fireEvent.click(screen.getByRole('button', { name: '로그인' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('아이디 또는 비밀번호가 올바르지 않습니다.')
  expect(screen.getByRole('heading', { name: '관리자 로그인' })).toBeInTheDocument()
})

test('a stored token is confirmed with the server before the shell is shown', async () => {
  window.sessionStorage.setItem(TOKEN_KEY, STORED_TOKEN)
  const fetcher = vi.fn((input: RequestInfo | URL) => {
    if (String(input) === '/api/auth/me') return Promise.resolve(currentSession())
    return Promise.resolve(jsonResponse(providerOverview))
  })
  vi.stubGlobal('fetch', fetcher)

  render(<AppShell />)

  expect(await screen.findByText('OpenAI')).toBeInTheDocument()
  expect(screen.getByText('최고관리자')).toBeInTheDocument()
  expect(fetcher).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({
    headers: expect.objectContaining({ Authorization: `Bearer ${STORED_TOKEN}` }),
  }))
})

test('a token the server no longer accepts is discarded rather than retried', async () => {
  window.sessionStorage.setItem(TOKEN_KEY, STORED_TOKEN)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
    schemaVersion: '1.0',
    error: { code: 'AUTHENTICATION_REQUIRED', message: 'A valid administrator session is required.', retryable: false },
  }, 401)))

  render(<AppShell />)

  expect(await screen.findByRole('heading', { name: '관리자 로그인' })).toBeInTheDocument()
  expect(window.sessionStorage.getItem(TOKEN_KEY)).toBeNull()
})

test('signing out clears the stored token and returns to the sign-in screen', async () => {
  window.sessionStorage.setItem(TOKEN_KEY, STORED_TOKEN)
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    if (String(input) === '/api/auth/me') return Promise.resolve(currentSession())
    if (String(input) === '/api/auth/logout') return Promise.resolve(new Response(null, { status: 204 }))
    return Promise.resolve(jsonResponse(providerOverview))
  }))

  render(<AppShell />)
  fireEvent.click(await screen.findByRole('button', { name: '로그아웃' }))

  expect(await screen.findByRole('heading', { name: '관리자 로그인' })).toBeInTheDocument()
  expect(window.sessionStorage.getItem(TOKEN_KEY)).toBeNull()
})

test('a customer operator is not offered platform LLM settings', async () => {
  window.sessionStorage.setItem(TOKEN_KEY, STORED_TOKEN)
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    if (String(input) === '/api/auth/me') return Promise.resolve(currentSession('GENERAL_ADMIN'))
    return Promise.resolve(jsonResponse({ items: [] }))
  }))

  render(<AppShell />)

  expect(await screen.findByText('일반관리자')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /LLM Providers/ })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Local Full Workflow/ })).toBeInTheDocument()
})

/** The hash is client input, so reaching a restricted screen by typing it must not work. */
test('a hand-typed route outside the role falls back to the default screen', async () => {
  window.history.pushState({}, '', '/providers')
  window.sessionStorage.setItem(TOKEN_KEY, STORED_TOKEN)
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    if (String(input) === '/api/auth/me') return Promise.resolve(currentSession('GENERAL_ADMIN'))
    if (String(input) === '/internal/dev/provider-credentials') {
      return Promise.resolve(jsonResponse(providerOverview))
    }
    return Promise.resolve(jsonResponse({ items: [] }))
  }))

  render(<AppShell />)

  expect(await screen.findByText('일반관리자')).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByText('OpenAI')).not.toBeInTheDocument())
})

/**
 * A session can die while the shell is open — it expires, it is revoked elsewhere, or the account
 * is disabled. Leaving the operator on a screen whose every request fails reads as a broken product.
 */
test('a session that dies while the shell is open returns to sign-in with the reason', async () => {
  window.sessionStorage.setItem(TOKEN_KEY, STORED_TOKEN)
  let sessionAlive = true
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    if (String(input) === '/api/auth/me') return Promise.resolve(currentSession())
    if (!sessionAlive) {
      return Promise.resolve(jsonResponse({
        schemaVersion: '1.0',
        error: { code: 'AUTHENTICATION_REQUIRED', message: 'A valid administrator session is required.', retryable: false },
      }, 401))
    }
    return Promise.resolve(jsonResponse(providerOverview))
  }))

  render(<AppShell />)
  expect(await screen.findByText('OpenAI')).toBeInTheDocument()

  // The session is revoked, then navigating to a different screen hits the server again.
  sessionAlive = false
  window.history.pushState({}, '', '/local-full')
  fireEvent(window, new PopStateEvent('popstate'))

  expect(await screen.findByRole('heading', { name: '관리자 로그인' })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('세션이 만료되었습니다')
  expect(window.sessionStorage.getItem(TOKEN_KEY)).toBeNull()
})

test('preserves all provider forms without exposing a prefilled credential', async () => {
  window.sessionStorage.setItem(TOKEN_KEY, STORED_TOKEN)
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    if (String(input) === '/api/auth/me') return Promise.resolve(currentSession())
    return Promise.resolve(jsonResponse(providerOverview))
  }))

  render(<AppShell />)

  expect(await screen.findByText('OpenAI')).toBeInTheDocument()
  expect(screen.getByText('Google Gemini')).toBeInTheDocument()
  expect(screen.getByText('Anthropic Claude')).toBeInTheDocument()
  for (const input of screen.getAllByLabelText('API Key')) {
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveValue('')
  }
})

test('restores a saved project through the real list and get client boundaries', async () => {
  window.history.pushState({}, '', '/local-full')
  window.sessionStorage.setItem(TOKEN_KEY, STORED_TOKEN)
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
    if (path === '/api/auth/me') return Promise.resolve(currentSession())
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

  render(<AppShell />)

  expect(await screen.findByText('Project에서 RAG 답변까지')).toBeInTheDocument()
  expect(await screen.findAllByText('Restored Local Project')).not.toHaveLength(0)
  await waitFor(() => expect(fetcher).toHaveBeenCalledWith(
    `/api/projects/${project.projectId}`,
    expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }),
  ))
})

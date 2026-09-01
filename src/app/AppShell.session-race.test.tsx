import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import AppShell from './AppShell'

const actorId = '11111111-1111-4111-8111-111111111111'
const accessTokenKey = 'axms.auth.access-token'
const explicitSignOutKey = 'axms.auth.explicit-sign-out'

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  window.history.pushState({}, '', '/admin')
  vi.restoreAllMocks()
})

test('a refresh response from the signed-out session cannot sign the operator back in', async () => {
  const staleMembers = deferred<Response>()
  const staleRefresh = deferred<Response>()
  let refreshCalls = 0
  let memberCalls = 0

  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const path = String(input)
    if (path === '/api/auth/refresh') {
      refreshCalls += 1
      return refreshCalls === 1
        ? Promise.resolve(json(authSession('old-access-token', '기존 관리자')))
        : staleRefresh.promise
    }
    if (path === '/api/auth/logout') return Promise.resolve(noContent())
    if (path === '/api/cms/members') {
      memberCalls += 1
      return memberCalls === 1 ? staleMembers.promise : Promise.resolve(json([]))
    }
    return Promise.resolve(json([]))
  }))

  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: '회원 관리' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '로그아웃' }))
  expect(await screen.findByRole('heading', { name: 'CMS 로그인' })).toBeInTheDocument()
  expect(window.localStorage.getItem(explicitSignOutKey)).toBe('1')

  await act(async () => {
    staleMembers.resolve(json({ error: { code: 'AUTHENTICATION_REQUIRED' } }, 401))
    await Promise.resolve()
  })
  await waitFor(() => expect(refreshCalls).toBe(2))

  await act(async () => {
    staleRefresh.resolve(json(authSession('stale-refresh-token', '오래된 관리자')))
    await Promise.resolve()
  })
  await waitFor(() => expect(memberCalls).toBeGreaterThanOrEqual(2))

  expect(screen.getByRole('heading', { name: 'CMS 로그인' })).toBeInTheDocument()
  expect(window.sessionStorage.getItem(accessTokenKey)).toBeNull()
  expect(window.localStorage.getItem(explicitSignOutKey)).toBe('1')
})

test('an expired response from an older session cannot clear a newer login', async () => {
  const staleMembers = deferred<Response>()
  const staleRefreshFailure = deferred<Response>()
  let refreshCalls = 0

  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    if (path === '/api/auth/refresh') {
      refreshCalls += 1
      return refreshCalls === 1
        ? Promise.resolve(json(authSession('old-access-token', '기존 관리자')))
        : staleRefreshFailure.promise
    }
    if (path === '/api/auth/logout') return Promise.resolve(noContent())
    if (path === '/api/auth/login') {
      return Promise.resolve(json(authSession('new-access-token', '신규 관리자', 'SUPER_ADMIN')))
    }
    if (path === '/api/cms/members') {
      const authorization = new Headers(init?.headers).get('Authorization')
      return authorization === 'Bearer old-access-token' ? staleMembers.promise : Promise.resolve(json([]))
    }
    return Promise.resolve(json([]))
  }))

  render(<AppShell />)
  expect(await screen.findByRole('heading', { name: '회원 관리' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '로그아웃' }))
  expect(await screen.findByRole('heading', { name: 'CMS 로그인' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '최고관리자' }))
  fireEvent.click(screen.getByRole('button', { name: '로그인' }))
  expect(await screen.findByText('신규 관리자')).toBeInTheDocument()
  expect(window.sessionStorage.getItem(accessTokenKey)).toBe('new-access-token')

  await act(async () => {
    staleMembers.resolve(json({ error: { code: 'AUTHENTICATION_REQUIRED' } }, 401))
    await Promise.resolve()
  })
  await waitFor(() => expect(refreshCalls).toBe(2))

  await act(async () => {
    staleRefreshFailure.resolve(json({ error: { code: 'AUTHENTICATION_REQUIRED' } }, 401))
    await Promise.resolve()
  })

  expect(window.sessionStorage.getItem(accessTokenKey)).toBe('new-access-token')
  expect(screen.getByText('신규 관리자')).toBeInTheDocument()
  expect(screen.queryByText('세션이 만료되었습니다. 다시 로그인해 주세요.')).not.toBeInTheDocument()
})

test('StrictMode shares the direct session restore refresh', async () => {
  const fetcher = vi.fn((input: RequestInfo | URL) => {
    if (String(input) === '/api/auth/refresh') {
      return Promise.resolve(json(authSession('restored-access-token', '복원 관리자')))
    }
    return Promise.resolve(json([]))
  })
  vi.stubGlobal('fetch', fetcher)

  render(<StrictMode><AppShell /></StrictMode>)
  expect(await screen.findByRole('heading', { name: '회원 관리' })).toBeInTheDocument()

  const refreshCalls = fetcher.mock.calls.filter(([input]) => String(input) === '/api/auth/refresh')
  expect(refreshCalls).toHaveLength(1)
})

function authSession(
  sessionToken: string,
  name: string,
  role: 'SUPER_ADMIN' | 'GENERAL_ADMIN' = 'GENERAL_ADMIN',
) {
  return {
    sessionToken,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    actor: { actorId, name, role },
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function noContent() {
  return new Response(null, { status: 204 })
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

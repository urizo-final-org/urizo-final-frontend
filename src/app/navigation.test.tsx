import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { AppNavigation } from './navigation'
import { routesForRole } from './routes'

test.each(['GENERAL_ADMIN', 'SUPER_ADMIN'] as const)('settings is hidden only from navigation for %s', (role) => {
  const view = render(<AppNavigation activeRoute="home" role={role} onNavigate={vi.fn()} />)
  expect(screen.queryByRole('button', { name: /^설정/ })).not.toBeInTheDocument()
  view.rerender(<AppNavigation activeRoute="home" role={role} onNavigate={vi.fn()} compact />)
  expect(screen.queryByRole('button', { name: /^설정/ })).not.toBeInTheDocument()
  expect(routesForRole(role).find((route) => route.id === 'settings')?.path).toBe('/admin/settings')
  if (role === 'SUPER_ADMIN') {
    expect(screen.getByRole('button', { name: '시스템 설정' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '사이트 관리' })).toBeInTheDocument()
  } else {
    expect(screen.queryByRole('button', { name: '시스템 설정' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '사이트 관리' })).not.toBeInTheDocument()
  }
})

function show(badges?: Parameters<typeof AppNavigation>[0]['badges']) {
  return render(
    <AppNavigation activeRoute="home" role="SUPER_ADMIN" onNavigate={vi.fn()} badges={badges} />,
  )
}

test('a menu without badges shows none', () => {
  show()
  expect(screen.queryByLabelText(/승인 대기/)).not.toBeInTheDocument()
})

test('a pending count reaches the RAG menu before the page is opened', () => {
  show({ rag: { count: 2, title: '승인 대기 2건' } })
  const badge = screen.getByLabelText('승인 대기 2건')
  expect(badge).toHaveTextContent('2')
  // 뱃지는 해당 메뉴 안에 있어야 한다 — 다른 항목에 붙으면 잘못된 곳을 가리킨다.
  expect(badge.closest('button')).toHaveTextContent('RAG 관리')
})

/** 0을 그리면 "볼 게 없다"가 "0건 있다"로 보인다. 없을 때는 아무것도 그리지 않는다. */
test('a zero count draws nothing', () => {
  show({ rag: { count: 0, title: '승인 대기 0건' } })
  expect(screen.queryByLabelText(/승인 대기/)).not.toBeInTheDocument()
})

test('compact navigation retains accessible labels and opens icons from a collapsed group', () => {
  const onNavigate = vi.fn()
  const view = render(<AppNavigation activeRoute="models" role="SUPER_ADMIN" onNavigate={onNavigate} />)
  fireEvent.click(screen.getByRole('button', { name: 'AI 운영' }))
  expect(screen.queryByRole('button', { name: 'Agent 설정' })).not.toBeInTheDocument()
  view.rerender(<AppNavigation activeRoute="models" role="SUPER_ADMIN" onNavigate={onNavigate} compact />)
  const agentSettings = screen.getByRole('button', { name: 'Agent 설정' })
  expect(agentSettings).toHaveAttribute('title', 'Agent 설정')
  fireEvent.click(agentSettings)
  expect(onNavigate).toHaveBeenCalledWith('models')
})

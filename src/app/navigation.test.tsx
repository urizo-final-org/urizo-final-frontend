import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { AppNavigation } from './navigation'

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

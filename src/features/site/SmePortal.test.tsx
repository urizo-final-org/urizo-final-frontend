import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, test } from 'vitest'
import { SmePortal } from './SmePortal'

test('the sme home offers the hero search and the eight field tabs', () => {
  render(<MemoryRouter initialEntries={['/sme']}><SmePortal routePath="/" /></MemoryRouter>)

  expect(screen.getByRole('heading', { name: /우리 회사에 맞는 지원사업/ })).toBeInTheDocument()
  expect(screen.getByLabelText('지원사업 검색')).toBeInTheDocument()
  const tabs = screen.getByRole('navigation', { name: '분야별 검색' })
  expect(tabs.querySelectorAll('a')).toHaveLength(8)
  expect(screen.getByRole('link', { name: '경영' })).toHaveAttribute('href', '/sme/search?category=management')
})

// 검색 화면은 관광과 같은 골격(PortalSearch)에 도메인 상수만 갈아 끼운다.
test('the sme search page shows the domain tabs and placeholder', () => {
  render(<MemoryRouter initialEntries={['/sme/search']}><SmePortal routePath="/search" /></MemoryRouter>)

  expect(screen.getByPlaceholderText(/청년 창업, 수출 바우처/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '금융' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '숙박' })).not.toBeInTheDocument()
})

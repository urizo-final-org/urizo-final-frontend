import { fireEvent, render, screen } from '@testing-library/react'
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

// 실제 회귀: ChatWidget이 도메인 프롭 없이도 렌더돼 챗봇 제목·인사말이 "관광 도우미"로
// 고정돼 있었다(9/12 로컬 화면 확인으로 발견). 추천 질문만 도메인화하고 위젯 자체의
// 제목·인사말·툴팁을 빠뜨리면 /sme에서도 관광 챗봇처럼 보인다.
test('the floating chat widget speaks the sme domain, not tourism', () => {
  render(<MemoryRouter initialEntries={['/sme']}><SmePortal routePath="/" /></MemoryRouter>)

  fireEvent.click(screen.getByLabelText('지원사업 도우미 열기'))
  expect(screen.getByLabelText('지원사업 도우미')).toBeInTheDocument()
  expect(screen.getByText('지원사업 도우미')).toBeInTheDocument()
  expect(screen.getByText('AI 사업 안내')).toBeInTheDocument()
  expect(screen.getByText(/청년 창업, 수출 바우처처럼 지원사업에 대해/)).toBeInTheDocument()
  expect(screen.queryByText(/관광 도우미/)).not.toBeInTheDocument()
  expect(screen.queryByText(/전주 한옥스테이/)).not.toBeInTheDocument()
})

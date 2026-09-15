import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { SmePortal } from './SmePortal'
import { portalProjectKey } from './portal-projects'

/** 다른 팀원 PC의 고객사 UUID. 이 브라우저에는 기록이 없다. */
const VISITING = '3f2a10c4-9b77-4e31-8d05-27c6a1e4bb90'

function Location() {
  const location = useLocation()
  return <output aria-label="현재 주소">{location.pathname}{location.search}</output>
}

afterEach(() => {
  window.localStorage.removeItem(portalProjectKey('sme'))
  vi.restoreAllMocks()
})

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

// 실제 회귀(검토 보고 9/14): localStorage가 빈 새 브라우저로 딥링크를 열면, 검색이든 분야
// 이동이든 한 번만 움직여도 URL에서 project가 사라지고 작성자 PC의 상수 UUID로 바뀌었다.
// 다른 PC에는 없는 고객사라 조회가 실패하거나, 있으면 남의 고객사 답변을 보여줬다.
test('a deep-linked customer survives home search and field tabs', () => {
  render(<MemoryRouter initialEntries={[`/sme?project=${VISITING}`]}>
    <SmePortal routePath="/" /><Location />
  </MemoryRouter>)

  expect(screen.getByRole('link', { name: '경영' }))
    .toHaveAttribute('href', `/sme/search?category=management&project=${VISITING}`)

  fireEvent.change(screen.getByLabelText('지원사업 검색'), { target: { value: '청년 창업' } })
  fireEvent.click(screen.getByRole('button', { name: '검색' }))
  expect(screen.getByLabelText('현재 주소'))
    .toHaveTextContent(`/sme/search?${new URLSearchParams({ q: '청년 창업', project: VISITING })}`)
})

// URL만 맞고 요청이 틀리면 화면은 조용히 남의 고객사를 답한다. 나가는 요청까지 본다.
test('the search request carries the deep-linked customer, not a built-in default', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ answer: '', citations: [], results: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }))

  render(<MemoryRouter initialEntries={[`/sme/search?q=수출&project=${VISITING}`]}>
    <SmePortal routePath="/search" />
  </MemoryRouter>)

  await waitFor(() => expect(fetcher).toHaveBeenCalled())
  const sent = JSON.parse(String(fetcher.mock.calls[0][1]?.body))
  expect(sent.projectId).toBe(VISITING)
})

// 연결을 확인할 수 없으면 아무 고객사나 고르지 않는다 — 서버의 기본 챗봇 경로가 남는다.
test('an unlinked visit sends no projectId at all', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ answer: '', citations: [], results: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }))

  render(<MemoryRouter initialEntries={['/sme/search?q=수출']}>
    <SmePortal routePath="/search" />
  </MemoryRouter>)

  await waitFor(() => expect(fetcher).toHaveBeenCalled())
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).not.toHaveProperty('projectId')
})

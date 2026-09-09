import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { PortalResultCard } from './PortalResultCard'

const base = { title: '전주 한지 축제', excerpt: '[개요] 한지 공예 체험 축제' }

test('an ENDED event carries a factual chip and stays in the results', () => {
  render(<PortalResultCard {...base} eventStatus="ENDED" />)
  // 결과에서 빼지 않는다 — 지난 행사도 참고 정보다. 칩은 사실 표시이지 경고가 아니다.
  expect(screen.getByText('종료된 행사')).toBeInTheDocument()
  expect(screen.getByText('전주 한지 축제')).toBeInTheDocument()
})

test('a null or missing eventStatus renders no chip', () => {
  const { rerender } = render(<PortalResultCard {...base} eventStatus={null} />)
  expect(screen.queryByText('종료된 행사')).not.toBeInTheDocument()
  rerender(<PortalResultCard {...base} />)
  expect(screen.queryByText('종료된 행사')).not.toBeInTheDocument()
})

test('an unknown eventStatus value renders nothing rather than a guessed label', () => {
  // 계약은 'ENDED' | null이지만 string으로 온다 — 모르는 값은 조용히 무시한다.
  render(<PortalResultCard {...base} eventStatus="UPCOMING" />)
  expect(screen.queryByText('종료된 행사')).not.toBeInTheDocument()
  expect(screen.queryByText('UPCOMING')).not.toBeInTheDocument()
})

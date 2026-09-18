import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import MeasuredTokens from './MeasuredTokens'

afterEach(cleanup)
test('partial evidence is labelled while measured zero remains zero', () => {
  const view = render(<MeasuredTokens value={103811} known={17} calls={18} />)
  expect(screen.getByText('103,811')).toBeInTheDocument()
  expect(screen.getByText('부분 합계 · 17/18회 수집')).toBeInTheDocument()
  view.rerender(<MeasuredTokens value={null} known={0} calls={18} />)
  expect(screen.getByText('미수집')).toBeInTheDocument()
  view.rerender(<MeasuredTokens value={0} known={18} calls={18} />)
  expect(screen.getByText('0')).toBeInTheDocument()
  expect(screen.getByText('18/18회 수집')).toBeInTheDocument()
})

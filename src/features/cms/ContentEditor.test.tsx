import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import ContentEditor from './ContentEditor'
import { CmsApi } from './api'

const body = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: '본문' }] }],
})

test('커서에서 켠 글자 서식을 다음 툴바 명령이 지우지 않는다', async () => {
  const api = new CmsApi('test-session', vi.fn(), vi.fn())
  render(<ContentEditor value={body} onChange={vi.fn()} api={api} onFailure={vi.fn()} />)

  const bold = await screen.findByRole('button', { name: '굵게' })
  const underline = screen.getByRole('button', { name: '밑줄' })
  const strike = screen.getByRole('button', { name: '취소선' })

  fireEvent.click(bold)
  fireEvent.click(underline)
  fireEvent.click(strike)

  expect(bold).toHaveAttribute('aria-pressed', 'true')
  expect(underline).toHaveAttribute('aria-pressed', 'true')
  expect(strike).toHaveAttribute('aria-pressed', 'true')
})

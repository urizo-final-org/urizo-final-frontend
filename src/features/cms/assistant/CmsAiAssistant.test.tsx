import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import CmsAiAssistant from './CmsAiAssistant'
import type { NaturalCmsApi } from './api'

it.each(['menus', 'contents', 'boards', 'templates'] as const)(
  '%s provides a larger resizable request input without submitting while typing', (route) => {
    const createJob = vi.fn()
    render(<CmsAiAssistant route={route} target={null} candidates={[]} menus={[]}
      onTarget={vi.fn()} api={{ createJob } as unknown as NaturalCmsApi}
      collapsed={false} onToggle={vi.fn()} />)
    const input = screen.getByRole('textbox', { name: '자연어 요청' })
    expect(input).toHaveAttribute('rows', '10')
    expect(input).toHaveClass('min-h-56', 'resize-y', 'leading-relaxed')
    const request = '첫 번째 변경 요청\n두 번째 변경 요청\n세 번째 변경 요청'
    fireEvent.change(input, { target: { value: request } })
    expect(input).toHaveValue(request)
    expect(createJob).not.toHaveBeenCalled()
  },
)

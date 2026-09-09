import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import ContentEditor from './ContentEditor'
import { CmsApi } from './api'

const body = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: '본문' }] }],
})

function open() {
  const api = new CmsApi('test-session', vi.fn(), vi.fn())
  const onChange = vi.fn()
  render(<ContentEditor value={body} onChange={onChange} api={api} onFailure={vi.fn()} />)
  return onChange
}

/** 마지막으로 넘어간 문서. 서식이 실제로 문서에 붙었는지 본다. */
function saved(onChange: ReturnType<typeof vi.fn>) {
  return String(onChange.mock.calls.at(-1)?.[0] ?? '')
}

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

/**
 * `AI05-017` 2차. 고른 색이 편집기에 걸리는지 본다.
 *
 * 커서만 있을 때는 다음에 칠 글자에 걸어 두는 것이라 문서가 아직 바뀌지 않는다. 그래서
 * 문서 대신 단추의 눌린 상태로 확인한다.
 */
test('고른 글자색과 형광펜이 편집기에 걸린다', async () => {
  open()

  const text = await screen.findByRole('button', { name: '글자색' })
  const marker = screen.getByRole('button', { name: '형광펜' })
  expect(text).toHaveAttribute('aria-pressed', 'false')

  fireEvent.click(text)
  fireEvent.click(screen.getByRole('button', { name: '빨강' }))
  fireEvent.click(marker)
  fireEvent.click(screen.getByRole('button', { name: '노랑' }))

  expect(text).toHaveAttribute('aria-pressed', 'true')
  expect(marker).toHaveAttribute('aria-pressed', 'true')
})

test('인용문을 켜면 문단이 인용문이 된다', async () => {
  const onChange = open()

  const quote = await screen.findByRole('button', { name: '인용문' })
  fireEvent.click(quote)

  expect(quote).toHaveAttribute('aria-pressed', 'true')
  expect(saved(onChange)).toContain('"blockquote"')
})

/**
 * 인용문 안에서는 구분선을 막는다.
 *
 * 넣고 나면 지울 방법이 마땅치 않아 커서가 갇힌다. 들어간 뒤에 고치는 것보다 못 넣게 하는
 * 편이 낫다는 판단을 코드가 지키게 한다.
 */
test('인용문 안에서는 구분선을 넣을 수 없다', async () => {
  open()

  const divider = await screen.findByRole('button', { name: '구분선' })
  expect(divider).toBeEnabled()

  fireEvent.click(screen.getByRole('button', { name: '인용문' }))
  expect(divider).toBeDisabled()
})

// 링크 글자 안에서 구분선과 색을 막는 것은 여기서 확인하지 못한다. 편집기가 문서를 받으면
// 커서를 맨 앞에 두는데 그 자리는 링크 밖이고, 커서를 링크 안으로 옮길 방법이 없다.
// 브라우저에서 사람이 확인한다.

/** `AI05-018` 3차. 소스 편집은 모드를 바꾸는 것이라 화면 상태로 확인한다. */
test('소스 편집을 열면 HTML이 보이고 서식 단추가 잠긴다', async () => {
  open()

  const toggle = await screen.findByRole('button', { name: '소스 편집' })
  expect(screen.getByRole('button', { name: '굵게' })).toBeEnabled()

  fireEvent.click(toggle)

  const area = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'HTML 소스' })
  expect(area.value).toContain('<p>본문</p>')
  expect(toggle).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: '굵게' })).toBeDisabled()
})

test('소스를 고치고 닫으면 본문에 반영된다', async () => {
  const onChange = open()

  fireEvent.click(await screen.findByRole('button', { name: '소스 편집' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'HTML 소스' }), {
    target: { value: '<h2>새 제목</h2><p>새 본문</p>' },
  })
  fireEvent.click(screen.getByRole('button', { name: '소스 편집' }))

  expect(saved(onChange)).toContain('"heading"')
  expect(saved(onChange)).toContain('새 제목')
})

/** 조용히 사라지면 붙여넣은 글이 반쯤 없어진 것을 나중에 발견한다. */
test('넣을 수 없는 부분이 있으면 무엇이 빠졌는지 알린다', async () => {
  const api = new CmsApi('test-session', vi.fn(), vi.fn())
  const onFailure = vi.fn()
  render(<ContentEditor value={body} onChange={vi.fn()} api={api} onFailure={onFailure} />)

  fireEvent.click(await screen.findByRole('button', { name: '소스 편집' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'HTML 소스' }), {
    target: { value: '<p>본문</p><table><tr><td>표</td></tr></table>' },
  })
  fireEvent.click(screen.getByRole('button', { name: '소스 편집' }))

  expect(onFailure).toHaveBeenCalledWith(expect.stringContaining('<table>'))
})

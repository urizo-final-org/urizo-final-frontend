import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { ContentDocument } from './contentDocument'

function document(...nodes: unknown[]) {
  return JSON.stringify({ type: 'doc', content: nodes })
}

function paragraph(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] }
}

test('제목·문단·목록을 사이트 본문 모양으로 그린다', () => {
  render(<ContentDocument body={document(
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '회사 소개' }] },
    paragraph('우리는 바이오 기업입니다.'),
    { type: 'bulletList', content: [
      { type: 'listItem', content: [paragraph('첫째')] },
      { type: 'listItem', content: [paragraph('둘째')] },
    ] },
  )} />)

  expect(screen.getByRole('heading', { level: 2, name: '회사 소개' })).toBeInTheDocument()
  expect(screen.getByText('우리는 바이오 기업입니다.')).toBeInTheDocument()
  expect(screen.getByText('첫째')).toBeInTheDocument()
  expect(screen.getByText('둘째')).toBeInTheDocument()
})

test('굵게·기울임 서식을 글자에 붙인다', () => {
  render(<ContentDocument body={document({ type: 'paragraph', content: [
    { type: 'text', text: '보통 ' },
    { type: 'text', text: '굵게', marks: [{ type: 'bold' }] },
    { type: 'text', text: '기울임', marks: [{ type: 'italic' }] },
  ] })} />)

  expect(screen.getByText('굵게').tagName).toBe('STRONG')
  expect(screen.getByText('기울임').tagName).toBe('EM')
})

/** `AI05-017`에서 연 둘. 편집기가 만들어도 렌더러가 모르면 사이트에서 조용히 사라진다. */
test('취소선·밑줄 서식을 글자에 붙인다', () => {
  render(<ContentDocument body={document({ type: 'paragraph', content: [
    { type: 'text', text: '취소선', marks: [{ type: 'strike' }] },
    { type: 'text', text: '밑줄', marks: [{ type: 'underline' }] },
  ] })} />)

  expect(screen.getByText('취소선').tagName).toBe('S')
  expect(screen.getByText('밑줄').tagName).toBe('U')
})

/** 바깥으로 나가는 링크는 새 창으로 열고 참조자를 넘기지 않는다. */
test('사이트 안 링크와 바깥 링크를 다르게 연다', () => {
  render(<ContentDocument body={document(
    { type: 'paragraph', content: [{ type: 'text', text: '안내', marks: [
      { type: 'link', attrs: { href: '/about' } }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: '바깥', marks: [
      { type: 'link', attrs: { href: 'https://example.test' } }] }] },
  )} />)

  expect(screen.getByRole('link', { name: '안내' })).not.toHaveAttribute('target')
  const external = screen.getByRole('link', { name: '바깥' })
  expect(external).toHaveAttribute('target', '_blank')
  expect(external).toHaveAttribute('rel', expect.stringContaining('noopener'))
})

test('이미지를 대체 텍스트와 함께 그린다', () => {
  render(<ContentDocument body={document(
    { type: 'image', attrs: { src: '/api/site/images/12', alt: '회사 전경' } },
  )} />)

  expect(screen.getByRole('img', { name: '회사 전경' }))
    .toHaveAttribute('src', '/api/site/images/12')
})

/**
 * 모르는 부품은 그리지 않는다.
 *
 * 서버가 저장 전에 막지만 읽는 쪽에도 같은 선을 둔다. 옛 본문이나 손으로 넣은 값이 들어와도
 * 화면에 나타나지 않는다.
 */
test('아는 부품만 그리고 모르는 것은 건너뛴다', () => {
  render(<ContentDocument body={document(
    { type: 'table', content: [paragraph('표 안의 글')] },
    paragraph('정상 문단'),
  )} />)

  expect(screen.getByText('정상 문단')).toBeInTheDocument()
  expect(screen.queryByText('표 안의 글')).not.toBeInTheDocument()
})

test('문서가 아니면 빈 화면 대신 받은 글자를 보여준다', () => {
  render(<ContentDocument body="## 아직 변환되지 않은 본문" />)

  expect(screen.getByText('## 아직 변환되지 않은 본문')).toBeInTheDocument()
})

/** `AI05-017` 2차. 노드 둘은 속성이 없어 태그만 확인하면 된다. */
test('인용문과 구분선을 그린다', () => {
  render(<ContentDocument body={document(
    { type: 'blockquote', content: [{ type: 'paragraph', content: [
      { type: 'text', text: '인용한 말' }] }] },
    { type: 'horizontalRule' },
  )} />)

  expect(screen.getByText('인용한 말').closest('blockquote')).not.toBeNull()
  expect(screen.getByRole('separator')).toBeInTheDocument()
})

/** 색은 팔레트에 있는 값만 그린다. 목록 밖이면 색 없이 글자만 남긴다. */
test('팔레트 색만 글자에 입힌다', () => {
  render(<ContentDocument body={document({ type: 'paragraph', content: [
    { type: 'text', text: '빨강', marks: [{ type: 'textStyle', attrs: { color: '#c0392b' } }] },
    { type: 'text', text: '형광', marks: [{ type: 'highlight', attrs: { color: '#fff3a3' } }] },
    { type: 'text', text: '몰래', marks: [{ type: 'textStyle', attrs: { color: 'red' } }] },
  ] })} />)

  expect(screen.getByText('빨강')).toHaveStyle({ color: '#c0392b' })
  expect(screen.getByText('형광').tagName).toBe('MARK')
  expect(screen.getByText('몰래').tagName).not.toBe('SPAN')
})

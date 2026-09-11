import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import CmsWorkspace from './CmsWorkspace'
import { CmsApi } from './api'
import type { NaturalCmsApi } from './assistant/api'

vi.mock('./assistant/CmsAiAssistant', async (original) => ({
  ...await original<object>(),
  default: ({ target, onUploadImage }: { target?: { id: string }; onUploadImage?: unknown }) =>
    <div data-testid="assistant-target">{target?.id}:{onUploadImage ? 'images-enabled' : 'no-images'}</div>,
}))
vi.mock('./ContentEditor', () => ({ default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) =>
  <textarea aria-label="문서 편집기" value={value} onChange={(event) => onChange(event.target.value)} /> }))

test('manual post and Natural CMS target share rich document, separate thumbnail and optional codes', async () => {
  const api = new CmsApi('test', vi.fn(), vi.fn())
  const board = { id: 3, name: '여행 소식', description: '여행', displayType: 'CARD' as const, regionGroupKey: 'REGION', categoryGroupKey: null, createdAt: '2026-09-11', updatedAt: '2026-09-11' }
  vi.spyOn(api, 'boards').mockResolvedValue([board])
  vi.spyOn(api, 'menus').mockResolvedValue([])
  vi.spyOn(api, 'posts').mockResolvedValue([])
  vi.spyOn(api, 'codeGroups').mockResolvedValue([{ key: 'REGION', label: '지역', displayOrder: 0, enabled: true }])
  vi.spyOn(api, 'codes').mockResolvedValue([{ id: 7, groupKey: 'REGION', value: 'SEOUL', label: '서울', displayOrder: 0, enabled: true }])
  vi.spyOn(api, 'uploadImage').mockResolvedValue({ id: 42, byteSize: 12, contentType: 'image/png' })
  const create = vi.spyOn(api, 'createPost').mockResolvedValue({ id: 99, boardId: 3, authorId: 'user', authorName: 'user', title: '샘플', body: '{}', createdAt: '2026-09-11', updatedAt: '2026-09-11' })
  render(<CmsWorkspace route="boards" api={api} assistantApi={{} as NaturalCmsApi} />)
  fireEvent.click(await screen.findByRole('button', { name: /여행 소식/ }))
  fireEvent.click(await screen.findByRole('button', { name: '새 게시물' }))
  expect(screen.getByTestId('assistant-target')).toHaveTextContent('board:3:post:new:images-enabled')
  expect(screen.queryByLabelText('분류')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('지역'), { target: { value: '7' } })
  fireEvent.change(screen.getByLabelText('제목'), { target: { value: '호숫길 이야기' } })
  const document = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"산책"}]}]}'
  fireEvent.change(screen.getByLabelText('문서 편집기'), { target: { value: document } })
  fireEvent.change(screen.getByLabelText('대표 이미지 업로드'), { target: { files: [new File(['png'], 'sample.png', { type: 'image/png' })] } })
  await screen.findByRole('button', { name: '대표 이미지 해제' })
  fireEvent.change(screen.getByLabelText('대표 이미지 설명'), { target: { value: '샘플 풍경' } })
  const form = screen.getByLabelText('제목').closest('form')!
  fireEvent.click(within(form).getByRole('button', { name: '저장하기' }))
  await waitFor(() => expect(create).toHaveBeenCalledWith(3, { title: '호숫길 이야기', body: document, thumbnailImageId: 42, thumbnailAlt: '샘플 풍경', regionCodeId: 7, categoryCodeId: null }))
})

function pagedBoardApi(count = 31) {
  const api = new CmsApi('test', vi.fn(), vi.fn())
  const boards = [1, 2].map((id) => ({ id, name: `게시판 ${id}`, description: '', displayType: 'LIST' as const, createdAt: '2026-09-11', updatedAt: '2026-09-11' }))
  const posts = Array.from({ length: count }, (_, index) => ({
    id: index + 1, boardId: 1, authorId: 'user', authorName: 'user',
    title: `글 ${index + 1}`, body: `본문 ${index + 1}`, createdAt: '2026-09-11', updatedAt: '2026-09-11',
  }))
  vi.spyOn(api, 'boards').mockResolvedValue(boards)
  vi.spyOn(api, 'menus').mockResolvedValue([])
  vi.spyOn(api, 'codeGroups').mockResolvedValue([])
  vi.spyOn(api, 'codes').mockResolvedValue([])
  vi.spyOn(api, 'posts').mockResolvedValue(posts)
  return { api, posts }
}

test('post list pages ten rows and folding or paging preserves the editor and assistant target', async () => {
  const { api } = pagedBoardApi()
  render(<CmsWorkspace route="boards" api={api} assistantApi={{} as NaturalCmsApi} />)
  fireEvent.click(await screen.findByRole('button', { name: '게시판 1' }))
  const list = within(await screen.findByRole('region', { name: '게시물 목록' }))
  await list.findByText('글 1')
  expect(list.getAllByRole('button', { name: /^글 / })).toHaveLength(10)
  expect(list.getByRole('button', { name: '이전' })).toBeDisabled()
  fireEvent.click(list.getByText('글 1'))
  fireEvent.change(screen.getByLabelText('제목'), { target: { value: '작성 중인 제목' } })
  fireEvent.change(screen.getByLabelText('문서 편집기'), { target: { value: '작성 중인 본문' } })
  fireEvent.click(list.getByRole('button', { name: '게시물 접기' }))
  expect(list.getByRole('button', { name: '게시물 펼치기' })).toHaveAttribute('aria-expanded', 'false')
  expect(list.queryByRole('navigation', { name: '게시물 페이지' })).not.toBeInTheDocument()
  expect(screen.getByLabelText('제목')).toHaveValue('작성 중인 제목')
  fireEvent.click(list.getByRole('button', { name: '게시물 펼치기' }))
  fireEvent.click(list.getByRole('button', { name: '게시물 4페이지' }))
  expect(list.getAllByRole('button', { name: /^글 / })).toHaveLength(1)
  expect(list.getByRole('button', { name: '다음' })).toBeDisabled()
  expect(screen.getByLabelText('제목')).toHaveValue('작성 중인 제목')
  expect(screen.getByLabelText('문서 편집기')).toHaveValue('작성 중인 본문')
  expect(screen.getByTestId('assistant-target')).toHaveTextContent('board:1:post:1:images-enabled')
  expect(api.posts).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '게시판 2' }))
  await waitFor(() => expect(list.getByRole('button', { name: '게시물 1페이지' })).toHaveAttribute('aria-current', 'page'))
})

test('empty post list can fold and keeps the create action without a pager', async () => {
  const { api } = pagedBoardApi(0)
  render(<CmsWorkspace route="boards" api={api} assistantApi={{} as NaturalCmsApi} />)
  fireEvent.click(await screen.findByRole('button', { name: '게시판 1' }))
  const list = within(await screen.findByRole('region', { name: '게시물 목록' }))
  expect(await list.findByText('게시물이 없습니다')).toBeVisible()
  expect(list.queryByRole('navigation')).not.toBeInTheDocument()
  fireEvent.click(list.getByRole('button', { name: '게시물 접기' }))
  fireEvent.click(list.getByRole('button', { name: '새 게시물' }))
  expect(screen.getByTestId('assistant-target')).toHaveTextContent('board:1:post:new:images-enabled')
})

test('deleting the only post on the last page returns to the last remaining page', async () => {
  const { api, posts } = pagedBoardApi(11)
  vi.mocked(api.posts).mockResolvedValueOnce(posts).mockResolvedValue(posts.slice(0, 10))
  vi.spyOn(api, 'deletePost').mockResolvedValue(undefined)
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<CmsWorkspace route="boards" api={api} assistantApi={{} as NaturalCmsApi} />)
  fireEvent.click(await screen.findByRole('button', { name: '게시판 1' }))
  const list = within(await screen.findByRole('region', { name: '게시물 목록' }))
  fireEvent.click(await list.findByRole('button', { name: '게시물 2페이지' }))
  fireEvent.click(list.getByText('글 11'))
  fireEvent.click(within(screen.getByLabelText('제목').closest('form')!).getByRole('button', { name: '삭제' }))
  await waitFor(() => expect(list.getByRole('button', { name: '게시물 1페이지' })).toHaveAttribute('aria-current', 'page'))
  expect(list.queryByRole('button', { name: '게시물 2페이지' })).not.toBeInTheDocument()
  expect(list.getAllByRole('button', { name: /^글 / })).toHaveLength(10)
  confirm.mockRestore()
})

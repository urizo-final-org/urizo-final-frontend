import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import CmsWorkspace from './CmsWorkspace'
import { CmsApi } from './api'
import type { NaturalCmsApi } from './assistant/api'

/**
 * `새 ○○` 버튼은 폼을 비우는 것이 아니라 **등록하겠다고 선언**하는 자리다.
 *
 * 대상이 비면 `메뉴 만들어줘`가 화면 범위 밖으로 거부된다. 반대로 저장·삭제 뒤에도 대상이
 * 등록으로 남으면 사람이 고르지 않은 등록이 계속 켜져 있다. 두 경로를 갈라 둘 다 고정한다.
 */
vi.mock('./assistant/CmsAiAssistant', async (original) => ({
  ...await original<object>(),
  default: ({ target }: { target?: { id: string } }) =>
    <div data-testid="assistant-target">{target ? target.id : 'none'}</div>,
}))
vi.mock('./ContentEditor', () => ({ default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) =>
  <textarea aria-label="문서 편집기" value={value} onChange={(event) => onChange(event.target.value)} /> }))

const siteSettingsApi = { sites: vi.fn(), saveSite: vi.fn() }
const assistantApi = {} as NaturalCmsApi

function menuApi() {
  const api = new CmsApi('test', vi.fn(), vi.fn())
  vi.spyOn(api, 'menus').mockResolvedValue([
    { id: 1, name: '여행 가이드', path: '/about', parentId: null, displayOrder: 10, targetType: 'NONE', targetId: null },
  ])
  vi.spyOn(api, 'contents').mockResolvedValue([])
  vi.spyOn(api, 'boards').mockResolvedValue([])
  return api
}

test('메뉴 화면의 `새 메뉴`는 고른 것이 없어도 보이고 대상을 등록으로 옮긴다', async () => {
  const api = menuApi()
  render(<CmsWorkspace route="menus" api={api} assistantApi={assistantApi} siteSettingsApi={siteSettingsApi} />)

  /* 아무것도 고르지 않은 첫 화면에서도 버튼이 있어야 한다. 예전에는 수정 중일 때만 나왔다. */
  const button = await screen.findByRole('button', { name: '새 메뉴' })
  expect(screen.getByTestId('assistant-target')).toHaveTextContent('none')

  fireEvent.click(button)
  expect(screen.getByTestId('assistant-target')).toHaveTextContent('new')
})

test('메뉴를 저장하면 대상이 등록으로 남지 않는다', async () => {
  const api = menuApi()
  const create = vi.spyOn(api, 'createMenu').mockResolvedValue({
    id: 2, name: '짐 싸기 요령', path: '/services/packing', parentId: null, displayOrder: 0, targetType: 'NONE', targetId: null,
  })
  render(<CmsWorkspace route="menus" api={api} assistantApi={assistantApi} siteSettingsApi={siteSettingsApi} />)

  fireEvent.click(await screen.findByRole('button', { name: '새 메뉴' }))
  expect(screen.getByTestId('assistant-target')).toHaveTextContent('new')

  fireEvent.change(screen.getByLabelText('메뉴명'), { target: { value: '짐 싸기 요령' } })
  fireEvent.change(screen.getByLabelText('URL 경로'), { target: { value: '/services/packing' } })
  const form = screen.getByLabelText('메뉴명').closest('form')!
  fireEvent.click(within(form).getByRole('button', { name: '저장하기' }))

  await waitFor(() => expect(create).toHaveBeenCalled())
  await waitFor(() => expect(screen.getByTestId('assistant-target')).toHaveTextContent('none'))
})

test('게시판 화면의 `새 게시판`은 대상을 등록으로 옮긴다', async () => {
  const api = new CmsApi('test', vi.fn(), vi.fn())
  const board = { id: 3, name: '자료실', description: '서식', displayType: 'LIST' as const, regionGroupKey: null, categoryGroupKey: null, createdAt: '2026-09-14', updatedAt: '2026-09-14' }
  vi.spyOn(api, 'boards').mockResolvedValue([board])
  vi.spyOn(api, 'menus').mockResolvedValue([])
  vi.spyOn(api, 'posts').mockResolvedValue([])
  vi.spyOn(api, 'codeGroups').mockResolvedValue([])
  vi.spyOn(api, 'codes').mockResolvedValue([])
  render(<CmsWorkspace route="boards" api={api} assistantApi={assistantApi} siteSettingsApi={siteSettingsApi} />)

  fireEvent.click(await screen.findByRole('button', { name: /자료실/ }))
  await waitFor(() => expect(screen.getByTestId('assistant-target')).toHaveTextContent('3'))

  fireEvent.click(screen.getByRole('button', { name: '새 게시판' }))
  expect(screen.getByTestId('assistant-target')).toHaveTextContent('new')
})

test('게시판을 삭제하면 대상이 등록으로 남지 않는다', async () => {
  const api = new CmsApi('test', vi.fn(), vi.fn())
  const board = { id: 3, name: '자료실', description: '서식', displayType: 'LIST' as const, regionGroupKey: null, categoryGroupKey: null, createdAt: '2026-09-14', updatedAt: '2026-09-14' }
  vi.spyOn(api, 'boards').mockResolvedValueOnce([board]).mockResolvedValue([])
  vi.spyOn(api, 'menus').mockResolvedValue([])
  vi.spyOn(api, 'posts').mockResolvedValue([])
  vi.spyOn(api, 'codeGroups').mockResolvedValue([])
  vi.spyOn(api, 'codes').mockResolvedValue([])
  const remove = vi.spyOn(api, 'deleteBoard').mockResolvedValue(undefined)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<CmsWorkspace route="boards" api={api} assistantApi={assistantApi} siteSettingsApi={siteSettingsApi} />)

  fireEvent.click(await screen.findByRole('button', { name: /자료실/ }))
  await waitFor(() => expect(screen.getByTestId('assistant-target')).toHaveTextContent('3'))

  fireEvent.click(screen.getByRole('button', { name: '삭제' }))
  await waitFor(() => expect(remove).toHaveBeenCalledWith(3))
  /* 삭제 직후 `새 게시판 만들기`가 켜져 있으면 사람이 고르지 않은 등록이 대상이 된다. */
  await waitFor(() => expect(screen.getByTestId('assistant-target')).toHaveTextContent('none'))
})

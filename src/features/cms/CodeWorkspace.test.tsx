import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import CodeWorkspace from './CodeWorkspace'
import { CmsApi } from './api'

function setup() {
  const api = new CmsApi('test', vi.fn(), vi.fn())
  const group = { key: 'REGION', label: '지역', displayOrder: 0, enabled: true }
  vi.spyOn(api, 'codeGroups').mockResolvedValue([group])
  vi.spyOn(api, 'codes').mockResolvedValue([{ id: 1, groupKey: 'REGION', value: 'SEOUL', label: '서울', displayOrder: 0, enabled: true }])
  const updateGroup = vi.spyOn(api, 'updateCodeGroup').mockResolvedValue(group)
  const updateCode = vi.spyOn(api, 'updateCode').mockResolvedValue({ id: 1, groupKey: 'REGION', value: 'SEOUL', label: '서울', displayOrder: 0, enabled: false })
  const createGroup = vi.spyOn(api, 'createCodeGroup').mockResolvedValue({ key: 'CATEGORY', label: '분류', displayOrder: 1, enabled: true })
  render(<CodeWorkspace api={api} />)
  return { updateGroup, updateCode, createGroup }
}

test('group key stays immutable while label and enabled state can change', async () => {
  const { updateGroup } = setup()
  fireEvent.click(await screen.findByRole('button', { name: /지역 REGION/ }))
  expect(screen.getByLabelText('그룹 키')).toBeDisabled()
  fireEvent.change(screen.getByLabelText('그룹명'), { target: { value: '여행 지역' } })
  fireEvent.click(screen.getByRole('button', { name: '코드 그룹 저장' }))
  await waitFor(() => expect(updateGroup).toHaveBeenCalledWith('REGION', { key: 'REGION', label: '여행 지역', displayOrder: 0, enabled: true }))
})

test('code value is preserved when a code is disabled instead of deleted', async () => {
  const { updateCode } = setup()
  fireEvent.click(await screen.findByRole('button', { name: /지역 REGION/ }))
  fireEvent.click(screen.getByRole('button', { name: /서울 SEOUL/ }))
  expect(screen.getByLabelText('코드 값')).toBeDisabled()
  fireEvent.click(screen.getByLabelText('코드 사용'))
  fireEvent.click(screen.getByRole('button', { name: '코드 저장' }))
  await waitFor(() => expect(updateCode).toHaveBeenCalledWith(1, { value: 'SEOUL', label: '서울', displayOrder: 0, enabled: false }))
  expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
})

test('new group uses the minimal code-management contract', async () => {
  const { createGroup } = setup()
  await screen.findByRole('button', { name: /지역 REGION/ })
  fireEvent.change(screen.getByLabelText('그룹 키'), { target: { value: 'CATEGORY' } })
  fireEvent.change(screen.getByLabelText('그룹명'), { target: { value: '분류' } })
  fireEvent.change(screen.getByLabelText('그룹 표시 순서'), { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: '코드 그룹 저장' }))
  await waitFor(() => expect(createGroup).toHaveBeenCalledWith({ key: 'CATEGORY', label: '분류', displayOrder: 1, enabled: true }))
})

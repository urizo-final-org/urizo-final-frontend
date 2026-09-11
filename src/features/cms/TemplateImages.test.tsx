import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { CmsApi, type ContentImage, type SiteTemplate } from './api'
import { Templates } from './CmsWorkspace'
import { TemplateBanner } from '../site/TourPortal'

const base: SiteTemplate = {
  key: 'BOLD', layout: 'MINIMAL', primaryColor: '#147d72', siteName: '바꾸지 않을 사이트명',
  headerText: 'Header', footerText: 'Footer', heroImageUrl: '/old.png', heroTitle: '메인 제목',
  heroSubtitle: '설명', heroButtonLabel: '자세히', heroButtonUrl: '/about', updatedAt: '',
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); window.localStorage.clear() })

function setup(images?: string[] | null) {
  const templates = ['BOLD', 'CLASSIC', 'MINIMAL'].map((key) => ({ ...base, key, heroImageUrls: images }))
  const api = new CmsApi('token', vi.fn(), vi.fn())
  vi.spyOn(api, 'templates').mockResolvedValue(templates)
  const save = vi.spyOn(api, 'saveTemplate').mockImplementation(async (value) => value)
  const upload = vi.spyOn(api, 'uploadImage').mockResolvedValue({ id: 8, contentType: 'image/png', byteSize: 20 })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(
    String(input).startsWith('/api/site/context') ? { key: 'main', name: '실제 사이트명', publicPath: '/', template: templates[0] } : [],
  ), { status: 200 })))
  render(<MemoryRouter><Templates api={api} siteSettingsApi={{ sites: vi.fn(), saveSite: vi.fn() }} /></MemoryRouter>)
  return { api, save, upload }
}
const png = (name = 'image.png') => new File(['image'], name, { type: 'image/png' })
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const image = (id: number): ContentImage => ({ id, contentType: 'image/png', byteSize: 10 })

test('uses numbered labels without editing site names and shows legacy static image dimensions', async () => {
  const { save } = setup()
  const thumbnail = await screen.findByRole('img', { name: '메인 이미지 1' })
  for (const label of ['템플릿 1', '템플릿 2', '템플릿 3']) expect(screen.getByRole('heading', { name: label })).toBeInTheDocument()
  Object.defineProperties(thumbnail, { naturalWidth: { value: 1920 }, naturalHeight: { value: 1080 } })
  fireEvent.load(thumbnail)
  expect(screen.getByText('1920 × 1080 px')).toBeInTheDocument()
  expect(screen.getByText('대표 이미지 · 현재 사용')).toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: /메인 대표 이미지 URL/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '템플릿 저장' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ siteName: base.siteName })))
})

test('reorders and detaches links, saves the first URL and allows an explicit empty list', async () => {
  const { save, upload } = setup(['/one.png', '/two.png'])
  await screen.findByRole('img', { name: '메인 이미지 2' })
  fireEvent.click(screen.getByRole('button', { name: '이미지 2 앞으로' }))
  expect(screen.getByRole('img', { name: '메인 이미지 1' })).toHaveAttribute('src', '/two.png')
  fireEvent.click(screen.getByRole('button', { name: '템플릿 저장' }))
  await waitFor(() => expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ heroImageUrl: '/two.png', heroImageUrls: ['/two.png', '/one.png'] })))
  await waitFor(() => expect(screen.getByRole('button', { name: '이미지 1 연결 해제' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '이미지 1 연결 해제' }))
  fireEvent.click(screen.getByRole('button', { name: '이미지 1 연결 해제' }))
  expect(screen.getByText('등록된 이미지가 없습니다.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '템플릿 저장' }))
  await waitFor(() => expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ heroImageUrl: '', heroImageUrls: [] })))
  expect(upload).not.toHaveBeenCalled()
})

test('uploads in selection order, blocks duplicate upload and save, and appends without losing text edits', async () => {
  const { upload, save } = setup()
  const first = deferred<ContentImage>()
  const second = deferred<ContentImage>()
  upload.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const input = await screen.findByLabelText('메인 대표 이미지 업로드')
  fireEvent.change(input, { target: { files: [png('a.png'), png('b.png')] } })
  fireEvent.change(input, { target: { files: [png('duplicate.png')] } })
  expect(upload).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: '템플릿 저장' })).toBeDisabled()
  fireEvent.submit(screen.getByRole('button', { name: '템플릿 저장' }).closest('form')!)
  expect(save).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText(/^메인 대표 문구/), { target: { value: '업로드 중 편집한 제목' } })
  await act(async () => first.resolve(image(10)))
  await waitFor(() => expect(upload).toHaveBeenCalledTimes(2))
  await act(async () => second.resolve(image(11)))
  expect(screen.getByRole('img', { name: '메인 이미지 2' })).toHaveAttribute('src', '/api/site/images/10')
  expect(screen.getByRole('img', { name: '메인 이미지 3' })).toHaveAttribute('src', '/api/site/images/11')
  expect(screen.getByLabelText(/^메인 대표 문구/)).toHaveValue('업로드 중 편집한 제목')
  expect(input).toHaveValue('')
})

test('switching templates ignores a late upload and allows a new upload on the selected template', async () => {
  const { upload } = setup([])
  const old = deferred<ContentImage>()
  const next = deferred<ContentImage>()
  upload.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
  fireEvent.change(await screen.findByLabelText('메인 대표 이미지 업로드'), { target: { files: [png()] } })
  fireEvent.click(screen.getByRole('button', { name: 'CLASSIC 템플릿 선택' }))
  fireEvent.change(screen.getByLabelText('메인 대표 이미지 업로드'), { target: { files: [png()] } })
  await act(async () => old.resolve(image(20)))
  expect(screen.queryByRole('img', { name: '메인 이미지 1' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '템플릿 저장' })).toBeDisabled()
  await act(async () => next.resolve(image(21)))
  expect(screen.getByRole('img', { name: '메인 이미지 1' })).toHaveAttribute('src', '/api/site/images/21')
  expect(screen.getByText('대표 이미지 · 현재 사용')).toBeInTheDocument()
  expect(screen.getByText('메인에 적용 중').closest('button')).toHaveAccessibleName('BOLD 템플릿 선택')
})

test('a failed later upload preserves existing and completed images and permits retry', async () => {
  const { upload } = setup()
  upload.mockResolvedValueOnce(image(30)).mockRejectedValueOnce(new Error('upload failed')).mockResolvedValueOnce(image(31))
  const input = await screen.findByLabelText('메인 대표 이미지 업로드')
  fireEvent.change(input, { target: { files: [png(), png()] } })
  expect(await screen.findByRole('alert')).toHaveTextContent('이미지를 업로드하지 못했습니다.')
  expect(screen.getByRole('img', { name: '메인 이미지 1' })).toHaveAttribute('src', '/old.png')
  expect(screen.getByRole('img', { name: '메인 이미지 2' })).toHaveAttribute('src', '/api/site/images/30')
  fireEvent.change(input, { target: { files: [png()] } })
  expect(await screen.findByRole('img', { name: '메인 이미지 3' })).toHaveAttribute('src', '/api/site/images/31')
})

test('rejects over-capacity and invalid files before uploading, and disables upload at five', async () => {
  const { upload } = setup(['/1.png', '/2.png', '/3.png', '/4.png'])
  const input = await screen.findByLabelText('메인 대표 이미지 업로드')
  fireEvent.change(input, { target: { files: [png(), png()] } })
  expect(screen.getByRole('alert')).toHaveTextContent('최대 5개')
  fireEvent.change(input, { target: { files: [new File(['x'], 'bad.svg', { type: 'image/svg+xml' })] } })
  expect(screen.getByRole('alert')).toHaveTextContent('JPG, PNG, WebP')
  const large = png(); Object.defineProperty(large, 'size', { value: 8 * 1024 * 1024 + 1 })
  fireEvent.change(input, { target: { files: [large] } })
  expect(screen.getByRole('alert')).toHaveTextContent('8MB')
  expect(upload).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { files: [png()] } })
  await screen.findByRole('img', { name: '메인 이미지 5' })
  expect(input).toBeDisabled()
})

test('a save completing after selection changes does not restore the previous template', async () => {
  const { save } = setup()
  const pending = deferred<SiteTemplate>()
  save.mockReturnValueOnce(pending.promise)
  fireEvent.click(await screen.findByRole('button', { name: '템플릿 저장' }))
  fireEvent.click(screen.getByRole('button', { name: 'MINIMAL 템플릿 선택' }))
  await act(async () => pending.resolve({ ...base, heroTitle: 'Old saved title' }))
  expect(screen.getByText('MINIMAL 템플릿 설정')).toBeInTheDocument()
  expect(screen.getByLabelText(/^메인 대표 문구/)).toHaveValue(base.heroTitle)
})

test.each([0, 1, 2, 3, 4, 5])('template 2 renders all %i images in order with one common CTA', (count) => {
  const urls = Array.from({ length: count }, (_, i) => `/${i}.png`)
  const { container } = render(<MemoryRouter><TemplateBanner template={{ ...base, key: 'CLASSIC', heroImageUrls: urls }} /></MemoryRouter>)
  expect(Array.from(container.querySelectorAll('img')).map((image) => image.getAttribute('src'))).toEqual(urls)
  expect(screen.getAllByRole('link', { name: /자세히/ })).toHaveLength(1)
  expect(container.querySelector('.portal-banner--cards')).not.toBeNull()
})

test('structure follows key, template 1 adds stories while template 3 keeps its first image', () => {
  const { container, rerender } = render(<MemoryRouter><TemplateBanner template={{ ...base, heroImageUrls: ['/first.png', '/second.png'] }} /></MemoryRouter>)
  expect(container.querySelector('.portal-banner--split')).not.toBeNull()
  expect(screen.getByRole('img', { name: '메인 대표 이미지' })).toHaveAttribute('src', '/first.png')
  expect(container.querySelector('.portal-banner-stories img')).toHaveAttribute('src', '/second.png')
  rerender(<MemoryRouter><TemplateBanner template={{ ...base, key: 'MINIMAL', layout: 'BOLD', heroImageUrls: ['/first.png', '/second.png'] }} /></MemoryRouter>)
  expect(container.querySelector('.portal-banner--split')).toBeNull()
  expect(container.innerHTML).toContain('/first.png')
  expect(container.innerHTML).not.toContain('/second.png')
  expect(screen.getByText('어디로 떠나볼까요?')).toBeInTheDocument()
})

test('file drop uploads in order and enforces the same five image limit', async () => {
  const { upload } = setup(['/one.png', '/two.png', '/three.png', '/four.png'])
  const zone = (await screen.findByLabelText('메인 대표 이미지 업로드')).closest('fieldset')!
  fireEvent.drop(zone, { dataTransfer: { types: ['Files'], files: [png('a.png'), png('b.png')] } })
  expect(await screen.findByRole('alert')).toHaveTextContent('최대 5개')
  expect(upload).not.toHaveBeenCalled()
  fireEvent.drop(zone, { dataTransfer: { types: ['Files'], files: [png('a.png')] } })
  expect(await screen.findByRole('img', { name: '메인 이미지 5' })).toHaveAttribute('src', '/api/site/images/8')
})

test('dragging an image moves its title and description together and preserves them on save', async () => {
  const { save } = setup(['/one.png', '/two.png', '/three.png'])
  fireEvent.change(await screen.findByLabelText('이미지 1 제목'), { target: { value: '바람을 따라, 바다로' } })
  fireEvent.change(screen.getByLabelText('이미지 1 작은 설명'), { target: { value: '탁 트인 풍경이 기다리는 여행' } })
  const transfer = { types: ['text/plain'], setData: vi.fn(), effectAllowed: '', dropEffect: '' }
  fireEvent.dragStart(screen.getByRole('button', { name: '이미지 1 드래그하여 순서 변경' }), { dataTransfer: transfer })
  const target = screen.getByRole('img', { name: '메인 이미지 3' }).closest('li')!
  fireEvent.dragOver(target, { dataTransfer: transfer })
  fireEvent.drop(target, { dataTransfer: transfer })
  expect(screen.getByLabelText('이미지 3 제목')).toHaveValue('바람을 따라, 바다로')
  expect(screen.getByLabelText('이미지 3 작은 설명')).toHaveValue('탁 트인 풍경이 기다리는 여행')
  expect(screen.getByRole('img', { name: '메인 이미지 1' })).toHaveAttribute('src', '/two.png')
  fireEvent.click(screen.getByRole('button', { name: '템플릿 저장' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ heroImages: [
    { url: '/two.png', title: '', description: '' }, { url: '/three.png', title: '', description: '' },
    { url: '/one.png', title: '바람을 따라, 바다로', description: '탁 트인 풍경이 기다리는 여행' },
  ] })))
})

test.each(['BOLD', 'CLASSIC'])('%s renders per-image captions as plain text, retaining one common CTA', (key) => {
  const { container } = render(<MemoryRouter><TemplateBanner template={{ ...base, key, heroImages: [
    { url: '/sea.png', title: '바람을 따라, 바다로', description: '오늘의 여행 취향' },
    { url: '/forest.png', title: '<b>숲길 산책</b>', description: '자연 속의 쉼표' },
  ] }} /></MemoryRouter>)
  expect(container.querySelector('.portal-banner-photo figcaption')).toHaveTextContent('오늘의 여행 취향바람을 따라, 바다로')
  expect(container.querySelector('.portal-banner-card figcaption')).toHaveTextContent('자연 속의 쉼표<b>숲길 산책</b>')
  expect(container.querySelector('figcaption b')).toBeNull()
  expect(screen.getAllByRole('link', { name: /자세히/ })).toHaveLength(1)
  expect(screen.getAllByRole('tab')).toHaveLength(8)
})

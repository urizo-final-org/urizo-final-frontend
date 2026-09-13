import { ProductApiError } from '../../shared/api/error'
import { fetchWithSessionRefresh, type AdminSession } from '../../shared/api/session'

export const SITE_UPDATE_EVENT = 'axms:site-updated'

export function notifySiteUpdated() {
  try { window.localStorage.setItem(SITE_UPDATE_EVENT, crypto.randomUUID()) } catch { /* 현재 탭 이벤트로 계속 갱신합니다. */ }
  window.dispatchEvent(new Event(SITE_UPDATE_EVENT))
}

/** 관리 화면이 자기 목록을 다시 읽어야 할 때. 폼이 아닌 곳에서 CMS가 바뀌면 알린다. */
export const CMS_CHANGED_EVENT = 'axms:cms-changed'

export function notifyCmsChanged() {
  window.dispatchEvent(new Event(CMS_CHANGED_EVENT))
}

export type Member = { id: string; loginId: string; name: string; role: string }
export type MenuTargetType = 'NONE' | 'CONTENT' | 'BOARD'
export type Menu = {
  id: number
  name: string
  path: string
  parentId: number | null
  displayOrder: number
  targetType: MenuTargetType
  targetId: number | null
}
export type Article = { id: number; authorId: string; authorName: string; title: string; body: string; createdAt: string; updatedAt: string }
export type Board = { id: number; name: string; description: string; createdAt: string; updatedAt: string; displayType?: 'LIST' | 'CARD'; regionGroupKey?: string | null; categoryGroupKey?: string | null }
export type Post = Article & { boardId: number; thumbnailImageId?: number | null; thumbnailAlt?: string; regionCodeId?: number | null; categoryCodeId?: number | null }
export type BoardInput = Pick<Board, 'name' | 'description' | 'displayType' | 'regionGroupKey' | 'categoryGroupKey'>
export type PostInput = Pick<Post, 'title' | 'body' | 'thumbnailImageId' | 'thumbnailAlt' | 'regionCodeId' | 'categoryCodeId'>
export type CodeGroup = { key: string; label: string; displayOrder: number; enabled: boolean }
export type CmsCode = { id: number; groupKey: string; value: string; label: string; displayOrder: number; enabled: boolean }
export type CodeInput = Pick<CmsCode, 'value' | 'label' | 'displayOrder' | 'enabled'>
export type TemplateHeroImage = { url: string; title: string; description: string }
export type SiteTemplate = {
  key: string
  layout: string
  primaryColor: string
  siteName: string
  headerText: string
  footerText: string
  heroImageUrl: string
  heroImageUrls?: string[] | null
  heroImages?: TemplateHeroImage[] | null
  heroTitle: string
  heroSubtitle: string
  heroButtonLabel: string
  heroButtonUrl: string
  updatedAt: string
}
export type PublicSiteContext = { key: string; name: string; publicPath: string; template: SiteTemplate }

/** 업로드 응답. 바이트는 담기지 않는다. */
export type ContentImage = { id: number; contentType: string; byteSize: number }

/**
 * 본문에 넣을 이미지 주소.
 *
 * 방문자도 봐야 하므로 `/api/site` 아래다. 서버가 이 형태만 본문에 허용한다.
 */
export function contentImageUrl(id: number) {
  return `/api/site/images/${id}`
}

async function responseBody<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string; detail?: string; error?: { message?: string } }
    throw new ProductApiError({
      status: response.status,
      code: `HTTP_${response.status}`,
      message: body.detail ?? body.message ?? body.error?.message ?? '요청을 처리하지 못했습니다.',
    })
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export class CmsApi {
  constructor(private token: string, private readonly onRefreshed: (session: AdminSession) => void, private readonly onExpired: () => void) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    headers.set('X-Trace-Id', crypto.randomUUID())
    // FormData는 브라우저가 경계 문자열을 붙여 스스로 Content-Type을 정한다. 여기서 정하면 깨진다.
    if (init.body !== undefined && !(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json')
    }
    const response = await fetchWithSessionRefresh(path, { ...init, headers }, this.token, {
      onSessionRefreshed: (session) => { this.token = session.sessionToken; this.onRefreshed(session) },
      onSessionExpired: this.onExpired,
    })
    return responseBody<T>(response)
  }

  members = () => this.request<Member[]>('/api/cms/members')
  menus = () => this.request<Menu[]>('/api/cms/menus')
  createMenu = (value: Omit<Menu, 'id'>) => this.request<Menu>('/api/cms/menus', { method: 'POST', body: JSON.stringify(value) })
  updateMenu = (id: number, value: Omit<Menu, 'id'>) => this.request<Menu>(`/api/cms/menus/${id}`, { method: 'PUT', body: JSON.stringify(value) })
  deleteMenu = (id: number) => this.request<void>(`/api/cms/menus/${id}`, { method: 'DELETE' })
  contents = () => this.request<Article[]>('/api/cms/contents')
  createContent = (value: Pick<Article, 'title' | 'body'>) => this.request<Article>('/api/cms/contents', { method: 'POST', body: JSON.stringify(value) })
  updateContent = (id: number, value: Pick<Article, 'title' | 'body'>) => this.request<Article>(`/api/cms/contents/${id}`, { method: 'PUT', body: JSON.stringify(value) })
  deleteContent = (id: number) => this.request<void>(`/api/cms/contents/${id}`, { method: 'DELETE' })
  /** 본문에 넣을 이미지를 올린다. 본문에는 바이트가 아니라 {@link contentImageUrl} 주소만 들어간다. */
  uploadImage = (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return this.request<ContentImage>('/api/cms/images', { method: 'POST', body: form })
  }
  boards = () => this.request<Board[]>('/api/cms/boards')
  createBoard = (value: BoardInput) => this.request<Board>('/api/cms/boards', { method: 'POST', body: JSON.stringify(value) })
  updateBoard = (id: number, value: BoardInput) => this.request<Board>(`/api/cms/boards/${id}`, { method: 'PUT', body: JSON.stringify(value) })
  deleteBoard = (id: number) => this.request<void>(`/api/cms/boards/${id}`, { method: 'DELETE' })
  posts = (boardId: number) => this.request<Post[]>(`/api/cms/boards/${boardId}/posts`)
  createPost = (boardId: number, value: PostInput) => this.request<Post>(`/api/cms/boards/${boardId}/posts`, { method: 'POST', body: JSON.stringify(value) })
  updatePost = (id: number, value: PostInput) => this.request<Post>(`/api/cms/posts/${id}`, { method: 'PUT', body: JSON.stringify(value) })
  deletePost = (id: number) => this.request<void>(`/api/cms/posts/${id}`, { method: 'DELETE' })
  codeGroups = () => this.request<CodeGroup[]>('/api/cms/code-groups')
  codes = () => this.request<CmsCode[]>('/api/cms/codes')
  createCodeGroup = (value: CodeGroup) => this.request<CodeGroup>('/api/cms/code-groups', { method: 'POST', body: JSON.stringify(value) })
  updateCodeGroup = (key: string, value: CodeGroup) => this.request<CodeGroup>(`/api/cms/code-groups/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify(value) })
  createCode = (key: string, value: CodeInput) => this.request<CmsCode>(`/api/cms/code-groups/${encodeURIComponent(key)}/codes`, { method: 'POST', body: JSON.stringify(value) })
  updateCode = (id: number, value: CodeInput) => this.request<CmsCode>(`/api/cms/codes/${id}`, { method: 'PUT', body: JSON.stringify(value) })
  templates = () => this.request<SiteTemplate[]>('/api/cms/templates')
  saveTemplate = ({ key, layout, primaryColor, siteName, headerText, footerText, heroImageUrl, heroImageUrls, heroImages, heroTitle, heroSubtitle, heroButtonLabel, heroButtonUrl }: SiteTemplate) => this.request<SiteTemplate>(`/api/cms/templates/${key}`, {
    method: 'PUT',
    body: JSON.stringify({ layout, primaryColor, siteName, headerText, footerText, heroImageUrl, heroImageUrls, heroImages, heroTitle, heroSubtitle, heroButtonLabel, heroButtonUrl }),
  })
}

export class SiteApi {
  private async request<T>(path: string): Promise<T> {
    const response = await fetch(path, { headers: { Accept: 'application/json', 'X-Trace-Id': crypto.randomUUID() }, cache: 'no-store' })
    return responseBody<T>(response)
  }
  menus = () => this.request<Menu[]>('/api/site/menus')
  content = (id: number) => this.request<Article>(`/api/site/contents/${id}`)
  boards = () => this.request<Board[]>('/api/site/boards')
  codes = () => this.request<CmsCode[]>('/api/site/codes')
  posts = (boardId: number) => this.request<Post[]>(`/api/site/boards/${boardId}/posts`)
  post = (id: number) => this.request<Post>(`/api/site/posts/${id}`)
  site = (path = '/') => this.request<PublicSiteContext>(`/api/site/context?path=${encodeURIComponent(path)}`)
}

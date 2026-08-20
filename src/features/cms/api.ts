import { ProductApiError } from '../../shared/api/error'
import { fetchWithSessionRefresh, type AdminSession } from '../../shared/api/session'

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
export type Board = { id: number; name: string; description: string; createdAt: string; updatedAt: string }
export type Post = Article & { boardId: number }
export type SiteTemplate = {
  key: string
  layout: string
  primaryColor: string
  siteName: string
  headerText: string
  footerText: string
  heroImageUrl: string
  heroTitle: string
  heroSubtitle: string
  heroButtonLabel: string
  heroButtonUrl: string
  active: boolean
  updatedAt: string
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
    if (init.body !== undefined) headers.set('Content-Type', 'application/json')
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
  boards = () => this.request<Board[]>('/api/cms/boards')
  createBoard = (value: Pick<Board, 'name' | 'description'>) => this.request<Board>('/api/cms/boards', { method: 'POST', body: JSON.stringify(value) })
  updateBoard = (id: number, value: Pick<Board, 'name' | 'description'>) => this.request<Board>(`/api/cms/boards/${id}`, { method: 'PUT', body: JSON.stringify(value) })
  deleteBoard = (id: number) => this.request<void>(`/api/cms/boards/${id}`, { method: 'DELETE' })
  posts = (boardId: number) => this.request<Post[]>(`/api/cms/boards/${boardId}/posts`)
  createPost = (boardId: number, value: Pick<Post, 'title' | 'body'>) => this.request<Post>(`/api/cms/boards/${boardId}/posts`, { method: 'POST', body: JSON.stringify(value) })
  updatePost = (id: number, value: Pick<Post, 'title' | 'body'>) => this.request<Post>(`/api/cms/posts/${id}`, { method: 'PUT', body: JSON.stringify(value) })
  deletePost = (id: number) => this.request<void>(`/api/cms/posts/${id}`, { method: 'DELETE' })
  templates = () => this.request<SiteTemplate[]>('/api/cms/templates')
  saveTemplate = (value: SiteTemplate) => this.request<SiteTemplate>(`/api/cms/templates/${value.key}`, { method: 'PUT', body: JSON.stringify(value) })
}

export class SiteApi {
  private async request<T>(path: string): Promise<T> {
    const response = await fetch(path, { headers: { Accept: 'application/json', 'X-Trace-Id': crypto.randomUUID() }, cache: 'no-store' })
    return responseBody<T>(response)
  }
  menus = () => this.request<Menu[]>('/api/site/menus')
  content = (id: number) => this.request<Article>(`/api/site/contents/${id}`)
  boards = () => this.request<Board[]>('/api/site/boards')
  posts = (boardId: number) => this.request<Post[]>(`/api/site/boards/${boardId}/posts`)
  post = (id: number) => this.request<Post>(`/api/site/posts/${id}`)
  template = () => this.request<SiteTemplate>('/api/site/template')
}

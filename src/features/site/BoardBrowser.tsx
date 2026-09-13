import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { describeFailure } from '../../shared/api/error'
import { contentImageUrl, SiteApi, type Board, type CmsCode, type Post } from '../cms/api'

const PAGE_SIZE = 10
const field = 'h-11 rounded border border-line bg-panel px-3 text-sm text-ink'

/** Search only the visible text, never JSON node names or image URLs. */
export function postText(body: string): string {
  try {
    const walk = (node: { text?: string; content?: unknown[] }): string =>
      [node.text ?? '', ...(node.content ?? []).map((child) => walk(child as typeof node))].join(' ')
    return walk(JSON.parse(body))
  } catch { return body }
}

export default function BoardBrowser({ board, posts, publicPath = '/' }: { board: Board; posts: Post[]; publicPath?: string }) {
  const api = useMemo(() => new SiteApi(), [])
  const [codes, setCodes] = useState<CmsCode[]>([])
  const [failure, setFailure] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const query = params.get('q') ?? ''
  const region = params.get('region') ?? ''
  const category = params.get('category') ?? ''
  const [draft, setDraft] = useState(query)
  useEffect(() => { setDraft(query) }, [query])
  useEffect(() => {
    let active = true
    setCodes([]); setFailure(null)
    if (board.regionGroupKey || board.categoryGroupKey) {
      api.codes().then((value) => { if (active) setCodes(value) })
        .catch((error) => { if (active) setFailure(describeFailure(error)) })
    }
    return () => { active = false }
  }, [api, board.id, board.regionGroupKey, board.categoryGroupKey])

  const filtered = posts.filter((post) =>
    (!query.trim() || (post.title + ' ' + postText(post.body)).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    && (!region || String(post.regionCodeId) === region)
    && (!category || String(post.categoryCodeId) === category))
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const requestedPage = Number(params.get('page') ?? '1')
  const page = Math.min(pages, Math.max(1, Number.isInteger(requestedPage) ? requestedPage : 1))
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next)
  }
  const search = (event: FormEvent) => { event.preventDefault(); update('q', draft) }
  const label = (id?: number | null) => codes.find((code) => code.id === id)?.label
  const options = (key?: string | null) => codes.filter((code) => code.groupKey === key)
  const returnTo = location.pathname + location.search
  const destination = (id: number) => publicPath === '/' ? `/posts/${id}` : `${publicPath}/posts/${id}`

  return <section aria-label={`${board.name} 게시글`}>
    <p className="mb-7 text-sm leading-7 text-body">{board.description}</p>
    {failure && <p role="alert" className="mb-4 text-sm text-red-700">분류를 불러오지 못했습니다. {failure}</p>}
    <form onSubmit={search} className="mb-7 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-page p-4">
      {board.regionGroupKey && <label className="grid gap-2 text-xs font-bold text-body">지역
        <select className={field} value={region} onChange={(event) => update('region', event.target.value)}>
          <option value="">전체 지역</option>{options(board.regionGroupKey).map((code) => <option key={code.id} value={code.id}>{code.label}</option>)}
        </select>
      </label>}
      {board.categoryGroupKey && <label className="grid gap-2 text-xs font-bold text-body">분류
        <select className={field} value={category} onChange={(event) => update('category', event.target.value)}>
          <option value="">전체 분류</option>{options(board.categoryGroupKey).map((code) => <option key={code.id} value={code.id}>{code.label}</option>)}
        </select>
      </label>}
      <label className="grid min-w-40 flex-1 gap-2 text-xs font-bold text-body">검색어
        <input className={field} type="search" placeholder="제목 또는 내용 검색" value={draft} onChange={(event) => setDraft(event.target.value)} />
      </label>
      <button className="h-11 rounded bg-primary px-6 text-sm font-bold text-white">검색</button>
      {(query || region || category) && <button type="button" className="h-11 rounded border border-line px-4 text-sm" onClick={() => { setParams({}); setDraft('') }}>초기화</button>}
    </form>
    <p className="mb-4 text-sm text-muted" role="status">총 <strong className="text-ink">{filtered.length}</strong>건 · {page} / {pages} 페이지</p>
    {board.displayType === 'CARD'
      ? <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((post) => <Link key={post.id} to={destination(post.id)} state={{ boardReturnTo: returnTo }}
          className="group overflow-hidden rounded-lg border border-line bg-panel text-inherit no-underline transition hover:-translate-y-1 hover:shadow-lg">
          {post.thumbnailImageId
            ? <img className="aspect-[16/10] w-full object-cover" src={contentImageUrl(post.thumbnailImageId)} alt={post.thumbnailAlt ?? ''} loading="lazy" />
            : <div className="grid aspect-[16/10] place-items-center bg-sub text-sm text-muted">등록된 대표 이미지가 없습니다</div>}
          <div className="p-5"><p className="mb-3 flex gap-2 text-xs font-bold text-primary">{[label(post.regionCodeId), label(post.categoryCodeId)].filter(Boolean).map((name) => <span key={name}>{name}</span>)}</p>
            <h2 className="m-0 line-clamp-2 text-lg font-bold leading-7 group-hover:text-primary">{post.title}</h2>
            <p className="mb-4 mt-3 line-clamp-2 text-sm leading-6 text-muted">{postText(post.body)}</p>
            <time className="text-xs text-muted" dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>
          </div>
        </Link>)}
      </div>
      : <div className="border-t-2 border-primary">
        {visible.map((post, index) => <Link key={post.id} to={destination(post.id)} state={{ boardReturnTo: returnTo }}
          className="grid grid-cols-[2rem_1fr_auto] items-center gap-4 border-b border-line px-3 py-5 text-inherit no-underline hover:bg-page max-[560px]:grid-cols-[1.5rem_1fr]">
          <span className="text-center text-xs text-muted">{filtered.length - (page - 1) * PAGE_SIZE - index}</span>
          <span className="min-w-0">{label(post.categoryCodeId) && <span className="mb-1 block text-xs font-bold text-primary">{label(post.categoryCodeId)}</span>}<strong className="block text-sm leading-6">{post.title}</strong></span>
          <time className="text-xs text-muted max-[560px]:col-start-2" dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>
        </Link>)}
      </div>}
    {visible.length === 0 && <p className="border-y border-line py-16 text-center text-sm text-muted">{posts.length === 0 ? '등록된 게시물이 없습니다.' : '검색 조건에 맞는 게시물이 없습니다.'}</p>}
    {pages > 1 && <nav aria-label="게시글 페이지" className="mt-9 flex flex-wrap items-center justify-center gap-2">
      <button className="h-10 rounded border border-line px-3 text-sm disabled:opacity-40" type="button" disabled={page === 1} onClick={() => update('page', String(page - 1))}>이전</button>
      {Array.from({ length: pages }, (_, index) => index + 1).filter((value) => value === 1 || value === pages || Math.abs(value - page) <= 2).map((value) =>
        <button key={value} type="button" aria-current={value === page ? 'page' : undefined}
          className={`h-10 min-w-10 rounded border px-3 text-sm ${value === page ? 'border-primary bg-primary font-bold text-white' : 'border-line'}`}
          onClick={() => update('page', String(value))}>{value}</button>)}
      <button className="h-10 rounded border border-line px-3 text-sm disabled:opacity-40" type="button" disabled={page === pages} onClick={() => update('page', String(page + 1))}>다음</button>
    </nav>}
  </section>
}

function formatDate(value: string) { return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(value)) }

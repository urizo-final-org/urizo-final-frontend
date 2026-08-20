import { type FormEvent, useEffect, useState } from 'react'
import type { RouteId } from '../../app/routes'
import { describeFailure } from '../../shared/api/error'
import { CmsApi, type Article, type Board, type Member, type Menu, type MenuTargetType, type Post, type SiteTemplate } from './api'

const card = 'rounded-xl border border-line bg-white p-5 shadow-[0_8px_30px_rgba(17,24,39,0.05)]'
const input = 'w-full rounded-lg border border-[#d6dce5] bg-white px-3 py-2.5 text-sm'
const primary = 'rounded-lg bg-purple px-4 py-2.5 text-xs font-bold text-white enabled:hover:bg-purple-dark'
const secondary = 'rounded-lg border border-line bg-white px-3 py-2 text-xs font-bold text-[#4c5669] enabled:hover:bg-[#f4f5f8]'
const danger = 'rounded-lg border border-[#efc7cc] bg-[#fff5f6] px-3 py-2 text-xs font-bold text-red'

export default function CmsWorkspace({ route, api }: { route: RouteId; api: CmsApi }) {
  if (route === 'members') return <Members api={api} />
  if (route === 'menus') return <Menus api={api} />
  if (route === 'contents') return <Contents api={api} />
  if (route === 'boards') return <Boards api={api} />
  return <Templates api={api} />
}

function Heading({ title, description }: { title: string; description: string }) {
  return <div className="mb-6"><p className="m-0 font-mono text-[10px] font-bold tracking-[.14em] text-purple">LOCAL DEMO CMS</p><h1 className="mb-2 mt-2 text-2xl">{title}</h1><p className="m-0 text-sm text-muted">{description}</p></div>
}
function Failure({ value }: { value: string | null }) { return value ? <p className="rounded-lg border border-[#efc7cc] bg-[#fff7f8] p-3 text-sm text-red" role="alert">{value}</p> : null }

function Members({ api }: { api: CmsApi }) {
  const [items, setItems] = useState<Member[]>([])
  const [selected, setSelected] = useState<Member | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  useEffect(() => { api.members().then(setItems).catch((e) => setFailure(describeFailure(e))) }, [api])
  return <><Heading title="회원 관리" description="시연 회원의 목록과 상세를 조회합니다." /><Failure value={failure} /><div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,1fr)]"><section className={card}><table className="w-full border-collapse text-left text-sm"><thead><tr className="border-b border-line text-xs text-muted"><th className="p-3">이름</th><th>로그인 ID</th><th>역할</th></tr></thead><tbody>{items.map((member) => <tr key={member.id} className="cursor-pointer border-b border-[#edf0f4] hover:bg-[#f8f8fc]" onClick={() => setSelected(member)}><td className="p-3 font-bold">{member.name}</td><td>{member.loginId}</td><td>{roleLabel(member.role)}</td></tr>)}</tbody></table></section><aside className={card}>{selected ? <div className="grid gap-4"><span className="text-xs font-bold text-purple">MEMBER DETAIL</span><h2 className="m-0 text-xl">{selected.name}</h2><Detail label="로그인 ID" value={selected.loginId} /><Detail label="역할" value={roleLabel(selected.role)} /><Detail label="회원 ID" value={selected.id} /></div> : <p className="text-sm text-muted">목록에서 회원을 선택하세요.</p>}</aside></div></>
}

function Menus({ api }: { api: CmsApi }) {
  const [items, setItems] = useState<Menu[]>([])
  const [contents, setContents] = useState<Article[]>([])
  const [boards, setBoards] = useState<Board[]>([])
  const [editing, setEditing] = useState<Menu | null>(null)
  const [name, setName] = useState('')
  const [path, setPath] = useState('/')
  const [parentId, setParentId] = useState('')
  const [order, setOrder] = useState(0)
  const [targetType, setTargetType] = useState<MenuTargetType>('NONE')
  const [targetId, setTargetId] = useState('')
  const [failure, setFailure] = useState<string | null>(null)
  const load = () => Promise.all([api.menus(), api.contents(), api.boards()]).then(([m, c, b]) => { setItems(m); setContents(c); setBoards(b) }).catch((e) => setFailure(describeFailure(e)))
  useEffect(() => { void load() }, [api])
  function select(item: Menu | null) {
    setEditing(item); setName(item?.name ?? ''); setPath(item?.path ?? '/'); setParentId(item?.parentId?.toString() ?? '')
    setOrder(item?.displayOrder ?? 0); setTargetType(item?.targetType ?? 'NONE'); setTargetId(item?.targetId?.toString() ?? '')
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setFailure(null)
    const value = { name, path, parentId: parentId ? Number(parentId) : null, displayOrder: order, targetType, targetId: targetType === 'NONE' ? null : Number(targetId) }
    try { if (editing) await api.updateMenu(editing.id, value); else await api.createMenu(value); select(null); await load() } catch (e) { setFailure(describeFailure(e)) }
  }
  async function remove(id: number) { if (!window.confirm('이 메뉴를 삭제할까요?')) return; try { await api.deleteMenu(id); select(null); await load() } catch (e) { setFailure(describeFailure(e)) } }
  const targetOptions = targetType === 'CONTENT' ? contents : targetType === 'BOARD' ? boards : []
  return <><Heading title="메뉴 관리" description="메뉴 구조를 만들고 특정 컨텐츠 또는 게시판을 연결합니다." /><Failure value={failure} /><div className="grid gap-5 xl:grid-cols-[390px_1fr]"><form className={`${card} grid content-start gap-3`} onSubmit={submit}><div className="flex items-center"><h2 className="m-0 mr-auto text-lg">{editing ? '메뉴 수정' : '메뉴 등록'}</h2>{editing && <button type="button" className={secondary} onClick={() => select(null)}>새 메뉴</button>}</div><label className="grid gap-1 text-xs font-bold">메뉴명<input className={input} value={name} onChange={(e) => setName(e.target.value)} required /></label><label className="grid gap-1 text-xs font-bold">URL 경로<input className={input} value={path} onChange={(e) => setPath(e.target.value)} required /></label><label className="grid gap-1 text-xs font-bold">상위 메뉴<select className={input} value={parentId} onChange={(e) => setParentId(e.target.value)}><option value="">대메뉴</option>{items.filter((item) => item.parentId === null && item.id !== editing?.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="grid gap-1 text-xs font-bold">표시 순서<input className={input} type="number" min="0" value={order} onChange={(e) => setOrder(Number(e.target.value))} /></label><label className="grid gap-1 text-xs font-bold">연결 유형<select className={input} value={targetType} onChange={(e) => { setTargetType(e.target.value as MenuTargetType); setTargetId('') }}><option value="NONE">연결 없음</option><option value="CONTENT">정적 컨텐츠</option><option value="BOARD">게시판</option></select></label>{targetType !== 'NONE' && <label className="grid gap-1 text-xs font-bold">연결 대상<select className={input} value={targetId} onChange={(e) => setTargetId(e.target.value)} required><option value="">선택하세요</option>{targetOptions.map((item) => <option key={item.id} value={item.id}>{'title' in item ? item.title : item.name}</option>)}</select></label>}<div className="flex gap-2"><button className={primary}>저장</button>{editing && <button type="button" className={danger} onClick={() => void remove(editing.id)}>삭제</button>}</div></form><section className={card}><div className="grid gap-2">{items.map((item) => <button type="button" key={item.id} className="flex items-center gap-3 rounded-lg border border-[#e8ebf0] p-3 text-left hover:border-purple" onClick={() => select(item)}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#f0edff] text-xs font-bold text-purple">{item.displayOrder}</span><div className="mr-auto"><strong>{item.parentId ? '└ ' : ''}{item.name}</strong><p className="m-0 mt-1 text-xs text-muted">{item.path} · {targetLabel(item, contents, boards)}</p></div><span className="text-xs font-bold text-purple">수정</span></button>)}</div></section></div></>
}

function Contents({ api }: { api: CmsApi }) {
  const [items, setItems] = useState<Article[]>([])
  const [editing, setEditing] = useState<Article | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [failure, setFailure] = useState<string | null>(null)
  const load = () => api.contents().then(setItems).catch((e) => setFailure(describeFailure(e)))
  useEffect(() => { void load() }, [api])
  function select(item: Article | null) { setEditing(item); setTitle(item?.title ?? ''); setBody(item?.body ?? '') }
  function insert(mark: string) { setBody((value) => value ? `${value}\n${mark}` : mark) }
  async function submit(event: FormEvent) { event.preventDefault(); try { if (editing) await api.updateContent(editing.id, { title, body }); else await api.createContent({ title, body }); select(null); await load() } catch (e) { setFailure(describeFailure(e)) } }
  async function remove(id: number) { if (!window.confirm('컨텐츠를 삭제할까요?')) return; try { await api.deleteContent(id); select(null); await load() } catch (e) { setFailure(describeFailure(e)) } }
  return <><Heading title="컨텐츠 관리" description="메뉴에 연결할 정적 페이지를 가벼운 에디터로 작성합니다." /><Failure value={failure} /><div className="grid gap-5 xl:grid-cols-[minmax(280px,.75fr)_minmax(0,1.5fr)]"><section className={card}><button className={`${primary} mb-4`} onClick={() => select(null)}>새 컨텐츠</button><div className="grid gap-2">{items.map((item) => <button key={item.id} className="rounded-lg border border-[#e5e8ee] p-3 text-left hover:border-purple" onClick={() => select(item)}><strong className="block text-sm">{item.title}</strong><span className="mt-1 block text-xs text-muted">{item.authorName} · {date(item.updatedAt)}</span></button>)}</div></section><form className={`${card} grid gap-3`} onSubmit={submit}><h2 className="m-0 text-lg">{editing ? '컨텐츠 수정' : '컨텐츠 등록'}</h2><input className={input} placeholder="제목" value={title} onChange={(e) => setTitle(e.target.value)} required /><div className="flex flex-wrap gap-2 rounded-lg border border-line bg-[#f7f8fa] p-2"><button type="button" className={secondary} onClick={() => insert('## 제목')}>제목</button><button type="button" className={secondary} onClick={() => insert('**강조 문구**')}>강조</button><button type="button" className={secondary} onClick={() => insert('- 목록 항목')}>목록</button></div><textarea className={`${input} min-h-[340px] font-mono leading-7`} placeholder="내용을 입력하세요" value={body} onChange={(e) => setBody(e.target.value)} required /><p className="m-0 text-xs text-muted">제목(##), 강조(**문구**), 목록(-) 형식을 지원합니다.</p><div className="flex gap-2"><button className={primary}>저장</button>{editing && <button type="button" className={danger} onClick={() => void remove(editing.id)}>삭제</button>}</div></form></div></>
}

function Boards({ api }: { api: CmsApi }) {
  const [boards, setBoards] = useState<Board[]>([])
  const [selectedBoard, setSelectedBoard] = useState<Board | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [boardName, setBoardName] = useState('')
  const [description, setDescription] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [failure, setFailure] = useState<string | null>(null)
  const loadBoards = () => api.boards().then(setBoards).catch((e) => setFailure(describeFailure(e)))
  useEffect(() => { void loadBoards() }, [api])
  async function chooseBoard(board: Board) { setSelectedBoard(board); setBoardName(board.name); setDescription(board.description); setSelectedPost(null); setTitle(''); setBody(''); try { setPosts(await api.posts(board.id)) } catch (e) { setFailure(describeFailure(e)) } }
  function newBoard() { setSelectedBoard(null); setBoardName(''); setDescription(''); setPosts([]); setSelectedPost(null); setTitle(''); setBody('') }
  async function saveBoard(event: FormEvent) { event.preventDefault(); try { const saved = selectedBoard ? await api.updateBoard(selectedBoard.id, { name: boardName, description }) : await api.createBoard({ name: boardName, description }); await loadBoards(); await chooseBoard(saved) } catch (e) { setFailure(describeFailure(e)) } }
  async function removeBoard() { if (!selectedBoard || !window.confirm('게시판과 게시물을 삭제할까요?')) return; try { await api.deleteBoard(selectedBoard.id); newBoard(); await loadBoards() } catch (e) { setFailure(describeFailure(e)) } }
  function choosePost(post: Post | null) { setSelectedPost(post); setTitle(post?.title ?? ''); setBody(post?.body ?? '') }
  async function savePost(event: FormEvent) { event.preventDefault(); if (!selectedBoard) return; try { if (selectedPost) await api.updatePost(selectedPost.id, { title, body }); else await api.createPost(selectedBoard.id, { title, body }); choosePost(null); setPosts(await api.posts(selectedBoard.id)) } catch (e) { setFailure(describeFailure(e)) } }
  async function removePost() { if (!selectedPost || !selectedBoard || !window.confirm('게시물을 삭제할까요?')) return; try { await api.deletePost(selectedPost.id); choosePost(null); setPosts(await api.posts(selectedBoard.id)) } catch (e) { setFailure(describeFailure(e)) } }
  return <><Heading title="게시판 관리" description="게시판과 게시글을 관리하고 메뉴 관리에서 연결합니다." /><Failure value={failure} /><div className="grid gap-5 xl:grid-cols-[260px_minmax(280px,.8fr)_minmax(320px,1fr)]"><section className={card}><button className={`${primary} mb-4`} onClick={newBoard}>새 게시판</button><div className="grid gap-2">{boards.map((board) => <button key={board.id} className="rounded-lg border border-line p-3 text-left hover:border-purple" onClick={() => void chooseBoard(board)}><strong>{board.name}</strong><span className="mt-1 block text-xs text-muted">{board.description}</span></button>)}</div></section><section className="grid content-start gap-5"><form className={`${card} grid gap-3`} onSubmit={saveBoard}><h2 className="m-0 text-lg">{selectedBoard ? '게시판 수정' : '게시판 등록'}</h2><input className={input} placeholder="게시판명" value={boardName} onChange={(e) => setBoardName(e.target.value)} required /><textarea className={input} placeholder="설명" value={description} onChange={(e) => setDescription(e.target.value)} /><div className="flex gap-2"><button className={primary}>저장</button>{selectedBoard && <button type="button" className={danger} onClick={() => void removeBoard()}>삭제</button>}</div></form>{selectedBoard && <div className={card}><div className="mb-3 flex items-center"><h2 className="m-0 mr-auto text-lg">게시물</h2><button className={secondary} onClick={() => choosePost(null)}>새 게시물</button></div><div className="grid gap-2">{posts.map((post) => <button className="rounded-lg border border-line p-3 text-left" key={post.id} onClick={() => choosePost(post)}><strong>{post.title}</strong><span className="mt-1 block text-xs text-muted">{date(post.updatedAt)}</span></button>)}</div></div>}</section><form className={`${card} grid content-start gap-3`} onSubmit={savePost}><h2 className="m-0 text-lg">{selectedPost ? '게시물 수정' : '게시물 등록'}</h2>{selectedBoard ? <><input className={input} placeholder="제목" value={title} onChange={(e) => setTitle(e.target.value)} required /><textarea className={`${input} min-h-[280px]`} placeholder="내용" value={body} onChange={(e) => setBody(e.target.value)} required /><div className="flex gap-2"><button className={primary}>저장</button>{selectedPost && <button type="button" className={danger} onClick={() => void removePost()}>삭제</button>}</div></> : <p className="text-sm text-muted">게시판을 먼저 선택하세요.</p>}</form></div></>
}

function Templates({ api }: { api: CmsApi }) {
  const [items, setItems] = useState<SiteTemplate[]>([])
  const [value, setValue] = useState<SiteTemplate | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const load = () => api.templates().then((next) => { setItems(next); setValue((current) => current ? next.find((item) => item.key === current.key) ?? current : next.find((item) => item.active) ?? next[0]) }).catch((e) => setFailure(describeFailure(e)))
  useEffect(() => { void load() }, [api])
  async function submit(event: FormEvent) { event.preventDefault(); if (!value) return; try { setValue(await api.saveTemplate(value)); await load() } catch (e) { setFailure(describeFailure(e)) } }
  return <><Heading title="템플릿 관리" description="공통 디자인과 메인 화면, Header, Footer를 한곳에서 관리합니다." /><Failure value={failure} /><div className="mb-5 grid gap-3 md:grid-cols-3">{items.map((item) => <button key={item.key} className={`${card} text-left ${item.active ? 'border-purple ring-2 ring-[#ded9ff]' : ''}`} onClick={() => setValue(item)}><span className="text-xs font-bold text-purple">{item.key}{item.active ? ' · ACTIVE' : ''}</span><h2 className="mb-1 mt-3">{item.siteName}</h2><span className="text-xs text-muted">{item.layout}</span></button>)}</div>{value && <form className={`${card} grid gap-4 md:grid-cols-2`} onSubmit={submit}><label className="grid gap-2 text-xs font-bold">레이아웃<select className={input} value={value.layout} onChange={(e) => setValue({ ...value, layout: e.target.value })}><option value="CLASSIC">Corporate</option><option value="MINIMAL">Minimal</option><option value="BOLD">Bold</option></select></label><label className="grid gap-2 text-xs font-bold">대표 색상<input className={`${input} h-[44px]`} type="color" value={value.primaryColor} onChange={(e) => setValue({ ...value, primaryColor: e.target.value })} /></label><label className="grid gap-2 text-xs font-bold">사이트명<input className={input} value={value.siteName} onChange={(e) => setValue({ ...value, siteName: e.target.value })} required /></label><label className="grid gap-2 text-xs font-bold">Header 보조 문구<input className={input} value={value.headerText} onChange={(e) => setValue({ ...value, headerText: e.target.value })} /></label><label className="grid gap-2 text-xs font-bold md:col-span-2">메인 대표 이미지 URL<input className={input} value={value.heroImageUrl} onChange={(e) => setValue({ ...value, heroImageUrl: e.target.value })} required /></label><label className="grid gap-2 text-xs font-bold md:col-span-2">메인 대표 문구<input className={input} value={value.heroTitle} onChange={(e) => setValue({ ...value, heroTitle: e.target.value })} required /></label><label className="grid gap-2 text-xs font-bold md:col-span-2">메인 설명<textarea className={input} value={value.heroSubtitle} onChange={(e) => setValue({ ...value, heroSubtitle: e.target.value })} /></label><label className="grid gap-2 text-xs font-bold">메인 버튼 문구<input className={input} value={value.heroButtonLabel} onChange={(e) => setValue({ ...value, heroButtonLabel: e.target.value })} /></label><label className="grid gap-2 text-xs font-bold">메인 버튼 URL<input className={input} value={value.heroButtonUrl} onChange={(e) => setValue({ ...value, heroButtonUrl: e.target.value })} /></label><label className="grid gap-2 text-xs font-bold md:col-span-2">Footer 문구<input className={input} value={value.footerText} onChange={(e) => setValue({ ...value, footerText: e.target.value })} /></label><button className={`${primary} md:col-span-2`}>저장하고 사용자 사이트에 적용</button></form>}</>
}

function targetLabel(menu: Menu, contents: Article[], boards: Board[]) {
  if (menu.targetType === 'CONTENT') return `컨텐츠 · ${contents.find((item) => item.id === menu.targetId)?.title ?? '미지정'}`
  if (menu.targetType === 'BOARD') return `게시판 · ${boards.find((item) => item.id === menu.targetId)?.name ?? '미지정'}`
  return '연결 없음'
}
function Detail({ label, value }: { label: string; value: string }) { return <div><span className="block text-xs font-bold text-muted">{label}</span><span className="mt-1 block break-all text-sm">{value}</span></div> }
function roleLabel(role: string) { return role === 'SUPER_ADMIN' ? '최고관리자' : role === 'GENERAL_ADMIN' ? '일반관리자' : '일반사용자' }
function date(value: string) { return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(value)) }

import { type CSSProperties, type FormEvent, type ReactNode, useEffect, useState } from 'react'
import type { RouteId } from '../../app/routes'
import { describeFailure } from '../../shared/api/error'
import { SITE_UPDATE_EVENT, CmsApi, type Article, type Board, type Member, type Menu, type MenuTargetType, type Post, type SiteTemplate } from './api'
import CmsAiAssistant from './CmsAiAssistant'

const card = 'rounded-[7px] border border-line bg-panel p-[18px] shadow-[0_2px_7px_rgba(32,60,80,0.06)]'
const input = 'w-full rounded-[5px] border border-[#dce5e9] bg-white px-[10px] py-[9px] text-[13px] font-normal text-[#4c6471]'
const primary = 'inline-flex items-center justify-center gap-[7px] rounded-[5px] bg-primary px-[13px] py-[9px] text-[11px] font-bold text-white enabled:hover:bg-primary-dark'
const secondary = 'inline-flex items-center justify-center gap-[7px] rounded-[5px] border border-line bg-white px-[13px] py-[9px] text-[11px] font-bold text-[#496272] enabled:hover:bg-[#f4f7f8]'
const danger = 'inline-flex items-center justify-center gap-[7px] rounded-[5px] border border-[#f2d5d3] bg-red-soft px-[13px] py-[9px] text-[11px] font-bold text-red enabled:hover:bg-[#fbdedc]'
const field = 'grid gap-[7px] text-[10px] font-bold text-[#607783]'
const panelHead = 'mb-[9px] flex items-center justify-between gap-[10px] border-b border-[#edf1f3] pb-[13px]'
const CMS_SUCCESS_EVENT = 'axms:cms-success'
type SuccessNotice = { id: string; message: string }

export default function CmsWorkspace({ route, api }: { route: RouteId; api: CmsApi }) {
  const [success, setSuccess] = useState<SuccessNotice | null>(null)
  const [assistantCollapsed, setAssistantCollapsed] = useState(false)
  useEffect(() => {
    const showSuccess = (event: Event) => setSuccess({ id: `${Date.now()}-${Math.random()}`, message: (event as CustomEvent<string>).detail })
    window.addEventListener(CMS_SUCCESS_EVENT, showSuccess)
    return () => window.removeEventListener(CMS_SUCCESS_EVENT, showSuccess)
  }, [])
  useEffect(() => {
    if (!success) return
    const timer = window.setTimeout(() => setSuccess(null), 2600)
    return () => window.clearTimeout(timer)
  }, [success])
  useEffect(() => { setSuccess(null) }, [route])
  const workspace = route === 'members' ? <Members api={api} />
    : route === 'menus' ? <Menus api={api} />
      : route === 'contents' ? <Contents api={api} />
        : route === 'boards' ? <Boards api={api} />
          : <Templates api={api} />
  const assistantRoute = route === 'members' ? null : route
  return <>
    <SuccessToast notice={success} />
    {assistantRoute
      ? <div className={`grid items-start gap-[14px] ${assistantCollapsed ? 'min-[1180px]:grid-cols-[minmax(0,1fr)_72px]' : 'min-[1180px]:grid-cols-[minmax(0,1fr)_350px]'}`}>
        <div className="min-w-0">{workspace}</div>
        <CmsAiAssistant key={assistantRoute} route={assistantRoute} collapsed={assistantCollapsed} onToggle={() => setAssistantCollapsed((value) => !value)} />
      </div>
      : workspace}
  </>
}

function Heading({ title, description }: { title: string; description: string }) {
  return <div className="mb-6"><p className="m-0 text-[10px] text-[#7d909d]">CMS 관리 / {title}</p><h1 className="my-[5px] text-[26px] tracking-[-.04em]">{title}</h1><p className="m-0 text-xs text-[#748590]">{description}</p></div>
}
function SuccessToast({ notice }: { notice: SuccessNotice | null }) {
  return notice ? <div className="pointer-events-none fixed inset-0 z-[100] grid place-items-center p-5" aria-live="polite" aria-atomic="true">
    <div key={notice.id} className="cms-success-toast flex max-w-[520px] items-center gap-3 rounded-2xl bg-navy px-6 py-5 text-sm font-bold text-white shadow-[0_24px_70px_rgba(23,49,73,.35)]" role="status"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-base text-navy" aria-hidden="true">✓</span><span>{notice.message}</span></div>
  </div> : null
}
function Feedback({ failure }: { failure: string | null }) { return failure ? <p className="mb-5 flex items-start gap-2 rounded-[5px] border border-[#f2d5d3] bg-red-soft p-[11px] text-xs leading-5 text-red" role="alert"><span aria-hidden="true">⚠</span>{failure}</p> : null }
function Failure({ value }: { value: string | null }) { return <Feedback failure={value} /> }

function notifyCmsSuccess(message: string) { window.dispatchEvent(new CustomEvent(CMS_SUCCESS_EVENT, { detail: message })) }

function notifySiteUpdated() {
  try { window.localStorage.setItem(SITE_UPDATE_EVENT, crypto.randomUUID()) } catch { /* 사용자 화면 갱신은 현재 탭 이벤트로 계속 시도합니다. */ }
  window.dispatchEvent(new Event(SITE_UPDATE_EVENT))
}

function Members({ api }: { api: CmsApi }) {
  const [items, setItems] = useState<Member[]>([])
  const [selected, setSelected] = useState<Member | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  useEffect(() => { api.members().then(setItems).catch((e) => setFailure(describeFailure(e))) }, [api])
  return <><Heading title="회원 관리" description="시연 회원의 목록과 상세를 조회합니다." /><Feedback failure={failure} /><div className="grid gap-[14px] lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,1fr)]"><section className={card}><div className={panelHead}><div><b className="text-[13px]">회원 목록</b><small className="mt-[3px] block text-[10px] font-normal text-[#91a0a9]">총 {items.length}건</small></div></div><table className="w-full border-collapse text-left"><thead><tr className="border-b border-[#edf1f3] text-[10px] text-[#93a0a9]"><th className="px-1 pb-[6px] pt-1 font-normal">이름</th><th className="font-normal">로그인 ID</th><th className="font-normal">역할</th></tr></thead><tbody>{items.map((member) => <tr key={member.id} className="cursor-pointer border-b border-[#edf1f3] text-[11px] text-[#667985] hover:bg-[#f7fafb]" onClick={() => setSelected(member)}><td className="px-1 py-3 font-bold text-[#4c6471]">{member.name}</td><td>{member.loginId}</td><td><Badge tone={member.role === 'SUPER_ADMIN' ? 'amber' : 'gray'}>{roleLabel(member.role)}</Badge></td></tr>)}</tbody></table></section><aside className={card}><div className={panelHead}><div><b className="text-[13px]">회원 상세</b><small className="mt-[3px] block text-[10px] font-normal text-[#91a0a9]">목록에서 선택한 회원 정보</small></div></div>{selected ? <div className="grid gap-4 pt-2"><h2 className="m-0 text-xl">{selected.name}</h2><Detail label="로그인 ID" value={selected.loginId} /><Detail label="역할" value={roleLabel(selected.role)} /><Detail label="회원 ID" value={selected.id} /></div> : <EmptyState>목록에서 회원을 선택하세요.</EmptyState>}</aside></div></>
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
  const load = () => Promise.all([api.menus(), api.contents(), api.boards()]).then(([m, c, b]) => { setItems(m); setContents(c); setBoards(b) }).catch((e) => setFailure(`불러오지 못했습니다. ${describeFailure(e)}`))
  useEffect(() => { void load() }, [api])
  function select(item: Menu | null) {
    setEditing(item); setName(item?.name ?? ''); setPath(item?.path ?? '/'); setParentId(item?.parentId?.toString() ?? '')
    setOrder(item?.displayOrder ?? 0); setTargetType(item?.targetType ?? 'NONE'); setTargetId(item?.targetId?.toString() ?? '')
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setFailure(null)
    const action = editing ? '수정' : '등록'
    const value = { name, path, parentId: parentId ? Number(parentId) : null, displayOrder: order, targetType, targetId: targetType === 'NONE' ? null : Number(targetId) }
    try { if (editing) await api.updateMenu(editing.id, value); else await api.createMenu(value); select(null); await load(); notifySiteUpdated(); notifyCmsSuccess(`메뉴를 ${action}했습니다.`) } catch (e) { setFailure(`메뉴를 저장하지 못했습니다. ${describeFailure(e)}`) }
  }
  async function remove(id: number) { if (!window.confirm('이 메뉴를 삭제할까요?')) return; setFailure(null); try { await api.deleteMenu(id); select(null); await load(); notifySiteUpdated(); notifyCmsSuccess('메뉴를 삭제했습니다.') } catch (e) { setFailure(`메뉴를 삭제하지 못했습니다. ${describeFailure(e)}`) } }
  const targetOptions = targetType === 'CONTENT' ? contents : targetType === 'BOARD' ? boards : []
  return <><Heading title="메뉴 관리" description="메뉴 구조를 만들고 특정 컨텐츠 또는 게시판을 연결합니다." /><Failure value={failure} /><div className="grid gap-[14px] 2xl:grid-cols-[390px_1fr]"><form className={`${card} grid content-start gap-[14px]`} onSubmit={submit}><div className={panelHead}><div><b className="text-[13px]">{editing ? '메뉴 수정' : '메뉴 등록'}</b><small className="mt-[3px] block text-[10px] font-normal text-[#91a0a9]">{editing ? '선택한 메뉴를 수정합니다.' : '새 메뉴를 추가합니다.'}</small></div>{editing && <button type="button" className={secondary} onClick={() => select(null)}>새 메뉴</button>}</div><label className={field}>메뉴명<input className={input} value={name} onChange={(e) => setName(e.target.value)} required /></label><label className={field}>URL 경로<input className={input} value={path} onChange={(e) => setPath(e.target.value)} required /></label><label className={field}>상위 메뉴<select className={input} value={parentId} onChange={(e) => setParentId(e.target.value)}><option value="">대메뉴</option>{items.filter((item) => item.parentId === null && item.id !== editing?.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className={field}>표시 순서<input className={input} type="number" min="0" value={order} onChange={(e) => setOrder(Number(e.target.value))} /></label><label className={field}>연결 유형<select className={input} value={targetType} onChange={(e) => { setTargetType(e.target.value as MenuTargetType); setTargetId('') }}><option value="NONE">연결 없음</option><option value="CONTENT">정적 컨텐츠</option><option value="BOARD">게시판</option></select></label>{targetType !== 'NONE' && <label className={field}>연결 대상<select className={input} value={targetId} onChange={(e) => setTargetId(e.target.value)} required><option value="">선택하세요</option>{targetOptions.map((item) => <option key={item.id} value={item.id}>{'title' in item ? item.title : item.name}</option>)}</select></label>}<div className="flex justify-end gap-[7px] pt-1">{editing && <button type="button" className={danger} onClick={() => void remove(editing.id)}>삭제</button>}<button className={primary}>저장</button></div></form><section className={card}><div className={panelHead}><div><b className="text-[13px]">메뉴 목록</b><small className="mt-[3px] block text-[10px] font-normal text-[#91a0a9]">총 {items.length}건</small></div></div>{items.length === 0 ? <EmptyState>등록된 메뉴가 없습니다.</EmptyState> : items.map((item) => <button type="button" key={item.id} className="flex w-full items-center gap-[10px] border-b border-[#edf1f3] py-3 text-left text-[#526876] hover:bg-[#f7fafb]" onClick={() => select(item)}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-[11px] font-bold text-accent-ink">{item.displayOrder}</span><div className="mr-auto min-w-0"><b className="block text-[11px]">{item.parentId ? '└ ' : ''}{item.name}</b><small className="mt-[3px] block text-[10px] text-[#9aa7af]">{item.path} · {targetLabel(item, contents, boards)}</small></div><span className="text-[#9aa8af]" aria-hidden="true">›</span></button>)}</section></div></>
}

function Contents({ api }: { api: CmsApi }) {
  const [items, setItems] = useState<Article[]>([])
  const [editing, setEditing] = useState<Article | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [failure, setFailure] = useState<string | null>(null)
  const load = () => api.contents().then(setItems).catch((e) => setFailure(`불러오지 못했습니다. ${describeFailure(e)}`))
  useEffect(() => { void load() }, [api])
  function select(item: Article | null) { setEditing(item); setTitle(item?.title ?? ''); setBody(item?.body ?? '') }
  function insert(mark: string) { setBody((value) => value ? `${value}\n${mark}` : mark) }
  async function submit(event: FormEvent) { event.preventDefault(); setFailure(null); const action = editing ? '수정' : '등록'; try { if (editing) await api.updateContent(editing.id, { title, body }); else await api.createContent({ title, body }); select(null); await load(); notifySiteUpdated(); notifyCmsSuccess(`컨텐츠를 ${action}했습니다.`) } catch (e) { setFailure(`컨텐츠를 저장하지 못했습니다. ${describeFailure(e)}`) } }
  async function remove(id: number) { if (!window.confirm('컨텐츠를 삭제할까요?')) return; setFailure(null); try { await api.deleteContent(id); select(null); await load(); notifySiteUpdated(); notifyCmsSuccess('컨텐츠를 삭제했습니다.') } catch (e) { setFailure(`컨텐츠를 삭제하지 못했습니다. ${describeFailure(e)}`) } }
  return <><Heading title="컨텐츠 관리" description="메뉴에 연결할 정적 페이지를 가벼운 에디터로 작성합니다." /><Failure value={failure} /><div className="grid gap-[14px] 2xl:grid-cols-[minmax(280px,.75fr)_minmax(0,1.5fr)]"><section className={card}><div className={panelHead}><div><b className="text-[13px]">컨텐츠 목록</b><small className="mt-[3px] block text-[10px] font-normal text-[#91a0a9]">총 {items.length}건</small></div><button className={secondary} onClick={() => select(null)}>새 컨텐츠</button></div>{items.length === 0 ? <EmptyState>등록된 컨텐츠가 없습니다.</EmptyState> : items.map((item) => <button key={item.id} className="flex w-full items-center gap-[10px] border-b border-[#edf1f3] py-3 text-left text-[#526876] hover:bg-[#f7fafb]" onClick={() => select(item)}><span className="text-accent-ink" aria-hidden="true">▤</span><div className="mr-auto min-w-0"><b className="block text-[11px]">{item.title}</b><small className="mt-[3px] block text-[10px] text-[#9aa7af]">{item.authorName} · {date(item.updatedAt)}</small></div><span className="text-[#9aa8af]" aria-hidden="true">›</span></button>)}</section><form className={`${card} grid content-start gap-[14px]`} onSubmit={submit}><div className={panelHead}><div><b className="text-[13px]">{editing ? '컨텐츠 수정' : '컨텐츠 등록'}</b><small className="mt-[3px] block text-[10px] font-normal text-[#91a0a9]">제목(##), 강조(**문구**), 목록(-) 형식을 지원합니다.</small></div></div><label className={field}>제목<input className={input} placeholder="제목을 입력하세요" value={title} onChange={(e) => setTitle(e.target.value)} required /></label><div className={field}><span>본문</span><div><div className="flex flex-wrap gap-[7px] rounded-t-[5px] border border-b-0 border-[#dce5e9] bg-[#f7f9fa] p-2"><button type="button" className={secondary} onClick={() => insert('## 제목')}>제목</button><button type="button" className={secondary} onClick={() => insert('**강조 문구**')}>강조</button><button type="button" className={secondary} onClick={() => insert('- 목록 항목')}>목록</button></div><textarea className={`${input} min-h-[340px] rounded-t-none font-mono leading-7`} placeholder="내용을 입력하세요" value={body} onChange={(e) => setBody(e.target.value)} required /></div></div><div className="flex justify-end gap-[7px]">{editing && <button type="button" className={danger} onClick={() => void remove(editing.id)}>삭제</button>}<button className={primary}>저장</button></div></form></div></>
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
  const loadBoards = () => api.boards().then(setBoards).catch((e) => setFailure(`불러오지 못했습니다. ${describeFailure(e)}`))
  useEffect(() => { void loadBoards() }, [api])
  async function chooseBoard(board: Board) { setSelectedBoard(board); setBoardName(board.name); setDescription(board.description); setSelectedPost(null); setTitle(''); setBody(''); try { setPosts(await api.posts(board.id)) } catch (e) { setFailure(describeFailure(e)) } }
  function newBoard() { setSelectedBoard(null); setBoardName(''); setDescription(''); setPosts([]); setSelectedPost(null); setTitle(''); setBody('') }
  async function saveBoard(event: FormEvent) { event.preventDefault(); setFailure(null); const action = selectedBoard ? '수정' : '등록'; try { const saved = selectedBoard ? await api.updateBoard(selectedBoard.id, { name: boardName, description }) : await api.createBoard({ name: boardName, description }); await loadBoards(); await chooseBoard(saved); notifySiteUpdated(); notifyCmsSuccess(`게시판을 ${action}했습니다.`) } catch (e) { setFailure(`게시판을 저장하지 못했습니다. ${describeFailure(e)}`) } }
  async function removeBoard() { if (!selectedBoard || !window.confirm('게시판과 게시물을 삭제할까요?')) return; setFailure(null); try { await api.deleteBoard(selectedBoard.id); newBoard(); await loadBoards(); notifySiteUpdated(); notifyCmsSuccess('게시판을 삭제했습니다.') } catch (e) { setFailure(`게시판을 삭제하지 못했습니다. ${describeFailure(e)}`) } }
  function choosePost(post: Post | null) { setSelectedPost(post); setTitle(post?.title ?? ''); setBody(post?.body ?? '') }
  async function savePost(event: FormEvent) { event.preventDefault(); if (!selectedBoard) return; setFailure(null); const action = selectedPost ? '수정' : '등록'; try { if (selectedPost) await api.updatePost(selectedPost.id, { title, body }); else await api.createPost(selectedBoard.id, { title, body }); choosePost(null); setPosts(await api.posts(selectedBoard.id)); notifySiteUpdated(); notifyCmsSuccess(`게시물을 ${action}했습니다.`) } catch (e) { setFailure(`게시물을 저장하지 못했습니다. ${describeFailure(e)}`) } }
  async function removePost() { if (!selectedPost || !selectedBoard || !window.confirm('게시물을 삭제할까요?')) return; setFailure(null); try { await api.deletePost(selectedPost.id); choosePost(null); setPosts(await api.posts(selectedBoard.id)); notifySiteUpdated(); notifyCmsSuccess('게시물을 삭제했습니다.') } catch (e) { setFailure(`게시물을 삭제하지 못했습니다. ${describeFailure(e)}`) } }
  return <><Heading title="게시판 관리" description="게시판과 게시글을 관리하고 메뉴 관리에서 연결합니다." /><Failure value={failure} /><div className="grid gap-[14px] 2xl:grid-cols-[260px_minmax(280px,.8fr)_minmax(320px,1fr)]"><section className={card}><div className={panelHead}><div><b className="text-[13px]">게시판</b><small className="mt-[3px] block text-[10px] font-normal text-[#91a0a9]">총 {boards.length}건</small></div><button className={secondary} onClick={newBoard}>새 게시판</button></div>{boards.length === 0 ? <EmptyState>등록된 게시판이 없습니다.</EmptyState> : boards.map((board) => <button key={board.id} className={`flex w-full items-center gap-[10px] border-b border-[#edf1f3] py-3 text-left text-[#526876] hover:bg-[#f7fafb] ${selectedBoard?.id === board.id ? 'bg-[#f7fafb]' : ''}`} onClick={() => void chooseBoard(board)}><span className="text-accent-ink" aria-hidden="true">▦</span><div className="mr-auto min-w-0"><b className="block text-[11px]">{board.name}</b><small className="mt-[3px] block text-[10px] text-[#9aa7af]">{board.description}</small></div><span className="text-[#9aa8af]" aria-hidden="true">›</span></button>)}</section><section className="grid content-start gap-[14px]"><form className={`${card} grid gap-[14px]`} onSubmit={saveBoard}><div className={panelHead}><div><b className="text-[13px]">{selectedBoard ? '게시판 수정' : '게시판 등록'}</b><small className="mt-[3px] block text-[10px] font-normal text-[#91a0a9]">{selectedBoard ? '선택한 게시판을 수정합니다.' : '새 게시판을 추가합니다.'}</small></div></div><label className={field}>게시판명<input className={input} placeholder="게시판명을 입력하세요" value={boardName} onChange={(e) => setBoardName(e.target.value)} required /></label><label className={field}>설명<textarea className={input} placeholder="설명을 입력하세요" value={description} onChange={(e) => setDescription(e.target.value)} /></label><div className="flex justify-end gap-[7px]">{selectedBoard && <button type="button" className={danger} onClick={() => void removeBoard()}>삭제</button>}<button className={primary}>저장</button></div></form>{selectedBoard && <div className={card}><div className={panelHead}><div><b className="text-[13px]">게시물</b><small className="mt-[3px] block text-[10px] font-normal text-[#91a0a9]">{selectedBoard.name} · 총 {posts.length}건</small></div><button className={secondary} onClick={() => choosePost(null)}>새 게시물</button></div>{posts.length === 0 ? <EmptyState>등록된 게시물이 없습니다.</EmptyState> : posts.map((post) => <button className="flex w-full items-center gap-[10px] border-b border-[#edf1f3] py-3 text-left text-[#526876] hover:bg-[#f7fafb]" key={post.id} onClick={() => choosePost(post)}><div className="mr-auto min-w-0"><b className="block text-[11px]">{post.title}</b><small className="mt-[3px] block text-[10px] text-[#9aa7af]">{date(post.updatedAt)}</small></div><span className="text-[#9aa8af]" aria-hidden="true">›</span></button>)}</div>}</section><form className={`${card} grid content-start gap-[14px]`} onSubmit={savePost}><div className={panelHead}><div><b className="text-[13px]">{selectedPost ? '게시물 수정' : '게시물 등록'}</b><small className="mt-[3px] block text-[10px] font-normal text-[#91a0a9]">{selectedBoard ? selectedBoard.name : '게시판 선택 후 작성할 수 있습니다.'}</small></div></div>{selectedBoard ? <><label className={field}>제목<input className={input} placeholder="제목을 입력하세요" value={title} onChange={(e) => setTitle(e.target.value)} required /></label><label className={field}>내용<textarea className={`${input} min-h-[280px]`} placeholder="내용을 입력하세요" value={body} onChange={(e) => setBody(e.target.value)} required /></label><div className="flex justify-end gap-[7px]">{selectedPost && <button type="button" className={danger} onClick={() => void removePost()}>삭제</button>}<button className={primary}>저장</button></div></> : <EmptyState>게시판을 먼저 선택하세요.</EmptyState>}</form></div></>
}

function Templates({ api }: { api: CmsApi }) {
  const [items, setItems] = useState<SiteTemplate[]>([])
  const [value, setValue] = useState<SiteTemplate | null>(null)
  const [preview, setPreview] = useState<SiteTemplate | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const load = () => api.templates().then((next) => { setItems(next); setValue((current) => current ? next.find((item) => item.key === current.key) ?? current : next.find((item) => item.active) ?? next[0]) }).catch((e) => setFailure(`불러오지 못했습니다. ${describeFailure(e)}`))
  useEffect(() => { void load() }, [api])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!value) return
    setFailure(null)
    try { setValue(await api.saveTemplate(value)); await load(); notifySiteUpdated(); notifyCmsSuccess('템플릿을 저장하고 사용자 사이트에 적용했습니다.') } catch (e) { setFailure(`템플릿을 저장하지 못했습니다. ${describeFailure(e)}`) }
  }
  function select(item: SiteTemplate) { setFailure(null); setValue(item) }

  return <>
    <Heading title="템플릿 관리" description="공통 디자인과 메인 화면, Header, Footer를 한곳에서 관리합니다." />
    <Failure value={failure} />
    <div className="mb-[14px] grid gap-[14px] md:grid-cols-3">
      {items.map((item) => <article key={item.key} className={`${card} grid content-start gap-4 ${value?.key === item.key ? 'border-accent ring-2 ring-accent-soft' : ''}`}>
        <button type="button" className="text-left" aria-label={`${item.key} 템플릿 선택`} onClick={() => select(item)}>
          <span className="flex items-center gap-2 text-[10px] font-bold text-accent-ink">{item.key}{item.active && <Badge tone="mint">ACTIVE</Badge>}</span>
          <h2 className="mb-1 mt-3 text-lg">{item.siteName}</h2>
          <span className="text-[10px] text-[#91a0a9]">{item.layout}</span>
        </button>
        <button type="button" className={secondary} aria-label={`${item.key} 템플릿 미리보기`} onClick={() => setPreview(item)}>미리보기</button>
      </article>)}
    </div>
    {value && <form className={`${card} grid gap-5 md:grid-cols-2`} onSubmit={submit}>
      <div className={`${panelHead} md:col-span-2`}>
        <div><b className="text-[13px]">{value.key} 템플릿 설정</b><small className="mt-[3px] block text-[10px] font-normal text-[#91a0a9]">저장하면 이 템플릿이 사용자 사이트에 적용됩니다.</small></div>
        <button type="button" className={secondary} onClick={() => setPreview(value)}>현재 입력값 미리보기</button>
      </div>
      <TemplateField label="레이아웃" description="Header와 메인 영역의 배치·여백·강조 방식을 선택합니다.">
        <select className={input} value={value.layout} onChange={(e) => setValue({ ...value, layout: e.target.value })}><option value="CLASSIC">Corporate</option><option value="MINIMAL">Minimal</option><option value="BOLD">Bold</option></select>
      </TemplateField>
      <TemplateField label="대표 색상" description="버튼, 링크, 강조 요소에 공통 적용되는 브랜드 색상입니다.">
        <input className={`${input} h-[44px]`} type="color" value={value.primaryColor} onChange={(e) => setValue({ ...value, primaryColor: e.target.value })} />
      </TemplateField>
      <TemplateField label="사이트명" description="사용자 화면 Header와 Footer에 표시되는 사이트 이름입니다.">
        <input className={input} value={value.siteName} onChange={(e) => setValue({ ...value, siteName: e.target.value })} required />
      </TemplateField>
      <TemplateField label="Header 보조 문구" description="사용자 화면 맨 위 안내 영역에 표시되는 짧은 문구입니다.">
        <input className={input} value={value.headerText} onChange={(e) => setValue({ ...value, headerText: e.target.value })} />
      </TemplateField>
      <TemplateField wide label="메인 대표 이미지 URL" description="메인 첫 화면의 배경 이미지 주소입니다. /images/... 형식을 사용할 수 있습니다.">
        <input className={input} value={value.heroImageUrl} onChange={(e) => setValue({ ...value, heroImageUrl: e.target.value })} required />
      </TemplateField>
      <TemplateField wide label="메인 대표 문구" description="메인 대표 이미지 위에 가장 크게 표시되는 제목입니다.">
        <input className={input} value={value.heroTitle} onChange={(e) => setValue({ ...value, heroTitle: e.target.value })} required />
      </TemplateField>
      <TemplateField wide label="메인 설명" description="대표 문구 아래에 표시되는 소개 문장입니다.">
        <textarea className={input} value={value.heroSubtitle} onChange={(e) => setValue({ ...value, heroSubtitle: e.target.value })} />
      </TemplateField>
      <TemplateField label="메인 버튼 문구" description="메인 버튼에 표시되는 텍스트입니다.">
        <input className={input} value={value.heroButtonLabel} onChange={(e) => setValue({ ...value, heroButtonLabel: e.target.value })} />
      </TemplateField>
      <TemplateField label="메인 버튼 URL" description="메인 버튼 클릭 시 이동할 메뉴 경로입니다.">
        <input className={input} value={value.heroButtonUrl} onChange={(e) => setValue({ ...value, heroButtonUrl: e.target.value })} />
      </TemplateField>
      <TemplateField wide label="Footer 문구" description="사용자 화면 하단 공통 영역에 표시되는 안내 문구입니다.">
        <input className={input} value={value.footerText} onChange={(e) => setValue({ ...value, footerText: e.target.value })} />
      </TemplateField>
      <button className={`${primary} md:col-span-2`}>저장하고 사용자 사이트에 적용</button>
    </form>}
    {preview && <TemplatePreview value={preview} onClose={() => setPreview(null)} />}
  </>
}

function TemplateField({ label, description, wide = false, children }: { label: string; description: string; wide?: boolean; children: ReactNode }) {
  return <label className={`grid content-start gap-[7px] text-[10px] font-bold text-[#607783] ${wide ? 'md:col-span-2' : ''}`}><span>{label}</span>{children}<span className="font-normal leading-5 text-[#91a0a9]">{description}</span></label>
}

function TemplatePreview({ value, onClose }: { value: SiteTemplate; onClose: () => void }) {
  const style = { '--preview-brand': value.primaryColor } as CSSProperties
  const minimal = value.layout === 'MINIMAL'
  const bold = value.layout === 'BOLD'
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#173149]/70 p-4" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
    <section className="max-h-[92vh] w-[min(980px,96vw)] overflow-auto rounded-[7px] bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label={`${value.key} 템플릿 미리보기`} style={style}>
      <div className="sticky top-0 z-10 flex items-center border-b border-line bg-white px-5 py-4"><div className="mr-auto"><b className="block text-[13px]">{value.key} 템플릿 미리보기</b><small className="mt-[3px] block text-[10px] text-[#91a0a9]">저장 전 화면 구성 예시입니다.</small></div><button type="button" className={secondary} onClick={onClose}>닫기</button></div>
      <div className={`overflow-hidden ${minimal ? 'bg-white' : 'bg-[#f5f7f6]'}`}>
        <div className="border-b border-[#e5e9e7] bg-white px-7 py-3 text-[10px] text-[#64716c]">{value.headerText}</div>
        <header className={`flex items-center gap-6 bg-white px-7 ${bold ? 'py-6' : 'py-4'}`}><span className="grid h-10 w-10 place-items-center rounded-full text-xs font-black text-white" style={{ background: value.primaryColor }}>AX</span><strong className={`${bold ? 'text-xl uppercase tracking-tight' : 'text-lg'}`}>{value.siteName}</strong><nav className="ml-auto hidden gap-5 text-xs font-bold sm:flex"><span>소개</span><span>Products</span><span>Service</span><span>고객지원</span></nav></header>
        <main className={`relative overflow-hidden ${minimal ? 'grid min-h-[390px] items-center bg-white md:grid-cols-2' : 'min-h-[430px] text-white'}`}>
          <div className={`${minimal ? 'order-2 min-h-[300px]' : 'absolute inset-0'} bg-cover bg-center`} style={{ backgroundImage: `url(${value.heroImageUrl})` }} />
          {!minimal && <div className={`absolute inset-0 ${bold ? 'bg-[linear-gradient(90deg,rgba(20,18,34,.94),rgba(20,18,34,.28))]' : 'bg-[linear-gradient(90deg,rgba(13,47,36,.9),rgba(13,47,36,.22))]'}`} />}
          <div className={`relative z-[1] p-10 ${minimal ? 'order-1 text-[#1c2924]' : 'max-w-[650px] py-20'}`}>
            <span className="text-[10px] font-bold tracking-[.2em]" style={{ color: minimal ? value.primaryColor : '#cce8dc' }}>{value.layout} TEMPLATE</span>
            <h2 className={`${bold ? 'text-5xl uppercase' : 'text-4xl'} mb-4 mt-5 leading-tight tracking-[-.05em]`}>{value.heroTitle}</h2>
            <p className={`max-w-[560px] text-sm leading-7 ${minimal ? 'text-[#62706a]' : 'text-white/75'}`}>{value.heroSubtitle}</p>
            <span className="mt-5 inline-flex rounded-full px-5 py-3 text-xs font-bold text-white" style={{ background: value.primaryColor }}>{value.heroButtonLabel || '버튼 문구'}</span>
          </div>
        </main>
        <footer className="bg-[#17241f] px-7 py-7 text-white"><strong>{value.siteName}</strong><p className="mb-0 mt-2 text-xs text-white/60">{value.footerText}</p></footer>
      </div>
    </section>
  </div>
}

function targetLabel(menu: Menu, contents: Article[], boards: Board[]) {
  if (menu.targetType === 'CONTENT') return `컨텐츠 · ${contents.find((item) => item.id === menu.targetId)?.title ?? '미지정'}`
  if (menu.targetType === 'BOARD') return `게시판 · ${boards.find((item) => item.id === menu.targetId)?.name ?? '미지정'}`
  return '연결 없음'
}
function Detail({ label, value }: { label: string; value: string }) { return <div><span className="block text-[10px] font-bold text-[#84939a]">{label}</span><span className="mt-1 block break-all text-[13px] text-[#4c6471]">{value}</span></div> }

const badgeTones = {
  gray: 'bg-[#eef1f3] text-[#6b7c86] [--dot:#96a3aa]',
  teal: 'bg-accent-soft text-accent-ink [--dot:#5ec3c8]',
  mint: 'bg-mint-soft text-mint [--dot:#60b982]',
  amber: 'bg-amber-soft text-amber [--dot:#dda14e]',
  red: 'bg-red-soft text-red [--dot:#d97973]',
}
function Badge({ tone = 'gray', children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-[5px] whitespace-nowrap rounded-xl px-2 py-[3px] text-[9px] ${badgeTones[tone]}`}><i className="h-[5px] w-[5px] rounded-full bg-[var(--dot)]" aria-hidden="true" />{children}</span>
}
function EmptyState({ children }: { children: ReactNode }) {
  return <p className="m-0 px-[10px] py-[70px] text-center text-[11px] text-[#98a6ae]">{children}</p>
}
function roleLabel(role: string) { return role === 'SUPER_ADMIN' ? '최고관리자' : role === 'GENERAL_ADMIN' ? '일반관리자' : '일반사용자' }
function date(value: string) { return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(value)) }

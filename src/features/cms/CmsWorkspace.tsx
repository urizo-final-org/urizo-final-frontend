import { type CSSProperties, type FormEvent, type ReactNode, useEffect, useState } from 'react'
import type { CmsRouteId } from '../../app/routes'
import { describeFailure } from '../../shared/api/error'
import { Icon } from '../../shared/ui/icons'
import {
  Badge, EmptyState, PageHead, PanelTitle,
  control, fieldLabel, panel, primaryButton, secondaryButton, smallButton, textarea, type Tone,
} from '../../shared/ui/primitives'
import { CmsApi, notifySiteUpdated, type Article, type Board, type Member, type Menu, type MenuTargetType, type Post, type SiteTemplate } from './api'
import CmsAiAssistant, { type CmsAssistantTarget } from './assistant/CmsAiAssistant'
import type { NaturalCmsApi } from './assistant/api'

const dangerButton = 'inline-flex h-8 items-center gap-[0.375rem] rounded-[0.3125rem] border border-[#f0d5d1] bg-fail-bg px-[0.6875rem] text-xs font-semibold text-fail-fg enabled:hover:bg-[#f8e0dc]'
const recordRow = 'flex w-full items-center gap-[0.625rem] border-b border-row-line px-4 py-[0.625rem] text-left text-body hover:bg-sub'
const CMS_SUCCESS_EVENT = 'axms:cms-success'
type SuccessNotice = { id: string; message: string }

export default function CmsWorkspace({ route, api, assistantApi }: { route: CmsRouteId; api: CmsApi; assistantApi: NaturalCmsApi }) {
  const [success, setSuccess] = useState<SuccessNotice | null>(null)
  const [assistantCollapsed, setAssistantCollapsed] = useState(false)
  const [assistantTarget, setAssistantTarget] = useState<CmsAssistantTarget | null>(null)
  const [assistantCandidates, setAssistantCandidates] = useState<CmsAssistantTarget[]>([])
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
  useEffect(() => { setSuccess(null); setAssistantTarget(null); setAssistantCandidates([]) }, [route])
  const workspace = route === 'members' ? <Members api={api} />
    : route === 'menus' ? <Menus api={api} />
      : route === 'contents' ? <Contents api={api} onSelect={setAssistantTarget} onCandidates={setAssistantCandidates} />
        : route === 'boards' ? <Boards api={api} />
          : <Templates api={api} />
  const assistantRoute = route === 'members' ? null : route
  return <>
    <SuccessToast notice={success} />
    {assistantRoute
      ? <div className={`grid items-start gap-[0.875rem] ${assistantCollapsed ? 'min-[1240px]:grid-cols-[minmax(0,1fr)_4rem]' : 'min-[1240px]:grid-cols-[minmax(0,1fr)_22rem]'}`}>
        <div className="min-w-0">{workspace}</div>
        <CmsAiAssistant key={assistantRoute} route={assistantRoute} target={assistantTarget} candidates={assistantCandidates} onTarget={setAssistantTarget} api={assistantApi} collapsed={assistantCollapsed} onToggle={() => setAssistantCollapsed((value) => !value)} />
      </div>
      : workspace}
  </>
}

function Heading({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <PageHead title={title} description={description}>{children}</PageHead>
}
function SuccessToast({ notice }: { notice: SuccessNotice | null }) {
  return notice ? <div className="pointer-events-none fixed inset-0 z-[100] grid place-items-center p-5" aria-live="polite" aria-atomic="true">
    <div key={notice.id} className="cms-success-toast flex max-w-[32.5rem] items-center gap-3 rounded-lg bg-[#16293c] px-6 py-5 text-sm font-semibold text-white shadow-[0_24px_70px_rgba(22,41,60,.35)]" role="status"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-base text-[#16293c]" aria-hidden="true">✓</span><span>{notice.message}</span></div>
  </div> : null
}
function Feedback({ failure }: { failure: string | null }) {
  return failure ? <p className="mb-[0.875rem] flex items-start gap-2 rounded-[0.3125rem] border border-[#f0d5d1] bg-fail-bg p-[0.6875rem] text-[0.71875rem] leading-[1.6] text-fail-fg" role="alert"><Icon name="triangle-alert" size={15} className="mt-[0.0625rem]" />{failure}</p> : null
}
function Failure({ value }: { value: string | null }) { return <Feedback failure={value} /> }

function notifyCmsSuccess(message: string) { window.dispatchEvent(new CustomEvent(CMS_SUCCESS_EVENT, { detail: message })) }

function Members({ api }: { api: CmsApi }) {
  const [items, setItems] = useState<Member[]>([])
  const [selected, setSelected] = useState<Member | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  useEffect(() => { api.members().then(setItems).catch((e) => setFailure(describeFailure(e))) }, [api])
  return <>
    <Heading title="회원 관리" description="시연 회원의 목록과 상세를 조회합니다." />
    <Feedback failure={failure} />
    <div className="grid gap-[0.875rem] lg:grid-cols-[minmax(0,1.5fr)_minmax(17.5rem,1fr)]">
      <section className={panel}>
        <PanelTitle title="회원 목록" sub={`총 ${items.length}건`}><Icon name="search" size={15} className="text-muted-3" /></PanelTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26.25rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-line-soft bg-sub text-[0.6875rem] font-semibold text-muted-2">
                <th className="px-4 py-2 font-semibold">이름</th><th className="font-semibold">로그인 ID</th><th className="font-semibold">역할</th>
              </tr>
            </thead>
            <tbody>
              {items.map((member) => <tr key={member.id} className="cursor-pointer border-b border-row-line text-xs text-body hover:bg-sub" onClick={() => setSelected(member)}>
                <td className="px-4 py-[0.625rem] text-[0.78125rem] font-semibold text-ink">{member.name}</td>
                <td className="font-mono text-[0.71875rem]">{member.loginId}</td>
                <td><Badge tone={member.role === 'SUPER_ADMIN' ? 'wait' : 'idle'}>{roleLabel(member.role)}</Badge></td>
              </tr>)}
            </tbody>
          </table>
        </div>
        {items.length === 0 && <EmptyState icon="users" title="표시할 회원이 없습니다" description="회원 데이터를 불러오면 이곳에 표시됩니다." />}
      </section>
      <aside className={panel}>
        <PanelTitle title="회원 상세" sub="목록에서 선택한 회원 정보" />
        {selected
          ? <div className="grid gap-4 p-4">
            <h2 className="m-0 text-base font-semibold">{selected.name}</h2>
            <Detail label="로그인 ID" value={selected.loginId} />
            <Detail label="역할" value={roleLabel(selected.role)} />
            <Detail label="회원 ID" value={selected.id} />
          </div>
          : <EmptyState icon="users" title="선택된 회원이 없습니다" description="목록에서 회원을 선택하세요." />}
      </aside>
    </div>
  </>
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
  return <>
    <Heading title="메뉴 관리" description="메뉴 구조를 만들고 특정 컨텐츠 또는 게시판을 연결합니다.">
      {editing && <button type="button" className={secondaryButton} onClick={() => select(null)}><Icon name="plus" />새 메뉴</button>}
    </Heading>
    <Failure value={failure} />
    <div className="grid gap-[0.875rem] 2xl:grid-cols-[24.375rem_minmax(0,1fr)]">
      <form className={panel} onSubmit={submit}>
        <PanelTitle title={editing ? '메뉴 수정' : '메뉴 등록'} sub={editing ? '선택한 메뉴를 수정합니다.' : '새 메뉴를 추가합니다.'} />
        <div className="p-4">
          <label className={fieldLabel}>메뉴명<input className={control} value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <label className={`${fieldLabel} mt-[0.875rem]`}>URL 경로<input className={`${control} font-mono`} value={path} onChange={(e) => setPath(e.target.value)} required /></label>
          <label className={`${fieldLabel} mt-[0.875rem]`}>상위 메뉴<select className={control} value={parentId} onChange={(e) => setParentId(e.target.value)}><option value="">대메뉴</option>{items.filter((item) => item.parentId === null && item.id !== editing?.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className={`${fieldLabel} mt-[0.875rem]`}>표시 순서<input className={control} type="number" min="0" value={order} onChange={(e) => setOrder(Number(e.target.value))} /></label>
          <label className={`${fieldLabel} mt-[0.875rem]`}>연결 유형<select className={control} value={targetType} onChange={(e) => { setTargetType(e.target.value as MenuTargetType); setTargetId('') }}><option value="NONE">연결 없음</option><option value="CONTENT">정적 컨텐츠</option><option value="BOARD">게시판</option></select></label>
          {targetType !== 'NONE' && <label className={`${fieldLabel} mt-[0.875rem]`}>연결 대상<select className={control} value={targetId} onChange={(e) => setTargetId(e.target.value)} required><option value="">선택하세요</option>{targetOptions.map((item) => <option key={item.id} value={item.id}>{'title' in item ? item.title : item.name}</option>)}</select></label>}
          <div className="mt-4 flex justify-end gap-2">
            {editing && <button type="button" className={dangerButton} onClick={() => void remove(editing.id)}>삭제</button>}
            <button className={primaryButton}>저장하기</button>
          </div>
        </div>
      </form>
      <section className={panel}>
        <PanelTitle title="메뉴 목록" sub={`총 ${items.length}건`}><Icon name="search" size={15} className="text-muted-3" /></PanelTitle>
        {items.length === 0
          ? <EmptyState icon="menu" title="등록된 메뉴가 없습니다" description="왼쪽 폼에서 첫 메뉴를 추가해 보세요." />
          : items.map((item) => <button type="button" key={item.id} className={recordRow} onClick={() => select(item)}>
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-run-bg text-[0.65625rem] font-bold text-run-fg">{item.displayOrder}</span>
            <span className="min-w-0 flex-1">
              <b className="block text-[0.78125rem] font-semibold text-ink">{item.parentId ? '└ ' : ''}{item.name}</b>
              <small className="block font-mono text-[0.6875rem] text-muted-3">{item.path} · {targetLabel(item, contents, boards)}</small>
            </span>
            <Icon name="chevron-right" className="text-muted-4" />
          </button>)}
      </section>
    </div>
  </>
}

function Contents({ api, onSelect, onCandidates }: {
  api: CmsApi
  onSelect: (target: CmsAssistantTarget | null) => void
  onCandidates: (candidates: CmsAssistantTarget[]) => void
}) {
  /** 미리보기가 변경 전으로 쓸 수 있도록 현재 값을 함께 넘긴다. */
  const contentTarget = (item: Article): CmsAssistantTarget => ({
    type: 'CONTENT',
    id: String(item.id),
    label: item.title,
    fields: { title: item.title, body: item.body },
  })
  const [items, setItems] = useState<Article[]>([])
  const [editing, setEditing] = useState<Article | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [failure, setFailure] = useState<string | null>(null)
  const load = () => api.contents().then(setItems).catch((e) => setFailure(`불러오지 못했습니다. ${describeFailure(e)}`))
  useEffect(() => { void load() }, [api])
  useEffect(() => {
    onCandidates(items.map(contentTarget))
  }, [items, onCandidates])
  function select(item: Article | null) {
    setEditing(item)
    setTitle(item?.title ?? '')
    setBody(item?.body ?? '')
    onSelect(item ? contentTarget(item) : null)
  }
  function insert(mark: string) { setBody((value) => value ? `${value}\n${mark}` : mark) }
  async function submit(event: FormEvent) { event.preventDefault(); setFailure(null); const action = editing ? '수정' : '등록'; try { if (editing) await api.updateContent(editing.id, { title, body }); else await api.createContent({ title, body }); select(null); await load(); notifySiteUpdated(); notifyCmsSuccess(`컨텐츠를 ${action}했습니다.`) } catch (e) { setFailure(`컨텐츠를 저장하지 못했습니다. ${describeFailure(e)}`) } }
  async function remove(id: number) { if (!window.confirm('컨텐츠를 삭제할까요?')) return; setFailure(null); try { await api.deleteContent(id); select(null); await load(); notifySiteUpdated(); notifyCmsSuccess('컨텐츠를 삭제했습니다.') } catch (e) { setFailure(`컨텐츠를 삭제하지 못했습니다. ${describeFailure(e)}`) } }
  return <>
    <Heading title="컨텐츠 관리" description="메뉴에 연결할 정적 페이지를 가벼운 에디터로 작성합니다.">
      <button className={primaryButton} onClick={() => select(null)}><Icon name="plus" />새 컨텐츠</button>
    </Heading>
    <Failure value={failure} />
    <div className="grid gap-[0.875rem] 2xl:grid-cols-[minmax(17.5rem,.75fr)_minmax(0,1.5fr)]">
      <section className={panel}>
        <PanelTitle title="컨텐츠 목록" sub={`총 ${items.length}건`}><Icon name="search" size={15} className="text-muted-3" /></PanelTitle>
        {items.length === 0
          ? <EmptyState icon="file-text" title="등록된 컨텐츠가 없습니다" description="새 컨텐츠 버튼으로 첫 페이지를 만들어 보세요." />
          : items.map((item) => <button key={item.id} className={recordRow} onClick={() => select(item)}>
            <Icon name="file-text" className="text-muted-2" />
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[0.78125rem] font-semibold text-ink">{item.title}</b>
              <small className="block text-[0.6875rem] text-muted-3">{item.authorName} · {date(item.updatedAt)}</small>
            </span>
            <Icon name="chevron-right" className="text-muted-4" />
          </button>)}
      </section>
      <form className={panel} onSubmit={submit}>
        <PanelTitle title={editing ? '컨텐츠 수정' : '컨텐츠 등록'} sub="제목(##), 강조(**문구**), 목록(-) 형식을 지원합니다." />
        <div className="p-4">
          <label className={fieldLabel}>제목<input className={control} placeholder="제목을 입력하세요" value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
          <div className={`${fieldLabel} mt-[0.875rem]`}>본문
            <div className="mt-[0.375rem]">
              <div className="flex flex-wrap gap-2 rounded-t-[0.3125rem] border border-b-0 border-field-line bg-sub p-2">
                <button type="button" className={smallButton} onClick={() => insert('## 제목')}>제목</button>
                <button type="button" className={smallButton} onClick={() => insert('**강조 문구**')}>강조</button>
                <button type="button" className={smallButton} onClick={() => insert('- 목록 항목')}>목록</button>
              </div>
              <textarea className={`${textarea} mt-0 min-h-[21.25rem] rounded-t-none font-mono leading-[1.9]`} placeholder="내용을 입력하세요" value={body} onChange={(e) => setBody(e.target.value)} required />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            {editing && <button type="button" className={dangerButton} onClick={() => void remove(editing.id)}>삭제</button>}
            <button className={primaryButton}>저장하기</button>
          </div>
        </div>
      </form>
    </div>
  </>
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
  return <>
    <Heading title="게시판 관리" description="게시판과 게시글을 관리하고 메뉴 관리에서 연결합니다.">
      <button className={primaryButton} onClick={newBoard}><Icon name="plus" />새 게시판</button>
    </Heading>
    <Failure value={failure} />
    <div className="grid gap-[0.875rem] 2xl:grid-cols-[16.25rem_minmax(17.5rem,.8fr)_minmax(20rem,1fr)]">
      <section className={panel}>
        <PanelTitle title="게시판" sub={`총 ${boards.length}건`} />
        {boards.length === 0
          ? <EmptyState icon="message-square" title="게시판이 없습니다" description="새 게시판 버튼으로 시작하세요." />
          : boards.map((board) => <button key={board.id} className={`${recordRow} ${selectedBoard?.id === board.id ? 'bg-sub' : ''}`} onClick={() => void chooseBoard(board)}>
            <Icon name="message-square" className="text-muted-2" />
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[0.78125rem] font-semibold text-ink">{board.name}</b>
              <small className="block truncate text-[0.6875rem] text-muted-3">{board.description}</small>
            </span>
            <Icon name="chevron-right" className="text-muted-4" />
          </button>)}
      </section>
      <section className="grid content-start gap-[0.875rem]">
        <form className={panel} onSubmit={saveBoard}>
          <PanelTitle title={selectedBoard ? '게시판 수정' : '게시판 등록'} sub={selectedBoard ? '선택한 게시판을 수정합니다.' : '새 게시판을 추가합니다.'} />
          <div className="p-4">
            <label className={fieldLabel}>게시판명<input className={control} placeholder="게시판명을 입력하세요" value={boardName} onChange={(e) => setBoardName(e.target.value)} required /></label>
            <label className={`${fieldLabel} mt-[0.875rem]`}>설명<textarea className={`${textarea} min-h-[4.75rem]`} placeholder="설명을 입력하세요" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
            <div className="mt-4 flex justify-end gap-2">
              {selectedBoard && <button type="button" className={dangerButton} onClick={() => void removeBoard()}>삭제</button>}
              <button className={primaryButton}>저장하기</button>
            </div>
          </div>
        </form>
        {selectedBoard && <div className={panel}>
          <PanelTitle title="게시물" sub={`${selectedBoard.name} · 총 ${posts.length}건`}>
            <button className={smallButton} onClick={() => choosePost(null)}>새 게시물</button>
          </PanelTitle>
          {posts.length === 0
            ? <EmptyState icon="file-text" title="게시물이 없습니다" description="새 게시물 버튼으로 작성하세요." />
            : posts.map((post) => <button className={recordRow} key={post.id} onClick={() => choosePost(post)}>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[0.78125rem] font-semibold text-ink">{post.title}</b>
                <small className="block text-[0.6875rem] text-muted-3">{date(post.updatedAt)}</small>
              </span>
              <Icon name="chevron-right" className="text-muted-4" />
            </button>)}
        </div>}
      </section>
      <form className={`${panel} content-start`} onSubmit={savePost}>
        <PanelTitle title={selectedPost ? '게시물 수정' : '게시물 등록'} sub={selectedBoard ? selectedBoard.name : '게시판 선택 후 작성할 수 있습니다.'} />
        {selectedBoard
          ? <div className="p-4">
            <label className={fieldLabel}>제목<input className={control} placeholder="제목을 입력하세요" value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
            <label className={`${fieldLabel} mt-[0.875rem]`}>내용<textarea className={`${textarea} min-h-[17.5rem]`} placeholder="내용을 입력하세요" value={body} onChange={(e) => setBody(e.target.value)} required /></label>
            <div className="mt-4 flex justify-end gap-2">
              {selectedPost && <button type="button" className={dangerButton} onClick={() => void removePost()}>삭제</button>}
              <button className={primaryButton}>저장하기</button>
            </div>
          </div>
          : <EmptyState icon="message-square" title="게시판을 먼저 선택하세요" description="왼쪽에서 게시판을 고르면 게시물을 작성할 수 있습니다." />}
      </form>
    </div>
  </>
}

function Templates({ api }: { api: CmsApi }) {
  const [items, setItems] = useState<SiteTemplate[]>([])
  const [value, setValue] = useState<SiteTemplate | null>(null)
  const [preview, setPreview] = useState<SiteTemplate | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const load = () => api.templates().then((next) => { setItems(next); setValue((current) => current ? next.find((item) => item.key === current.key) ?? current : next[0]) }).catch((e) => setFailure(`불러오지 못했습니다. ${describeFailure(e)}`))
  useEffect(() => { void load() }, [api])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!value) return
    setFailure(null)
    try { setValue(await api.saveTemplate(value)); await load(); notifySiteUpdated(); notifyCmsSuccess('템플릿을 저장했습니다.') } catch (e) { setFailure(`템플릿을 저장하지 못했습니다. ${describeFailure(e)}`) }
  }
  function select(item: SiteTemplate) { setFailure(null); setValue(item) }

  return <>
    <Heading title="템플릿 관리" description="공통 디자인과 메인 화면, Header, Footer를 한곳에서 관리합니다." />
    <Failure value={failure} />
    <div className="mb-[0.875rem] grid gap-[0.875rem] md:grid-cols-3">
      {items.map((item) => <article key={item.key} className={`${panel} grid content-start gap-3 p-4 ${value?.key === item.key ? 'border-primary ring-2 ring-[#eef2f7]' : ''}`}>
        <button type="button" className="text-left" aria-label={`${item.key} 템플릿 선택`} onClick={() => select(item)}>
          <span className="flex items-center gap-2 text-[0.65625rem] font-semibold text-run-fg">{item.key}</span>
          <h2 className="mb-1 mt-2 text-base font-semibold">{item.siteName}</h2>
          <span className="text-[0.6875rem] text-muted-2">{item.layout}</span>
        </button>
        <button type="button" className={`${secondaryButton} justify-center`} aria-label={`${item.key} 템플릿 미리보기`} onClick={() => setPreview(item)}>미리보기</button>
      </article>)}
    </div>
    {value && <form className={panel} onSubmit={submit}>
      <PanelTitle title={`${value.key} 템플릿 설정`} sub="저장한 내용은 이 템플릿을 사용하는 사이트에 반영됩니다.">
        <button type="button" className={smallButton} onClick={() => setPreview(value)}>현재 입력값 미리보기</button>
      </PanelTitle>
      <div className="grid gap-4 p-4 md:grid-cols-2">
        <TemplateField label="레이아웃" description="Header와 메인 영역의 배치·여백·강조 방식을 선택합니다.">
          <select className={control} value={value.layout} onChange={(e) => setValue({ ...value, layout: e.target.value })}><option value="CLASSIC">Corporate</option><option value="MINIMAL">Minimal</option><option value="BOLD">Bold</option></select>
        </TemplateField>
        <TemplateField label="대표 색상" description="버튼, 링크, 강조 요소에 공통 적용되는 브랜드 색상입니다.">
          <input className={`${control} p-1`} type="color" value={value.primaryColor} onChange={(e) => setValue({ ...value, primaryColor: e.target.value })} />
        </TemplateField>
        <TemplateField label="사이트명" description="사이트명은 사이트 관리에서 변경하며 여기서는 미리보기 값만 표시합니다.">
          <div className="rounded-md border border-line bg-sub px-3 py-2 text-xs text-muted-2">{value.siteName}</div>
        </TemplateField>
        <TemplateField label="Header 보조 문구" description="사용자 화면 맨 위 안내 영역에 표시되는 짧은 문구입니다.">
          <input className={control} value={value.headerText} onChange={(e) => setValue({ ...value, headerText: e.target.value })} />
        </TemplateField>
        <TemplateField wide label="메인 대표 이미지 URL" description="메인 첫 화면의 배경 이미지 주소입니다. /images/... 형식을 사용할 수 있습니다.">
          <input className={`${control} font-mono`} value={value.heroImageUrl} onChange={(e) => setValue({ ...value, heroImageUrl: e.target.value })} required />
        </TemplateField>
        <TemplateField wide label="메인 대표 문구" description="메인 대표 이미지 위에 가장 크게 표시되는 제목입니다.">
          <input className={control} value={value.heroTitle} onChange={(e) => setValue({ ...value, heroTitle: e.target.value })} required />
        </TemplateField>
        <TemplateField wide label="메인 설명" description="대표 문구 아래에 표시되는 소개 문장입니다.">
          <textarea className={textarea} value={value.heroSubtitle} onChange={(e) => setValue({ ...value, heroSubtitle: e.target.value })} />
        </TemplateField>
        <TemplateField label="메인 버튼 문구" description="메인 버튼에 표시되는 텍스트입니다.">
          <input className={control} value={value.heroButtonLabel} onChange={(e) => setValue({ ...value, heroButtonLabel: e.target.value })} />
        </TemplateField>
        <TemplateField label="메인 버튼 URL" description="메인 버튼 클릭 시 이동할 메뉴 경로입니다.">
          <input className={`${control} font-mono`} value={value.heroButtonUrl} onChange={(e) => setValue({ ...value, heroButtonUrl: e.target.value })} />
        </TemplateField>
        <TemplateField wide label="Footer 문구" description="사용자 화면 하단 공통 영역에 표시되는 안내 문구입니다.">
          <input className={control} value={value.footerText} onChange={(e) => setValue({ ...value, footerText: e.target.value })} />
        </TemplateField>
        <div className="md:col-span-2 flex justify-end">
          <button className={primaryButton}>템플릿 저장</button>
        </div>
      </div>
    </form>}
    {preview && <TemplatePreview value={preview} onClose={() => setPreview(null)} />}
  </>
}

function TemplateField({ label, description, wide = false, children }: { label: string; description: string; wide?: boolean; children: ReactNode }) {
  return <label className={`block text-[0.71875rem] font-semibold text-body ${wide ? 'md:col-span-2' : ''}`}><span>{label}</span>{children}<span className="mt-[0.375rem] block font-normal leading-[1.6] text-muted-2">{description}</span></label>
}

export function TemplatePreview({ value, onClose }: { value: SiteTemplate; onClose: () => void }) {
  const style = { '--preview-brand': value.primaryColor } as CSSProperties
  const minimal = value.layout === 'MINIMAL'
  const bold = value.layout === 'BOLD'
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#16293c]/70 p-4" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
    <section className="max-h-[92vh] w-[min(980px,96vw)] overflow-auto rounded-md bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label={`${value.key} 템플릿 미리보기`} style={style}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line-soft bg-white px-4 py-[0.875rem]"><div><b className="block text-[0.84375rem] font-semibold">{value.key} 템플릿 미리보기</b><small className="mt-[0.125rem] block text-[0.6875rem] text-muted-2">저장 전 화면 구성 예시입니다.</small></div><button type="button" className={smallButton} onClick={onClose}>닫기</button></div>
      <div className={`overflow-hidden ${minimal ? 'bg-white' : 'bg-[#f5f7f6]'}`}>
        <div className="border-b border-[#e5e9e7] bg-white px-7 py-3 text-[0.625rem] text-[#64716c]">{value.headerText}</div>
        <header className={`flex items-center gap-6 bg-white px-7 ${bold ? 'py-6' : 'py-4'}`}><span className="grid h-10 w-10 place-items-center rounded-full text-xs font-black text-white" style={{ background: value.primaryColor }}>AX</span><strong className={`${bold ? 'text-xl uppercase tracking-tight' : 'text-lg'}`}>{value.siteName}</strong><nav className="ml-auto hidden gap-5 text-xs font-bold sm:flex"><span>소개</span><span>Products</span><span>Service</span><span>고객지원</span></nav></header>
        <main className={`relative overflow-hidden ${minimal ? 'grid min-h-[24.375rem] items-center bg-white md:grid-cols-2' : 'min-h-[26.875rem] text-white'}`}>
          <div className={`${minimal ? 'order-2 min-h-[18.75rem]' : 'absolute inset-0'} bg-cover bg-center`} style={{ backgroundImage: `url(${value.heroImageUrl})` }} />
          {!minimal && <div className={`absolute inset-0 ${bold ? 'bg-[linear-gradient(90deg,rgba(20,18,34,.94),rgba(20,18,34,.28))]' : 'bg-[linear-gradient(90deg,rgba(13,47,36,.9),rgba(13,47,36,.22))]'}`} />}
          <div className={`relative z-[1] p-10 ${minimal ? 'order-1 text-[#1c2924]' : 'max-w-[40.625rem] py-20'}`}>
            <span className="text-[0.625rem] font-bold tracking-[.2em]" style={{ color: minimal ? value.primaryColor : '#cce8dc' }}>{value.layout} TEMPLATE</span>
            <h2 className={`${bold ? 'text-5xl uppercase' : 'text-4xl'} mb-4 mt-5 leading-tight tracking-[-.05em]`}>{value.heroTitle}</h2>
            <p className={`max-w-[35rem] text-sm leading-7 ${minimal ? 'text-[#62706a]' : 'text-white/75'}`}>{value.heroSubtitle}</p>
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
function Detail({ label, value }: { label: string; value: string }) { return <div><span className="block text-[0.65625rem] text-muted-3">{label}</span><span className="mt-[0.3125rem] block break-all text-[0.78125rem] font-semibold">{value}</span></div> }
function roleLabel(role: string) { return role === 'SUPER_ADMIN' ? '최고관리자' : role === 'GENERAL_ADMIN' ? '일반관리자' : '일반사용자' }
function date(value: string) { return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(value)) }

export type { Tone }

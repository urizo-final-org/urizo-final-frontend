import { Fragment, useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { describeFailure } from '../../shared/api/error'
import { SITE_UPDATE_EVENT, SiteApi, type Article, type Board, type Menu, type Post, type SiteTemplate } from '../cms/api'

export default function PublicSite() {
  const api = useMemo(() => new SiteApi(), [])
  const location = useLocation()
  const [template, setTemplate] = useState<SiteTemplate | null>(null)
  const [menus, setMenus] = useState<Menu[]>([])
  const [boards, setBoards] = useState<Board[]>([])
  const [notices, setNotices] = useState<Post[]>([])
  const [content, setContent] = useState<Article | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [post, setPost] = useState<Post | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const loadSite = useCallback(() => {
    Promise.all([api.template(), api.menus(), api.boards()]).then(([t, m, b]) => {
      setFailure(null)
      setTemplate(t); setMenus(m); setBoards(b)
      if (b[0]) void api.posts(b[0].id).then(setNotices)
    }).catch((error) => setFailure(describeFailure(error)))
  }, [api])

  useEffect(() => {
    loadSite()
  }, [loadSite])

  useEffect(() => {
    const refresh = () => loadSite()
    const refreshFromStorage = (event: StorageEvent) => { if (event.key === SITE_UPDATE_EVENT) refresh() }
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener(SITE_UPDATE_EVENT, refresh)
    window.addEventListener('storage', refreshFromStorage)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.removeEventListener(SITE_UPDATE_EVENT, refresh)
      window.removeEventListener('storage', refreshFromStorage)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [loadSite])

  useEffect(() => {
    setContent(null); setPosts([]); setPost(null); setFailure(null)
    const postMatch = location.pathname.match(/^\/posts\/(\d+)$/)
    if (postMatch) { void api.post(Number(postMatch[1])).then(setPost).catch((e) => setFailure(describeFailure(e))); return }
    const menu = menus.find((item) => item.path === location.pathname)
    if (menu?.targetType === 'CONTENT' && menu.targetId) void api.content(menu.targetId).then(setContent).catch((e) => setFailure(describeFailure(e)))
    if (menu?.targetType === 'BOARD' && menu.targetId) void api.posts(menu.targetId).then(setPosts).catch((e) => setFailure(describeFailure(e)))
  }, [api, location.pathname, menus])

  if (!template) return <div className="grid min-h-screen place-items-center bg-white text-sm text-[#6a8184]">사용자 사이트를 불러오는 중입니다…</div>
  const roots = menus.filter((menu) => menu.parentId === null)
  const currentMenu = menus.find((menu) => menu.path === location.pathname)
  const currentBoard = currentMenu?.targetType === 'BOARD' ? boards.find((board) => board.id === currentMenu.targetId) : null
  const style = { '--brand': template.primaryColor } as CSSProperties

  return <div className={`min-h-screen overflow-x-hidden bg-[#fbfcfa] text-[#263e48] site-${template.layout.toLowerCase()}`} style={style}>
    <header className="relative z-30 bg-white">
      <div className="border-b border-[#e8eeeb] bg-[#f6f9f8]">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-5 py-2 text-[11px] text-[#6a8184]"><span>{template.headerText}</span><Link className="rounded border border-[#dce7e4] px-[10px] py-[6px] text-[10px] font-bold no-underline hover:border-[var(--brand)] hover:text-[var(--brand)]" to="/admin">CMS 관리자</Link></div>
      </div>
      <div className="mx-auto flex min-h-[76px] max-w-[1240px] items-center gap-9 px-5">
        <Link className="mr-auto flex items-center gap-[9px] no-underline" to="/"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-black text-white" style={{ background: `linear-gradient(135deg, ${template.primaryColor}, #2a5f61)` }}>AX</span><span><strong className="block text-[15px] tracking-[-.03em]">{template.siteName}</strong><small className="block text-[9px] font-bold tracking-[.18em] text-[#8fa5a3]">TECHNOLOGY &amp; BUSINESS</small></span></Link>
        <nav className="hidden items-stretch self-stretch lg:flex" aria-label="주 메뉴">
          {roots.map((root) => { const children = menus.filter((item) => item.parentId === root.id); return <div className="group relative flex items-center" key={root.id}><Link className="px-4 py-7 text-xs font-bold no-underline hover:text-[var(--brand)]" to={root.path}>{root.name}</Link>{children.length > 0 && <div className="invisible absolute left-1/2 top-[68px] min-w-[190px] -translate-x-1/2 translate-y-2 rounded-b-lg border-t-2 border-[var(--brand)] bg-white p-2 opacity-0 shadow-[0_18px_45px_rgba(42,95,97,.18)] transition group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">{children.map((child) => <Link className="block rounded px-4 py-[10px] text-xs text-[#587078] no-underline hover:bg-[#eef7f6] hover:text-[var(--brand)]" key={child.id} to={child.path}>{child.name}</Link>)}</div>}</div> })}
        </nav>
      </div>
      <nav className="flex gap-2 overflow-x-auto border-t border-[#e8eeeb] px-4 py-3 lg:hidden" aria-label="모바일 주 메뉴">{roots.map((root) => <Link className="shrink-0 rounded-full bg-[#eef7f6] px-4 py-2 text-[11px] font-bold no-underline" key={root.id} to={root.path}>{root.name}</Link>)}</nav>
    </header>

    {location.pathname === '/' ? <Home template={template} notices={notices} /> : <SubPage menu={currentMenu} menus={menus} board={currentBoard} content={content} posts={posts} post={post} failure={failure} />}

    <footer className="border-t border-[#e4ece9]">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-start justify-between gap-8 px-5 py-9 text-[11px] leading-6 text-[#9aa8a9]">
        <div><strong className="block text-sm text-[#5b6d6e]">{template.siteName}</strong><p className="m-0 mt-2 max-w-xl">{template.footerText}</p></div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2"><Link className="text-inherit no-underline hover:text-[var(--brand)]" to="/about/company">회사 소개</Link><Link className="text-inherit no-underline hover:text-[var(--brand)]" to="/support/notices">공지사항</Link><span>대표전화 02-1234-5678</span><span>평일 09:00–18:00</span></div>
        <span className="w-full border-t border-[#eef2f0] pt-5 text-[10px]">© 2026 {template.siteName}. Local CMS Demo.</span>
      </div>
    </footer>
  </div>
}

function Home({ template, notices }: { template: SiteTemplate; notices: Post[] }) {
  return <main>
    <Hero template={template} />

    <section className="mx-auto max-w-[1240px] px-5 pb-[70px] pt-[30px]"><div className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><p className="mb-2 text-[10px] font-bold tracking-[.14em] text-[var(--brand)]">OUR BUSINESS</p><h2 className="m-0 text-[25px] tracking-[-.05em]">기술로 만드는 새로운 가능성</h2></div><p className="max-w-lg text-[13px] leading-[1.8] text-[#789094]">복잡한 업무를 더 단순하게, 아이디어를 더 빠르게 실현하는 AX 비즈니스 솔루션을 제공합니다.</p></div><div className="grid gap-[18px] md:grid-cols-3">{[['01','AX Module Studio','모듈형 AI 업무 플랫폼으로 조직의 실행력을 높입니다.','/products/ax-module-studio'],['02','Business Solutions','현장의 과제를 중심으로 실용적인 솔루션을 설계합니다.','/products/solutions'],['03','Technical Support','도입부터 운영까지 안정적인 기술 지원을 제공합니다.','/services/technical-support']].map(([number,title,body,path]) => <Link className="group overflow-hidden border border-[#e2ebe8] bg-white pb-4 text-inherit no-underline transition hover:-translate-y-1 hover:shadow-[0_24px_50px_rgba(42,95,97,.12)]" key={number} to={path}><div className="grid h-[125px] place-items-center bg-[#e3f0ed] text-2xl text-[#75aba5] transition group-hover:bg-[var(--brand)] group-hover:text-white">✦</div><span className="mt-4 block px-4 text-[10px] font-bold text-[var(--brand)]">{number}</span><h3 className="mb-[6px] mt-[6px] px-4 text-sm">{title}</h3><p className="m-0 min-h-[34px] px-4 text-[11px] leading-[1.7] text-[#849597]">{body}</p><span className="mt-3 flex items-center gap-1 px-4 text-[10px] text-[#599793]">자세히 보기 →</span></Link>)}</div></section>

    <section className="bg-[#eef7f6] px-5 py-[70px]"><div className="mx-auto grid max-w-[1240px] items-center gap-12 lg:grid-cols-[.9fr_1.1fr]"><div className="relative min-h-[350px] overflow-hidden rounded-[5px] bg-[linear-gradient(145deg,#2a6f6b,#b6d8d4)]"><div className="absolute -right-20 top-12 h-72 w-72 rounded-full border-[50px] border-white/15"/><div className="absolute bottom-9 left-9 text-white"><strong className="block text-5xl">10+</strong><span className="mt-2 block text-[13px] text-white/70">Years of trusted technology</span></div></div><div><p className="text-[10px] font-bold tracking-[.14em] text-[var(--brand)]">WHY AX BIO STUDIO</p><h2 className="my-[7px] text-[25px] leading-tight tracking-[-.05em]">신뢰할 수 있는 기술,<br/>함께 성장하는 파트너</h2><p className="text-[13px] leading-[1.8] text-[#789094]">우리는 기술 그 자체보다 기술이 만들어내는 변화에 집중합니다. 간결한 접근과 유연한 협업으로 고객의 다음 성장을 준비합니다.</p><div className="mt-8 grid grid-cols-3 gap-4">{[['120+','Projects'],['98%','Satisfaction'],['24/7','Support']].map(([value,label]) => <div key={label}><strong className="block text-2xl text-[#3e7d7a]">{value}</strong><span className="text-[11px] text-[#849597]">{label}</span></div>)}</div></div></div></section>

    <section className="mx-auto grid max-w-[1240px] gap-10 border-t border-[#e4ece9] px-5 pb-[70px] pt-[30px] lg:grid-cols-[.7fr_1.3fr]"><div><p className="text-[10px] font-bold tracking-[.14em] text-[var(--brand)]">NEWS &amp; NOTICE</p><h2 className="my-[7px] text-[25px] tracking-[-.05em]">새로운 소식</h2><p className="text-[13px] leading-[1.8] text-[#849597]">AX Bio Studio의 주요 소식과 안내를 확인하세요.</p><Link className="mt-4 inline-block text-[11px] font-bold text-[var(--brand)]" to="/support/notices">공지사항 전체보기 →</Link></div><div className="border-t border-[#e4ece9]">{notices.slice(0, 4).map((notice) => <Link className="grid gap-2 border-b border-[#e4ece9] py-[18px] text-inherit no-underline md:grid-cols-[1fr_auto]" key={notice.id} to={`/posts/${notice.id}`}><strong className="text-[13px]">{notice.title}</strong><span className="text-[11px] text-[#9aa8a9]">{date(notice.createdAt)}</span></Link>)}</div></section>
  </main>
}

function Hero({ template }: { template: SiteTemplate }) {
  if (template.layout === 'MINIMAL') return <section className="bg-[#fbfcfa]" aria-label="MINIMAL 템플릿 메인">
    <div className="mx-auto grid max-w-[1240px] items-center gap-[60px] px-5 pb-20 pt-[75px] md:grid-cols-2">
      <div className="max-w-[540px]"><p className="mb-3 text-[10px] font-bold tracking-[.14em] text-[var(--brand)]">MINIMAL TEMPLATE</p><h1 className="m-0 text-[clamp(2.1rem,4.2vw,2.875rem)] font-medium leading-[1.2] tracking-[-.07em]">{template.heroTitle}</h1><p className="mb-6 mt-4 text-[13px] leading-[1.8] text-[#789094]">{template.heroSubtitle}</p><Link className="inline-flex items-center gap-2 rounded-[5px] px-5 py-3 text-xs font-bold text-white no-underline" style={{ background: template.primaryColor }} to={template.heroButtonUrl}>{template.heroButtonLabel}<span>→</span></Link></div>
      <div className="min-h-[290px] rounded-[5px] bg-cover bg-center" style={{ backgroundImage: `url(${template.heroImageUrl})` }} />
    </div>
  </section>

  if (template.layout === 'BOLD') return <section className="relative min-h-[470px] overflow-hidden bg-[#17313a] text-white" aria-label="BOLD 템플릿 메인">
    <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${template.heroImageUrl})` }} />
    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(23,49,58,.96)_0%,rgba(23,49,58,.78)_52%,rgba(23,49,58,.2)_100%)]" />
    <div className="relative z-10 mx-auto flex min-h-[470px] max-w-[1240px] items-center px-5 py-[75px]"><div className="max-w-[820px]"><p className="mb-3 text-[10px] font-black tracking-[.2em] text-white/65">BOLD TEMPLATE</p><h1 className="m-0 text-[clamp(2.4rem,5.5vw,3.6rem)] font-black uppercase leading-[1.05] tracking-[-.07em]">{template.heroTitle}</h1><p className="mb-6 mt-4 max-w-[650px] text-[13px] leading-[1.8] text-white/75">{template.heroSubtitle}</p><Link className="inline-flex items-center gap-2 rounded-[5px] px-5 py-3 text-xs font-black text-white no-underline" style={{ background: template.primaryColor }} to={template.heroButtonUrl}>{template.heroButtonLabel}<span>→</span></Link></div></div>
  </section>

  return <section className="relative min-h-[450px] overflow-hidden bg-[#1e4f4d] text-white" aria-label="CLASSIC 템플릿 메인">
    <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${template.heroImageUrl})` }} />
    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(20,58,58,.9)_0%,rgba(20,58,58,.58)_48%,rgba(20,58,58,.08)_100%)]" />
    <div className="relative z-10 mx-auto flex min-h-[450px] max-w-[1240px] items-center px-5 py-[75px]"><div className="max-w-[680px]"><p className="mb-3 text-[10px] font-bold tracking-[.14em] text-[#a9dcd7]">INNOVATION FOR LIFE</p><h1 className="m-0 text-[clamp(2.1rem,4.6vw,2.875rem)] font-medium leading-[1.2] tracking-[-.07em]">{template.heroTitle}</h1><p className="mb-6 mt-4 max-w-[600px] text-[13px] leading-[1.8] text-white/80">{template.heroSubtitle}</p><Link className="inline-flex items-center gap-2 rounded-[5px] bg-white px-5 py-3 text-xs font-bold text-[#1e4f4d] no-underline shadow-lg hover:-translate-y-0.5" to={template.heroButtonUrl}>{template.heroButtonLabel}<span>→</span></Link></div></div>
  </section>
}

function SubPage({ menu, menus, board, content, posts, post, failure }: { menu?: Menu; menus: Menu[]; board: Board | null | undefined; content: Article | null; posts: Post[]; post: Post | null; failure: string | null }) {
  const title = post?.title ?? content?.title ?? board?.name ?? menu?.name ?? '페이지를 찾을 수 없습니다'
  const children = menu ? menus.filter((item) => item.parentId === menu.id) : []
  return <main><section className="bg-[linear-gradient(135deg,#2a5f61,#4d9997)] px-5 py-[60px] text-white"><div className="mx-auto max-w-[1100px]"><p className="mb-2 text-[10px] font-bold tracking-[.14em] text-white/55">AX BIO STUDIO</p><h1 className="m-0 text-[clamp(1.9rem,4vw,2.5rem)] font-medium tracking-[-.06em]">{title}</h1></div></section><div className="mx-auto min-h-[480px] max-w-[1100px] px-5 py-14">{failure && <p className="flex items-start gap-2 rounded-[5px] border border-[#f2d5d3] bg-[#fdebea] p-4 text-xs leading-5 text-[#b4615d]" role="alert"><span aria-hidden="true">⚠</span>{failure}</p>}{content && <article className="mx-auto max-w-[850px]"><RichText body={content.body} /></article>}{post && <article className="mx-auto max-w-[850px]"><p className="border-b border-[#e4ece9] pb-4 text-[11px] text-[#849597]">{date(post.createdAt)} · {post.authorName}</p><RichText body={post.body} /></article>}{board && <section><p className="mb-7 text-[13px] leading-[1.8] text-[#6a8184]">{board.description}</p><div className="border-t-2 border-[#2a5f61]">{posts.map((item, index) => <Link className="grid grid-cols-[60px_1fr_auto] items-center gap-4 border-b border-[#e4ece9] px-3 py-[18px] text-inherit no-underline hover:bg-[#f7fbfa]" key={item.id} to={`/posts/${item.id}`}><span className="text-center text-[11px] text-[#9aa8a9]">{posts.length - index}</span><strong className="text-[13px]">{item.title}</strong><span className="text-[11px] text-[#9aa8a9]">{date(item.createdAt)}</span></Link>)}{posts.length === 0 && <p className="border-b border-[#e4ece9] py-14 text-center text-[11px] text-[#9aa8a9]">등록된 게시물이 없습니다.</p>}</div></section>}{children.length > 0 && <div className="grid gap-[18px] md:grid-cols-2">{children.map((child) => <Link className="border border-[#e2ebe8] bg-white p-6 text-inherit no-underline hover:border-[var(--brand)]" key={child.id} to={child.path}><span className="text-[10px] font-bold tracking-[.14em] text-[var(--brand)]">{child.targetType === 'BOARD' ? 'BOARD' : 'PAGE'}</span><h2 className="mb-2 mt-3 text-lg tracking-[-.03em]">{child.name}</h2><p className="m-0 text-[11px] text-[#599793]">자세히 보기 →</p></Link>)}</div>}{!content && !board && !post && children.length === 0 && !failure && <p className="py-16 text-center text-[11px] text-[#9aa8a9]">연결된 페이지가 없습니다.</p>}</div></main>
}

function RichText({ body }: { body: string }) {
  return <div className="text-[16px] leading-8 text-[#4a6167]">{body.split('\n').map((line, index) => {
    if (line.startsWith('## ')) return <h2 className="mb-4 mt-9 text-[25px] tracking-[-.05em] text-[#263e48]" key={index}>{inline(line.slice(3))}</h2>
    if (line.startsWith('- ')) return <div className="my-2 flex gap-3" key={index}><span className="text-[var(--brand)]">●</span><span>{inline(line.slice(2))}</span></div>
    if (!line.trim()) return <div className="h-3" key={index} />
    return <p className="my-3" key={index}>{inline(line)}</p>
  })}</div>
}
function inline(value: string): ReactNode { return value.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : <Fragment key={index}>{part}</Fragment>) }
function date(value: string) { return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(value)) }

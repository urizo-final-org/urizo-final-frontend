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

  if (!template) return <div className="grid min-h-screen place-items-center bg-white text-sm text-[#466057]">사용자 사이트를 불러오는 중입니다…</div>
  const roots = menus.filter((menu) => menu.parentId === null)
  const currentMenu = menus.find((menu) => menu.path === location.pathname)
  const currentBoard = currentMenu?.targetType === 'BOARD' ? boards.find((board) => board.id === currentMenu.targetId) : null
  const style = { '--brand': template.primaryColor } as CSSProperties

  return <div className={`min-h-screen overflow-x-hidden bg-white text-[#1c2924] site-${template.layout.toLowerCase()}`} style={style}>
    <header className="relative z-30 bg-white">
      <div className="border-b border-[#e7ece9] bg-[#f7f9f8]">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-2 text-[11px] text-[#66766f]"><span>{template.headerText}</span><Link className="font-bold hover:text-[var(--brand)]" to="/admin">CMS 관리자</Link></div>
      </div>
      <div className="mx-auto flex min-h-[88px] max-w-[1240px] items-center gap-10 px-5">
        <Link className="mr-auto flex items-center gap-3 no-underline" to="/"><span className="grid h-11 w-11 place-items-center rounded-full text-sm font-black text-white" style={{ background: `linear-gradient(135deg, ${template.primaryColor}, #173d32)` }}>AX</span><span><strong className="block text-xl tracking-[-.04em]">{template.siteName}</strong><small className="block text-[9px] font-bold tracking-[.18em] text-[#7d8d86]">TECHNOLOGY &amp; BUSINESS</small></span></Link>
        <nav className="hidden items-stretch self-stretch lg:flex" aria-label="주 메뉴">
          {roots.map((root) => { const children = menus.filter((item) => item.parentId === root.id); return <div className="group relative flex items-center" key={root.id}><Link className="px-5 py-8 text-[15px] font-bold no-underline hover:text-[var(--brand)]" to={root.path}>{root.name}</Link>{children.length > 0 && <div className="invisible absolute left-1/2 top-[76px] min-w-[190px] -translate-x-1/2 translate-y-2 rounded-b-xl border-t-2 border-[var(--brand)] bg-white p-2 opacity-0 shadow-[0_18px_45px_rgba(25,52,42,.18)] transition group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">{children.map((child) => <Link className="block rounded-lg px-4 py-3 text-sm text-[#50615a] no-underline hover:bg-[#f1f6f3] hover:text-[var(--brand)]" key={child.id} to={child.path}>{child.name}</Link>)}</div>}</div> })}
        </nav>
      </div>
      <nav className="flex gap-2 overflow-x-auto border-t border-[#edf0ee] px-4 py-3 lg:hidden" aria-label="모바일 주 메뉴">{roots.map((root) => <Link className="shrink-0 rounded-full bg-[#f0f5f2] px-4 py-2 text-xs font-bold no-underline" key={root.id} to={root.path}>{root.name}</Link>)}</nav>
    </header>

    {location.pathname === '/' ? <Home template={template} notices={notices} /> : <SubPage menu={currentMenu} menus={menus} board={currentBoard} content={content} posts={posts} post={post} failure={failure} />}

    <footer className="bg-[#15251f] text-white">
      <div className="mx-auto grid max-w-[1240px] gap-8 px-5 py-12 md:grid-cols-[1.2fr_1fr]">
        <div><strong className="text-xl">{template.siteName}</strong><p className="mt-4 max-w-xl text-sm leading-7 text-white/60">{template.footerText}</p></div>
        <div className="grid grid-cols-2 gap-4 text-sm text-white/65"><Link className="text-inherit" to="/about/company">회사 소개</Link><Link className="text-inherit" to="/support/notices">공지사항</Link><span>대표전화 02-1234-5678</span><span>평일 09:00–18:00</span></div>
      </div>
      <div className="border-t border-white/10 px-5 py-5 text-center text-[11px] text-white/40">© 2026 {template.siteName}. Local CMS Demo.</div>
    </footer>
  </div>
}

function Home({ template, notices }: { template: SiteTemplate; notices: Post[] }) {
  return <main>
    <Hero template={template} />

    <section className="mx-auto max-w-[1240px] px-5 py-24"><div className="mb-12 flex flex-wrap items-end justify-between gap-5"><div><p className="mb-3 text-xs font-bold tracking-[.18em] text-[var(--brand)]">OUR BUSINESS</p><h2 className="m-0 text-[clamp(2rem,4vw,3.2rem)] tracking-[-.05em]">기술로 만드는 새로운 가능성</h2></div><p className="max-w-lg text-sm leading-7 text-[#64736d]">복잡한 업무를 더 단순하게, 아이디어를 더 빠르게 실현하는 AX 비즈니스 솔루션을 제공합니다.</p></div><div className="grid gap-5 md:grid-cols-3">{[['01','AX Module Studio','모듈형 AI 업무 플랫폼으로 조직의 실행력을 높입니다.','/products/ax-module-studio'],['02','Business Solutions','현장의 과제를 중심으로 실용적인 솔루션을 설계합니다.','/products/solutions'],['03','Technical Support','도입부터 운영까지 안정적인 기술 지원을 제공합니다.','/services/technical-support']].map(([number,title,body,path]) => <Link className="group min-h-[300px] overflow-hidden rounded-2xl border border-[#e2e9e5] bg-[#f7faf8] p-8 text-inherit no-underline transition hover:-translate-y-1 hover:shadow-[0_24px_50px_rgba(33,71,57,.12)]" key={number} to={path}><span className="text-xs font-bold text-[var(--brand)]">{number}</span><div className="mt-16 grid h-14 w-14 place-items-center rounded-full bg-white text-xl shadow-sm transition group-hover:bg-[var(--brand)] group-hover:text-white">✦</div><h3 className="mb-3 mt-6 text-xl">{title}</h3><p className="m-0 text-sm leading-7 text-[#687770]">{body}</p></Link>)}</div></section>

    <section className="bg-[#eef5f1] px-5 py-24"><div className="mx-auto grid max-w-[1240px] items-center gap-14 lg:grid-cols-[.9fr_1.1fr]"><div className="relative min-h-[420px] overflow-hidden rounded-[28px] bg-[linear-gradient(145deg,#1e5845,#8bc9aa)]"><div className="absolute -right-20 top-12 h-72 w-72 rounded-full border-[50px] border-white/15"/><div className="absolute bottom-10 left-10 text-white"><strong className="block text-6xl">10+</strong><span className="mt-2 block text-sm text-white/70">Years of trusted technology</span></div></div><div><p className="text-xs font-bold tracking-[.18em] text-[var(--brand)]">WHY AX BIO STUDIO</p><h2 className="text-[clamp(2rem,4vw,3.2rem)] leading-tight tracking-[-.05em]">신뢰할 수 있는 기술,<br/>함께 성장하는 파트너</h2><p className="text-sm leading-8 text-[#62726b]">우리는 기술 그 자체보다 기술이 만들어내는 변화에 집중합니다. 간결한 접근과 유연한 협업으로 고객의 다음 성장을 준비합니다.</p><div className="mt-9 grid grid-cols-3 gap-4">{[['120+','Projects'],['98%','Satisfaction'],['24/7','Support']].map(([value,label]) => <div key={label}><strong className="block text-2xl text-[#1f493b]">{value}</strong><span className="text-xs text-[#75847d]">{label}</span></div>)}</div></div></div></section>

    <section className="mx-auto grid max-w-[1240px] gap-12 px-5 py-24 lg:grid-cols-[.7fr_1.3fr]"><div><p className="text-xs font-bold tracking-[.18em] text-[var(--brand)]">NEWS &amp; NOTICE</p><h2 className="text-4xl tracking-[-.05em]">새로운 소식</h2><p className="text-sm leading-7 text-[#687770]">AX Bio Studio의 주요 소식과 안내를 확인하세요.</p><Link className="mt-5 inline-block text-sm font-bold text-[var(--brand)]" to="/support/notices">공지사항 전체보기 →</Link></div><div className="border-t border-[#cfd9d4]">{notices.slice(0, 4).map((notice) => <Link className="grid gap-2 border-b border-[#dce4e0] py-6 text-inherit no-underline md:grid-cols-[1fr_auto]" key={notice.id} to={`/posts/${notice.id}`}><strong>{notice.title}</strong><span className="text-xs text-[#7d8a84]">{date(notice.createdAt)}</span></Link>)}</div></section>
  </main>
}

function Hero({ template }: { template: SiteTemplate }) {
  if (template.layout === 'MINIMAL') return <section className="bg-white" aria-label="MINIMAL 템플릿 메인">
    <div className="mx-auto grid min-h-[560px] max-w-[1240px] items-stretch md:grid-cols-2">
      <div className="flex items-center px-5 py-20 md:px-10 md:py-24"><div className="max-w-[540px]"><p className="mb-7 text-xs font-bold tracking-[.22em] text-[var(--brand)]">MINIMAL TEMPLATE</p><h1 className="m-0 text-[clamp(2.7rem,5vw,4.5rem)] font-medium leading-[1.08] tracking-[-.055em]">{template.heroTitle}</h1><p className="mb-8 mt-7 text-[16px] leading-8 text-[#69776f]">{template.heroSubtitle}</p><Link className="inline-flex items-center gap-4 rounded-full px-7 py-4 text-sm font-bold text-white no-underline" style={{ background: template.primaryColor }} to={template.heroButtonUrl}>{template.heroButtonLabel}<span>→</span></Link></div></div>
      <div className="min-h-[380px] bg-cover bg-center md:min-h-[560px]" style={{ backgroundImage: `url(${template.heroImageUrl})` }} />
    </div>
  </section>

  if (template.layout === 'BOLD') return <section className="relative min-h-[650px] overflow-hidden bg-[#171522] text-white" aria-label="BOLD 템플릿 메인">
    <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${template.heroImageUrl})` }} />
    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(20,18,34,.96)_0%,rgba(20,18,34,.78)_52%,rgba(20,18,34,.2)_100%)]" />
    <div className="relative z-10 mx-auto flex min-h-[650px] max-w-[1240px] items-center px-5 py-24"><div className="max-w-[820px]"><p className="mb-6 text-xs font-black tracking-[.28em] text-white/65">BOLD TEMPLATE</p><h1 className="m-0 text-[clamp(3.2rem,7vw,6.4rem)] font-black uppercase leading-[.95] tracking-[-.065em]">{template.heroTitle}</h1><p className="mb-9 mt-8 max-w-[650px] text-[18px] leading-8 text-white/75">{template.heroSubtitle}</p><Link className="inline-flex items-center gap-4 rounded-full px-8 py-4 text-sm font-black text-white no-underline" style={{ background: template.primaryColor }} to={template.heroButtonUrl}>{template.heroButtonLabel}<span>→</span></Link></div></div>
  </section>

  return <section className="relative min-h-[620px] overflow-hidden bg-[#1d4437] text-white" aria-label="CLASSIC 템플릿 메인">
    <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${template.heroImageUrl})` }} />
    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,35,27,.9)_0%,rgba(10,35,27,.58)_48%,rgba(10,35,27,.08)_100%)]" />
    <div className="relative z-10 mx-auto flex min-h-[620px] max-w-[1240px] items-center px-5 py-24"><div className="max-w-[680px]"><p className="mb-5 text-xs font-bold tracking-[.22em] text-[#a8e5c9]">INNOVATION FOR LIFE</p><h1 className="m-0 text-[clamp(2.7rem,6vw,5.4rem)] font-semibold leading-[1.04] tracking-[-.055em]">{template.heroTitle}</h1><p className="mb-9 mt-7 max-w-[600px] text-[17px] leading-8 text-white/80">{template.heroSubtitle}</p><Link className="inline-flex items-center gap-4 rounded-full bg-white px-7 py-4 text-sm font-bold text-[#163c30] no-underline shadow-xl hover:-translate-y-0.5" to={template.heroButtonUrl}>{template.heroButtonLabel}<span>→</span></Link></div></div>
  </section>
}

function SubPage({ menu, menus, board, content, posts, post, failure }: { menu?: Menu; menus: Menu[]; board: Board | null | undefined; content: Article | null; posts: Post[]; post: Post | null; failure: string | null }) {
  const title = post?.title ?? content?.title ?? board?.name ?? menu?.name ?? '페이지를 찾을 수 없습니다'
  const children = menu ? menus.filter((item) => item.parentId === menu.id) : []
  return <main><section className="bg-[linear-gradient(135deg,#173d32,#397b62)] px-5 py-20 text-white"><div className="mx-auto max-w-[1100px]"><p className="mb-3 text-xs font-bold tracking-[.18em] text-white/55">AX BIO STUDIO</p><h1 className="m-0 text-[clamp(2.2rem,5vw,4rem)] tracking-[-.05em]">{title}</h1></div></section><div className="mx-auto min-h-[480px] max-w-[1100px] px-5 py-16">{failure && <p className="rounded-xl bg-[#fff2f2] p-5 text-sm text-[#a23b3b]">{failure}</p>}{content && <article className="mx-auto max-w-[850px]"><RichText body={content.body} /></article>}{post && <article className="mx-auto max-w-[850px]"><p className="border-b border-[#e2e8e5] pb-5 text-sm text-[#78867f]">{date(post.createdAt)} · {post.authorName}</p><RichText body={post.body} /></article>}{board && <section><p className="mb-8 text-[#66766f]">{board.description}</p><div className="border-t-2 border-[#243d34]">{posts.map((item, index) => <Link className="grid grid-cols-[60px_1fr_auto] items-center gap-4 border-b border-[#e2e8e5] px-3 py-5 text-inherit no-underline hover:bg-[#f7faf8]" key={item.id} to={`/posts/${item.id}`}><span className="text-center text-sm text-[#84918b]">{posts.length - index}</span><strong>{item.title}</strong><span className="text-xs text-[#84918b]">{date(item.createdAt)}</span></Link>)}</div></section>}{children.length > 0 && <div className="grid gap-5 md:grid-cols-2">{children.map((child) => <Link className="rounded-2xl border border-[#e1e8e4] bg-[#f8faf9] p-7 text-inherit no-underline hover:border-[var(--brand)]" key={child.id} to={child.path}><span className="text-xs font-bold text-[var(--brand)]">{child.targetType === 'BOARD' ? 'BOARD' : 'PAGE'}</span><h2 className="mb-2 mt-4">{child.name}</h2><p className="m-0 text-sm text-[#738079]">자세히 보기 →</p></Link>)}</div>}{!content && !board && !post && children.length === 0 && !failure && <p className="text-center text-[#728079]">연결된 페이지가 없습니다.</p>}</div></main>
}

function RichText({ body }: { body: string }) {
  return <div className="text-[16px] leading-8 text-[#45554e]">{body.split('\n').map((line, index) => {
    if (line.startsWith('## ')) return <h2 className="mb-5 mt-10 text-3xl tracking-[-.04em] text-[#1d2e27]" key={index}>{inline(line.slice(3))}</h2>
    if (line.startsWith('- ')) return <div className="my-2 flex gap-3" key={index}><span className="text-[var(--brand)]">●</span><span>{inline(line.slice(2))}</span></div>
    if (!line.trim()) return <div className="h-3" key={index} />
    return <p className="my-3" key={index}>{inline(line)}</p>
  })}</div>
}
function inline(value: string): ReactNode { return value.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : <Fragment key={index}>{part}</Fragment>) }
function date(value: string) { return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(value)) }

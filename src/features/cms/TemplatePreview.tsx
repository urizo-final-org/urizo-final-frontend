import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { PortalFooter, PortalHeader, PortalHome } from '../site/TourPortal'
import type { Menu, SiteTemplate } from './api'

/** 실제 메인 포털을 재사용한다. 관리자 테마의 자손 선택자가 침범하지 않도록 body에 격리한다. */
export function TemplatePreview({ value, siteName, menus = [], mode = 'draft', onClose }: {
  value: SiteTemplate
  siteName?: string
  menus?: Menu[]
  mode?: 'draft' | 'approval'
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop')
  const template = { ...value, siteName: siteName ?? value.siteName }
  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    return () => element.close()
  }, [])

  return createPortal(<dialog ref={dialog} aria-label={`${value.key} 템플릿 미리보기`} onCancel={onClose}
    className="site-app fixed inset-0 m-auto max-h-[92vh] w-[min(1200px,96vw)] max-w-none overflow-auto rounded-xl border-0 p-0 shadow-2xl backdrop:bg-black/60"
    style={{ minHeight: 0, '--brand': value.primaryColor, '--primary': value.primaryColor } as CSSProperties}>
    <div className="sticky top-0 z-30 flex items-start justify-between gap-4 border-b border-line-soft bg-panel px-5 py-4">
      <div>
        <b className="block text-sm text-ink">{value.key} 템플릿 미리보기</b>
        <p className="m-0 mt-1 text-xs text-muted">메인 관광 포털(/) 기준 · {mode === 'approval' ? '서버에 저장된 승인 미리보기' : '저장 전 입력값'} · 화면 너비에 따라 배치가 달라집니다.</p>
        <p className="m-0 mt-1 text-xs text-muted">{siteName ? `사이트명: ${siteName}` : '메인 사이트명 미확인: 템플릿 예시값 표시'} · 최신 공지·챗봇은 제외합니다. 하위 사이트 화면은 포함하지 않습니다.</p>
        <p className="m-0 mt-1 text-xs text-muted">미리보기에서는 링크 이동·검색을 실행하지 않습니다. 버튼 이동 경로: {value.heroButtonUrl || '/'}</p>
      </div>
      <button autoFocus type="button" className="shrink-0 rounded-md bg-primary px-4 py-2 text-xs font-bold text-white" onClick={onClose}>닫기</button>
    </div>
    {mode === 'approval' && <div className="flex gap-2 border-b border-line-soft bg-panel p-3" aria-label="미리보기 화면 크기">
      <button type="button" aria-pressed={viewport === 'desktop'} onClick={() => setViewport('desktop')}>PC</button>
      <button type="button" aria-pressed={viewport === 'mobile'} onClick={() => setViewport('mobile')}>모바일 390px</button>
    </div>}
    {mode === 'approval' ? <PreviewViewport mobile={viewport === 'mobile'} color={value.primaryColor}>
      <PortalHeader template={template} menus={menus} />
      <PortalHome template={template} menus={menus} />
      <PortalFooter template={template} menus={menus} />
    </PreviewViewport> : <div inert
      onClickCapture={(event) => { event.preventDefault(); event.stopPropagation() }} onSubmitCapture={(event) => { event.preventDefault(); event.stopPropagation() }}>
      <PortalHeader template={template} menus={menus} />
      <PortalHome template={template} menus={menus} />
      <PortalFooter template={template} menus={menus} />
    </div>}
  </dialog>, document.body)
}

/** A real iframe viewport makes the public renderer's media queries match the selected device width. */
function PreviewViewport({ mobile, color, children }: { mobile: boolean; color: string; children: ReactNode }) {
  const [body, setBody] = useState<HTMLElement | null>(null)
  return <>
    <iframe title="템플릿 실제 화면" sandbox="allow-same-origin" srcDoc="<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head><body></body></html>"
      style={{ display: 'block', width: mobile ? 390 : '100%', maxWidth: '100%', height: '70vh', margin: '0 auto', border: 0 }}
      onLoad={(event) => {
        const frame = event.currentTarget.contentDocument
        if (!frame) return
        document.querySelectorAll('style, link[rel="stylesheet"]').forEach((style) => frame.head.appendChild(style.cloneNode(true)))
        frame.body.style.margin = '0'
        setBody(frame.body)
      }} />
    {body && createPortal(<div className="site-app" inert style={{ '--brand': color, '--primary': color } as CSSProperties}
      onClickCapture={(event) => { event.preventDefault(); event.stopPropagation() }} onSubmitCapture={(event) => { event.preventDefault(); event.stopPropagation() }}>{children}</div>, body)}
  </>
}

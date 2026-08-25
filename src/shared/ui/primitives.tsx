import type { ReactNode } from 'react'
import { Icon, type IconName } from './icons'

/** Class strings lifted from the design canvas so every screen shares one spec. */
export const panel = 'rounded-md border border-line bg-panel shadow-[0_1px_2px_#10203405]'
export const panelHead = 'flex items-center justify-between gap-3 border-b border-line-soft px-4 py-[14px]'
export const primaryButton = 'inline-flex h-8 items-center gap-[6px] rounded-[5px] bg-primary px-3 text-xs font-semibold text-white enabled:hover:bg-[#12314c]'
export const secondaryButton = 'inline-flex h-8 items-center gap-[6px] rounded-[5px] border border-btn-line bg-white px-[11px] text-xs font-semibold text-strong enabled:hover:bg-sub'
export const smallButton = 'inline-flex h-7 items-center gap-[6px] rounded-[5px] border border-btn-line bg-white px-[10px] text-[11.5px] font-semibold text-strong enabled:hover:bg-sub'
export const dangerButton = 'inline-flex h-8 items-center gap-[6px] rounded-[5px] border border-[#f0d5d1] bg-fail-bg px-[11px] text-xs font-semibold text-fail-fg enabled:hover:bg-[#f8e0dc]'
export const fieldLabel = 'block text-[11.5px] font-semibold text-body'
export const control = 'mt-[6px] block h-8 w-full rounded-[5px] border border-field-line bg-white px-[10px] text-[12.5px] font-normal text-ink outline-0'
export const textarea = 'mt-[6px] block w-full resize-y rounded-[5px] border border-field-line bg-white px-[10px] py-[9px] text-[12.5px] font-normal text-ink outline-0'
export const tableHead = 'bg-sub px-4 py-2 text-[11px] font-semibold text-muted-2 border-b border-line-soft'
export const row = 'items-center border-b border-row-line px-4 py-[10px] text-xs text-body'
export const mono = 'font-mono'

export type Tone = 'ok' | 'run' | 'wait' | 'fail' | 'idle'

const tones: Record<Tone, string> = {
  ok: 'bg-ok-bg text-ok-fg [--dot:var(--ok-dot)]',
  run: 'bg-run-bg text-run-fg [--dot:var(--run-dot)]',
  wait: 'bg-wait-bg text-wait-fg [--dot:var(--wait-dot)]',
  fail: 'bg-fail-bg text-fail-fg [--dot:var(--fail-dot)]',
  idle: 'bg-idle-bg text-idle-fg [--dot:var(--idle-dot)]',
}

export function Badge({ tone = 'idle', dot = true, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-[5px] whitespace-nowrap rounded px-[7px] py-[2px] text-[10.5px] font-semibold ${tones[tone]}`}>
    {dot && <i className="block h-[5px] w-[5px] rounded-full bg-[var(--dot)]" aria-hidden="true" />}
    {children}
  </span>
}

/** Neutral outlined chip used for tags and read-only categories. */
export function Tag({ children }: { children: ReactNode }) {
  return <span className="rounded border border-[#e2e7ed] bg-sub px-[6px] py-[2px] text-[10.5px] text-muted">{children}</span>
}

export function PanelTitle({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return <div className={panelHead}>
    <div>
      <b className="text-[13.5px] font-semibold">{title}</b>
      {sub && <small className="mt-[2px] block text-[11px] font-normal text-muted-2">{sub}</small>}
    </div>
    {children}
  </div>
}

export function PageHead({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return <div className="mb-4 flex items-start justify-between gap-6">
    <div>
      <h1 className="text-[22px] font-semibold tracking-[-.02em]">{title}</h1>
      {description && <p className="mt-[5px] text-[13px] text-muted">{description}</p>}
    </div>
    {children && <div className="flex shrink-0 gap-2">{children}</div>}
  </div>
}

export function SearchField({ placeholder, className = '' }: { placeholder: string; className?: string }) {
  return <div className={`flex h-[30px] items-center gap-[7px] rounded-[5px] border border-field-line bg-sub px-[9px] ${className}`}>
    <Icon name="search" className="text-muted-3" />
    <input className="min-w-0 flex-1 border-0 bg-transparent text-xs outline-0" placeholder={placeholder} />
  </div>
}

/** Filter chip; the first one in a row reads as active, matching the canvas. */
export function FilterChip({ label, active = false }: { label: string; active?: boolean }) {
  return <button type="button" className={`inline-flex h-[30px] shrink-0 items-center gap-[6px] rounded-[5px] border px-[10px] text-[11.5px] font-semibold ${active ? 'border-[#c9d9e4] bg-[#f2f8fc] text-run-fg' : 'border-btn-line bg-white text-strong'}`}>
    {label}<Icon name="chevron-down" size={12} className="opacity-60" />
  </button>
}

export function Tabs({ items, active = 0 }: { items: { label: string; count?: string }[]; active?: number }) {
  return <div className="mb-[18px] flex gap-[22px] overflow-x-auto border-b border-line">
    {items.map((tab, index) => <button
      key={tab.label}
      type="button"
      className={`shrink-0 whitespace-nowrap bg-transparent px-[2px] pb-[10px] text-[13px] ${index === active ? 'font-semibold text-ink shadow-[inset_0_-2px_var(--primary)]' : 'font-medium text-muted'}`}
    >{tab.label}{tab.count && <span className="ml-[6px] text-[11px] text-muted-3">{tab.count}</span>}</button>)}
  </div>
}

export function EmptyState({ icon = 'inbox', title, description, children }: { icon?: IconName; title: string; description?: ReactNode; children?: ReactNode }) {
  return <div className="px-5 pb-[68px] pt-16 text-center">
    <div className="mx-auto grid h-11 w-11 place-items-center rounded-[10px] bg-[#f4f6f9] text-muted-4">
      <Icon name={icon} size={21} />
    </div>
    <b className="mt-[14px] block text-sm font-semibold">{title}</b>
    {description && <p className="mt-[6px] text-[12.5px] leading-[1.6] text-muted-2">{description}</p>}
    {children && <div className="mt-4 flex justify-center gap-2">{children}</div>}
  </div>
}

export function Pagination({ summary }: { summary: string }) {
  return <div className="flex items-center justify-between px-4 py-3">
    <span className="text-[11.5px] text-muted-2">{summary}</span>
    <div className="flex items-center gap-1">
      <button type="button" className="grid h-7 w-7 place-items-center rounded-[5px] border border-btn-line bg-white text-muted-3"><Icon name="chevron-left" size={13} /></button>
      <button type="button" className="h-7 min-w-7 rounded-[5px] border border-primary bg-primary text-[11.5px] font-semibold text-white">1</button>
      <button type="button" className="h-7 min-w-7 rounded-[5px] border border-btn-line bg-white text-[11.5px] text-body">2</button>
      <button type="button" className="h-7 min-w-7 rounded-[5px] border border-btn-line bg-white text-[11.5px] text-body">3</button>
      <button type="button" className="grid h-7 w-7 place-items-center rounded-[5px] border border-btn-line bg-white text-body"><Icon name="chevron-right" size={13} /></button>
    </div>
  </div>
}

/** Banner used for the canvas's advisory and success callouts. */
export function Callout({ tone, icon, children }: { tone: 'warn' | 'ok'; icon: IconName; children: ReactNode }) {
  const skin = tone === 'warn'
    ? 'border-[#efe4cd] bg-[#fdfaf3] text-[#8a6a2f]'
    : 'border-[#dceae2] bg-[#f5faf7] text-[#37725a]'
  return <div className={`flex items-start gap-[9px] rounded-[5px] border p-[11px] text-[11.5px] leading-[1.6] ${skin}`}>
    <Icon name={icon} size={15} className="mt-[1px]" />
    <span>{children}</span>
  </div>
}

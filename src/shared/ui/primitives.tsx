import type { ReactNode } from 'react'
import { Icon, type IconName } from './icons'

/** Class strings lifted from the design canvas so every screen shares one spec. */
export const panel = 'rounded-md border border-line bg-panel shadow-[0_1px_2px_#10203405]'
export const panelHead = 'flex items-center justify-between gap-3 border-b border-line-soft px-4 py-[0.875rem]'
export const primaryButton = 'inline-flex h-8 items-center gap-[0.375rem] rounded-[0.3125rem] bg-primary px-3 text-xs font-semibold text-white enabled:hover:bg-[#12314c]'
export const secondaryButton = 'inline-flex h-8 items-center gap-[0.375rem] rounded-[0.3125rem] border border-btn-line bg-white px-[0.6875rem] text-xs font-semibold text-strong enabled:hover:bg-sub'
export const smallButton = 'inline-flex h-7 items-center gap-[0.375rem] rounded-[0.3125rem] border border-btn-line bg-white px-[0.625rem] text-[0.71875rem] font-semibold text-strong enabled:hover:bg-sub'
export const dangerButton = 'inline-flex h-8 items-center gap-[0.375rem] rounded-[0.3125rem] border border-[#f0d5d1] bg-fail-bg px-[0.6875rem] text-xs font-semibold text-fail-fg enabled:hover:bg-[#f8e0dc]'
export const fieldLabel = 'block text-[0.71875rem] font-semibold text-body'
export const control = 'mt-[0.375rem] block h-8 w-full rounded-[0.3125rem] border border-field-line bg-white px-[0.625rem] text-[0.78125rem] font-normal text-ink outline-0'
export const textarea = 'mt-[0.375rem] block w-full resize-y rounded-[0.3125rem] border border-field-line bg-white px-[0.625rem] py-[0.5625rem] text-[0.78125rem] font-normal text-ink outline-0'
export const tableHead = 'bg-sub px-4 py-2 text-[0.6875rem] font-semibold text-muted-2 border-b border-line-soft'
export const row = 'items-center border-b border-row-line px-4 py-[0.625rem] text-xs text-body'
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
  return <span className={`inline-flex items-center gap-[0.3125rem] whitespace-nowrap rounded px-[0.4375rem] py-[0.125rem] text-[0.65625rem] font-semibold ${tones[tone]}`}>
    {dot && <i className="block h-[0.3125rem] w-[0.3125rem] rounded-full bg-[var(--dot)]" aria-hidden="true" />}
    {children}
  </span>
}

/** Neutral outlined chip used for tags and read-only categories. */
export function Tag({ children }: { children: ReactNode }) {
  return <span className="rounded border border-[#e2e7ed] bg-sub px-[0.375rem] py-[0.125rem] text-[0.65625rem] text-muted">{children}</span>
}

export function PanelTitle({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return <div className={panelHead}>
    <div>
      <b className="text-[0.84375rem] font-semibold">{title}</b>
      {sub && <small className="mt-[0.125rem] block text-[0.6875rem] font-normal text-muted-2">{sub}</small>}
    </div>
    {children}
  </div>
}

export function PageHead({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return <div className="mb-4 flex items-start justify-between gap-6">
    <div>
      <h1 className="text-[1.375rem] font-semibold tracking-[-.02em]">{title}</h1>
      {description && <p className="mt-[0.3125rem] text-[0.8125rem] text-muted">{description}</p>}
    </div>
    {children && <div className="flex shrink-0 gap-2">{children}</div>}
  </div>
}

export function SearchField({ placeholder, className = '' }: { placeholder: string; className?: string }) {
  return <div className={`flex h-[1.875rem] items-center gap-[0.4375rem] rounded-[0.3125rem] border border-field-line bg-sub px-[0.5625rem] ${className}`}>
    <Icon name="search" className="text-muted-3" />
    <input className="min-w-0 flex-1 border-0 bg-transparent text-xs outline-0" placeholder={placeholder} />
  </div>
}

/** Filter chip; the first one in a row reads as active, matching the canvas. */
export function FilterChip({ label, active = false }: { label: string; active?: boolean }) {
  return <button type="button" className={`inline-flex h-[1.875rem] shrink-0 items-center gap-[0.375rem] rounded-[0.3125rem] border px-[0.625rem] text-[0.71875rem] font-semibold ${active ? 'border-[#c9d9e4] bg-[#f2f8fc] text-run-fg' : 'border-btn-line bg-white text-strong'}`}>
    {label}<Icon name="chevron-down" size={12} className="opacity-60" />
  </button>
}

export function Tabs({ items, active = 0 }: { items: { label: string; count?: string }[]; active?: number }) {
  return <div className="mb-[1.125rem] flex gap-[1.375rem] overflow-x-auto border-b border-line">
    {items.map((tab, index) => <button
      key={tab.label}
      type="button"
      className={`shrink-0 whitespace-nowrap bg-transparent px-[0.125rem] pb-[0.625rem] text-[0.8125rem] ${index === active ? 'font-semibold text-ink shadow-[inset_0_-2px_var(--primary)]' : 'font-medium text-muted'}`}
    >{tab.label}{tab.count && <span className="ml-[0.375rem] text-[0.6875rem] text-muted-3">{tab.count}</span>}</button>)}
  </div>
}

export function EmptyState({ icon = 'inbox', title, description, children }: { icon?: IconName; title: string; description?: ReactNode; children?: ReactNode }) {
  return <div className="px-5 pb-[4.25rem] pt-16 text-center">
    <div className="mx-auto grid h-11 w-11 place-items-center rounded-[0.625rem] bg-[#f4f6f9] text-muted-4">
      <Icon name={icon} size={21} />
    </div>
    <b className="mt-[0.875rem] block text-sm font-semibold">{title}</b>
    {description && <p className="mt-[0.375rem] text-[0.78125rem] leading-[1.6] text-muted-2">{description}</p>}
    {children && <div className="mt-4 flex justify-center gap-2">{children}</div>}
  </div>
}

export function Pagination({ summary }: { summary: string }) {
  return <div className="flex items-center justify-between px-4 py-3">
    <span className="text-[0.71875rem] text-muted-2">{summary}</span>
    <div className="flex items-center gap-1">
      <button type="button" className="grid h-7 w-7 place-items-center rounded-[0.3125rem] border border-btn-line bg-white text-muted-3"><Icon name="chevron-left" size={13} /></button>
      <button type="button" className="h-7 min-w-7 rounded-[0.3125rem] border border-primary bg-primary text-[0.71875rem] font-semibold text-white">1</button>
      <button type="button" className="h-7 min-w-7 rounded-[0.3125rem] border border-btn-line bg-white text-[0.71875rem] text-body">2</button>
      <button type="button" className="h-7 min-w-7 rounded-[0.3125rem] border border-btn-line bg-white text-[0.71875rem] text-body">3</button>
      <button type="button" className="grid h-7 w-7 place-items-center rounded-[0.3125rem] border border-btn-line bg-white text-body"><Icon name="chevron-right" size={13} /></button>
    </div>
  </div>
}

/** Banner used for the canvas's advisory and success callouts. */
export function Callout({ tone, icon, children }: { tone: 'warn' | 'ok'; icon: IconName; children: ReactNode }) {
  const skin = tone === 'warn'
    ? 'border-[#efe4cd] bg-[#fdfaf3] text-[#8a6a2f]'
    : 'border-[#dceae2] bg-[#f5faf7] text-[#37725a]'
  return <div className={`flex items-start gap-[0.5625rem] rounded-[0.3125rem] border p-[0.6875rem] text-[0.71875rem] leading-[1.6] ${skin}`}>
    <Icon name={icon} size={15} className="mt-[0.0625rem]" />
    <span>{children}</span>
  </div>
}

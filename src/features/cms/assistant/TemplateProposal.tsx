import { useState } from 'react'
import type { Menu, SiteTemplate, TemplateHeroImage } from '../api'
import { TemplatePreview } from '../TemplatePreview'
import { templateLabel, withTemplateImages } from '../templateImages'
import { secondaryButton } from '../../../shared/ui/primitives'
import type { CmsAssistantTarget } from './CmsAiAssistant'
import type { NaturalCmsJob } from './api'

export type TemplateAssistantContext = {
  target: CmsAssistantTarget | null
  blockedReason: string | null
  siteName?: string
  mainTemplateKey?: string
  menus: Menu[]
}

const LABELS: Record<string, string> = {
  layout: '레이아웃', primaryColor: '대표 색상', headerText: 'Header 보조 문구', footerText: 'Footer 문구',
  heroTitle: '메인 대표 문구', heroSubtitle: '메인 설명', heroButtonLabel: '메인 버튼 문구',
  heroButtonUrl: '메인 버튼 URL', heroImages: '메인 이미지·제목·작은 설명·순서',
}
const TEXT_FIELDS = ['layout', 'primaryColor', 'siteName', 'heroTitle', 'updatedAt'] as const
const OPTIONAL_FIELDS = ['headerText', 'footerText', 'heroSubtitle', 'heroButtonLabel', 'heroButtonUrl'] as const

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** JSON 객체의 키 순서는 승인 내용과 무관하고, 이미지 배열의 순서는 승인 내용이다. */
function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((item, index) => sameJson(item, right[index]))
  if (!object(left) || !object(right)) return false
  const names = Object.keys(left)
  return names.length === Object.keys(right).length && names.every((name) => Object.hasOwn(right, name) && sameJson(left[name], right[name]))
}

function snapshot(value: unknown, key: string): SiteTemplate | null {
  if (!object(value) || value.id !== key || TEXT_FIELDS.some((name) => typeof value[name] !== 'string')
    || OPTIONAL_FIELDS.some((name) => value[name] !== null && typeof value[name] !== 'string')
    || !Array.isArray(value.heroImages) || value.heroImages.length > 5) return null
  const images: TemplateHeroImage[] = []
  for (const image of value.heroImages) {
    if (!object(image) || Object.keys(image).length !== 3 || typeof image.url !== 'string' || !image.url
      || image.url.length > 500 || typeof image.title !== 'string' || image.title.length > 120
      || typeof image.description !== 'string' || image.description.length > 240) return null
    images.push({ url: image.url, title: image.title, description: image.description })
  }
  return withTemplateImages({
    key, layout: value.layout as string, primaryColor: value.primaryColor as string,
    siteName: value.siteName as string, heroTitle: value.heroTitle as string, updatedAt: value.updatedAt as string,
    headerText: value.headerText as string ?? '', footerText: value.footerText as string ?? '',
    heroSubtitle: value.heroSubtitle as string ?? '', heroButtonLabel: value.heroButtonLabel as string ?? '',
    heroButtonUrl: value.heroButtonUrl as string ?? '', heroImageUrl: '',
  }, images)
}

export function templateProposal(job: NaturalCmsJob): { before: SiteTemplate; after: SiteTemplate; fields: string[] } | null {
  const preview = job.preview
  const command = job.structuredCommand
  if (job.resource.type !== 'TEMPLATE' || !job.previewValid || !job.previewId || !job.previewHash
    || !object(preview) || preview.previewId !== job.previewId || preview.previewHash !== job.previewHash
    || !sameJson(preview.resource, job.resource) || !sameJson(preview.command, command)
    || !object(command) || command.operation !== 'UPDATE' || !object(command.fields)
    || !object(preview.before) || !object(preview.after)) return null
  const fields = Object.keys(command.fields)
  if (fields.length === 0 || fields.some((name) => !Object.hasOwn(LABELS, name))
    || !sameJson(preview.after, { ...preview.before, ...command.fields })) return null
  const before = snapshot(preview.before, job.resource.id)
  const after = snapshot(preview.after, job.resource.id)
  return before && after ? { before, after, fields } : null
}

function Photos({ images }: { images: TemplateHeroImage[] }) {
  if (images.length === 0) return <p className="text-xs text-muted-2">연결된 사진 없음</p>
  return <ol className="m-0 grid list-none gap-3 p-0">
    {images.map((image, index) => <li key={`${index}:${image.url}`} className="rounded border border-line-soft p-2">
      <img src={image.url} alt={image.title || `${index + 1}번째 사진`} className="h-28 w-full rounded object-cover" />
      <b className="mt-2 block text-xs">{index + 1}. {image.title || '(제목 없음)'}{index === 0 ? ' · 대표 이미지' : ''}</b>
      <p className="mb-0 mt-1 whitespace-pre-wrap text-xs text-muted-2">{image.description || '(작은 설명 없음)'}</p>
    </li>)}
  </ol>
}

export function TemplateProposalPreview({ job, context }: { job: NaturalCmsJob; context?: TemplateAssistantContext | null }) {
  const [rendered, setRendered] = useState<SiteTemplate | null>(null)
  const proposal = templateProposal(job)
  if (!proposal) return <p role="alert">승인할 템플릿 미리보기를 확인할 수 없습니다. 다시 요청해 주세요.</p>
  const { before, after, fields } = proposal
  return <>
    <p className="text-sm font-semibold">변경 대상: {templateLabel(after.key)} ({after.key})</p>
    <p className="text-xs text-muted-2">승인하면 이 템플릿을 사용하는 사이트에 반영됩니다.{context?.mainTemplateKey === after.key ? ' 현재 메인 사이트에서도 사용 중입니다.' : ''}</p>
    {fields.map((name) => <section key={name} className="rounded border border-line-soft p-3">
      <h3 className="mb-2 mt-0 text-sm font-semibold">{LABELS[name]}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><small className="mb-2 block text-muted-2">변경 전</small>{name === 'heroImages'
          ? <Photos images={before.heroImages ?? []} />
          : <p className="m-0 whitespace-pre-wrap break-words text-sm">{String(before[name as keyof SiteTemplate] ?? '') || '(비어 있음)'}</p>}</div>
        <div><small className="mb-2 block text-muted-2">변경 후</small>{name === 'heroImages'
          ? <Photos images={after.heroImages ?? []} />
          : <p className="m-0 whitespace-pre-wrap break-words text-sm">{String(after[name as keyof SiteTemplate] ?? '') || '(비어 있음)'}</p>}</div>
      </div>
    </section>)}
    <div className="flex flex-wrap gap-2">
      <button type="button" className={secondaryButton} onClick={() => setRendered(before)}>변경 전 화면 보기</button>
      <button type="button" className={secondaryButton} onClick={() => setRendered(after)}>변경 후 화면 보기</button>
    </div>
    {rendered && <TemplatePreview value={rendered} siteName={context?.siteName} menus={context?.menus}
      mode="approval" onClose={() => setRendered(null)} />}
  </>
}

import { useRef, useState, type DragEvent } from 'react'
import { control, fieldLabel, secondaryButton, smallButton } from '../../shared/ui/primitives'
import type { SiteTemplate, TemplateHeroImage } from './api'
import { MAX_TEMPLATE_IMAGES, templateImageDetails } from './templateImages'

export function TemplateImageList({ value, disabled, uploading, onUpload, onChange }: {
  value: SiteTemplate
  disabled: boolean
  uploading: boolean
  onUpload: (files: File[]) => void
  onChange: (images: TemplateHeroImage[]) => void
}) {
  const images = templateImageDetails(value)
  const dragged = useRef<number | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  const [filesOver, setFilesOver] = useState(false)
  function reorder(index: number, destination: number) {
    if (disabled || index === destination || destination < 0 || destination >= images.length) return
    const next = [...images]
    const [image] = next.splice(index, 1)
    next.splice(destination, 0, image)
    onChange(next)
  }
  function move(index: number, direction: number) {
    reorder(index, index + direction)
  }
  function isFileDrag(event: DragEvent) { return Array.from(event.dataTransfer.types).includes('Files') }
  function update(index: number, field: 'title' | 'description', text: string) {
    onChange(images.map((image, position) => position === index ? { ...image, [field]: text } : image))
  }
  return <fieldset className={`m-0 min-w-0 rounded-lg border p-4 md:col-span-2 ${filesOver ? 'border-primary bg-sub ring-2 ring-primary' : 'border-line'}`} disabled={disabled}
    onDragOver={(event) => { if (isFileDrag(event)) { event.preventDefault(); event.dataTransfer.dropEffect = disabled ? 'none' : 'copy'; if (!disabled) setFilesOver(true) } }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFilesOver(false) }}
    onDrop={(event) => { if (!isFileDrag(event)) return; event.preventDefault(); setFilesOver(false); if (!disabled) onUpload(Array.from(event.dataTransfer.files)) }}>
    <legend className="px-1 text-xs font-semibold text-ink">메인 대표 이미지 <span className="font-normal text-muted">{images.length} / {MAX_TEMPLATE_IMAGES}</span></legend>
    <p className="mb-3 mt-0 text-xs leading-relaxed text-body">{value.key === 'MINIMAL' ? '첫 번째 이미지를 대표 이미지로 사용합니다.' : '첫 번째 사진을 크게, 나머지는 설명과 함께 순서대로 표시합니다.'} JPG·PNG·WebP, 파일당 최대 8MB.</p>
    {images.length > 0 ? <ol className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
      {images.map((image, index) => <li key={`${index}:${image.url}`} className={`min-w-0 rounded-md border bg-sub p-3 ${dropTarget === index ? 'border-primary ring-2 ring-primary' : 'border-line'}`}
        onDragOver={(event) => { if (dragged.current === null || disabled || isFileDrag(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget(index) }}
        onDrop={(event) => { if (dragged.current === null || isFileDrag(event)) return; event.preventDefault(); event.stopPropagation(); reorder(dragged.current, index); dragged.current = null; setDropTarget(null) }}>
        <ImageThumbnail url={image.url} index={index} />
        <div className="my-2 flex min-h-5 flex-wrap items-center gap-2 text-xs font-semibold">
          <span>이미지 {index + 1}</span>
          {index === 0 && <span className="rounded bg-run-bg px-2 py-0.5 text-run-fg">대표 이미지 · 현재 사용</span>}
          <button type="button" draggable={!disabled} className={`${smallButton} ml-auto cursor-grab active:cursor-grabbing`} aria-label={`이미지 ${index + 1} 드래그하여 순서 변경`}
            onDragStart={(event) => { if (disabled) { event.preventDefault(); return }; dragged.current = index; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)) }}
            onDragEnd={() => { dragged.current = null; setDropTarget(null) }}>⠿ 순서</button>
        </div>
        <label className={`${fieldLabel} mb-2`}>작은 설명<input className={control} aria-label={`이미지 ${index + 1} 작은 설명`} maxLength={240} value={image.description} placeholder="예: 탁 트인 풍경이 기다리는 여행" onChange={(event) => update(index, 'description', event.target.value)} /></label>
        <label className={`${fieldLabel} mb-3`}>제목<input className={control} aria-label={`이미지 ${index + 1} 제목`} maxLength={120} value={image.title} placeholder="예: 바람을 따라, 바다로" onChange={(event) => update(index, 'title', event.target.value)} /></label>
        <div className="flex flex-wrap gap-1">
          <button type="button" className={smallButton} disabled={disabled || index === 0} aria-label={`이미지 ${index + 1} 앞으로`} onClick={() => move(index, -1)}>앞으로</button>
          <button type="button" className={smallButton} disabled={disabled || index === images.length - 1} aria-label={`이미지 ${index + 1} 뒤로`} onClick={() => move(index, 1)}>뒤로</button>
          <button type="button" className={smallButton} aria-label={`이미지 ${index + 1} 연결 해제`} onClick={() => onChange(images.filter((_, position) => position !== index))}>연결 해제</button>
        </div>
      </li>)}
    </ol> : <p className="rounded-md bg-sub p-4 text-xs text-muted">등록된 이미지가 없습니다.</p>}
    <div className="mt-3 rounded-md border border-dashed border-line bg-sub p-4 text-center">
    <p className="m-0 mb-3 text-xs text-body">이미지 파일을 여기에 끌어다 놓거나 아래에서 선택하세요.</p>
    <label className={`${secondaryButton} max-w-full flex-wrap`}>
      이미지 업로드
      <input type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="메인 대표 이미지 업로드"
        className="max-w-full text-xs" disabled={disabled || images.length >= MAX_TEMPLATE_IMAGES}
        onChange={(event) => { onUpload(Array.from(event.target.files ?? [])); event.target.value = '' }} />
    </label>
    </div>
    {uploading && <p role="status" className="mb-0 mt-2 text-xs text-body">이미지 업로드 중…</p>}
    <p className="mb-0 mt-2 text-xs leading-relaxed text-muted">변경한 순서와 연결은 템플릿 저장 시 반영됩니다. 연결 해제해도 원본 이미지 파일은 삭제되지 않습니다.</p>
  </fieldset>
}

function ImageThumbnail({ url, index }: { url: string; index: number }) {
  const [dimensions, setDimensions] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  return <>
    <div className="flex aspect-video items-center justify-center overflow-hidden rounded bg-panel">
      <img src={url} alt={`메인 이미지 ${index + 1}`} draggable={false} className="h-full w-full object-contain" hidden={failed}
        onLoad={(event) => { const image = event.currentTarget; setFailed(false); setDimensions(image.naturalWidth > 0 && image.naturalHeight > 0 ? `${image.naturalWidth} × ${image.naturalHeight} px` : null) }}
        onError={() => { setFailed(true); setDimensions(null) }} />
      {failed && <span className="px-2 text-center text-xs text-muted">이미지를 불러오지 못했습니다.</span>}
    </div>
    <p className="mb-0 mt-2 text-xs tabular-nums text-muted">{failed ? '크기 확인 불가' : dimensions ?? '실제 크기 확인 중…'}</p>
  </>
}

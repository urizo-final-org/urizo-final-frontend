import Image from '@tiptap/extension-image'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef, type ReactNode } from 'react'
import { contentStyles } from '../site/contentDocument'
import { contentImageUrl, type CmsApi } from './api'

/**
 * 컨텐츠 본문 편집기.
 *
 * <p>서버가 허용하는 부품만 켠다. StarterKit이 기본으로 주는 인용·코드·구분선·취소선·밑줄은
 * 저장 단계에서 거부되므로 편집기에서도 아예 만들 수 없게 한다. 쓸 수 없는 것을 쓰게 해놓고
 * 저장할 때 막으면 사람이 왜 안 되는지 알 수 없다.
 *
 * <p>본문 글씨는 사용자 사이트와 같은 정의({@link contentStyles})를 쓴다. 관리자에서 본 모양과
 * 사이트에서 본 모양이 같아야 저장하고 다시 열어보지 않아도 결과를 안다.
 */
export default function ContentEditor({ value, onChange, api, onFailure }: {
  value: string
  onChange: (body: string) => void
  api: CmsApi
  onFailure: (message: string) => void
}) {
  const file = useRef<HTMLInputElement>(null)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        heading: { levels: [2, 3] },
        link: { openOnClick: false, autolink: false, protocols: ['http', 'https'] },
      }),
      Image.configure({ inline: false, allowBase64: false }),
    ],
    content: parse(value),
    onUpdate: ({ editor: changed }) => onChange(JSON.stringify(changed.getJSON())),
    editorProps: { attributes: { class: `${contentStyles.root} min-h-[18rem] p-4 outline-none` } },
  })

  /**
   * 밖에서 바뀐 값을 편집기에 넣는다.
   *
   * 다른 컨텐츠를 고르거나 자연어 반영이 끝났을 때다. 편집 중에 매번 넣으면 커서가 튀므로
   * 지금 편집기가 들고 있는 것과 다를 때만 바꾼다.
   */
  useEffect(() => {
    if (!editor) return
    if (JSON.stringify(editor.getJSON()) === value) return
    editor.commands.setContent(parse(value), { emitUpdate: false })
  }, [editor, value])

  if (!editor) return null

  async function insertImage(chosen: File | null | undefined) {
    if (!editor || !chosen) return
    try {
      const saved = await api.uploadImage(chosen)
      // 대체 텍스트는 사진이 안 뜰 때 대신 보이고 화면 낭독기가 읽는다. 나중에 붙이려면
      // 이미 넣은 사진이 전부 설명 없는 상태가 되므로 넣을 때 받는다.
      const alt = window.prompt('사진 설명을 입력하세요. 사진이 보이지 않을 때 대신 표시됩니다.') ?? ''
      editor.chain().focus().setImage({ src: contentImageUrl(saved.id), alt }).run()
    }
    catch {
      onFailure('사진을 올리지 못했습니다. JPG, PNG, WebP만 8MB까지 올릴 수 있습니다.')
    }
  }

  function setLink() {
    if (!editor) return
    const current = editor.getAttributes('link').href as string | undefined
    const href = window.prompt('링크 주소를 입력하세요. 비우면 링크를 없앱니다.', current ?? 'https://')
    if (href === null) return
    if (!href.trim()) { editor.chain().focus().unsetLink().run(); return }
    editor.chain().focus().setLink({ href: href.trim() }).run()
  }

  return <div className="mt-[0.375rem] rounded-[0.3125rem] border border-field-line">
    <div className="flex flex-wrap gap-2 rounded-t-[0.3125rem] border-b border-field-line bg-sub p-2">
      <Tool editor={editor} active="heading" attrs={{ level: 2 }}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>제목</Tool>
      <Tool editor={editor} active="heading" attrs={{ level: 3 }}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>작은 제목</Tool>
      <Tool editor={editor} active="bold"
        onClick={() => editor.chain().focus().toggleBold().run()}>굵게</Tool>
      <Tool editor={editor} active="italic"
        onClick={() => editor.chain().focus().toggleItalic().run()}>기울임</Tool>
      <Tool editor={editor} active="bulletList"
        onClick={() => editor.chain().focus().toggleBulletList().run()}>목록</Tool>
      <Tool editor={editor} active="orderedList"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}>번호 목록</Tool>
      <Tool editor={editor} active="link" onClick={setLink}>링크</Tool>
      <Tool editor={editor} onClick={() => file.current?.click()}>사진</Tool>
      <input
        className="hidden"
        ref={file}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => { void insertImage(event.target.files?.[0]); event.target.value = '' }}
      />
    </div>
    <EditorContent editor={editor} />
  </div>
}

/**
 * 툴바 버튼.
 *
 * `admin-theme.css`의 `.admin-app button`이 레이어 밖이라 테두리와 글자색 유틸리티를 이긴다.
 * 눌린 상태는 테두리가 아니라 배경과 그림자로 표시한다. AI05-014의 선택 표시와 같은 우회다.
 */
function Tool({ editor, active, attrs, onClick, children }: {
  editor: Editor
  active?: string
  attrs?: Record<string, unknown>
  onClick: () => void
  children: ReactNode
}) {
  const on = active ? editor.isActive(active, attrs) : false
  return <button
    type="button"
    aria-pressed={active ? on : undefined}
    className={`h-7 rounded-[0.25rem] px-[0.5rem] text-[0.71875rem] font-semibold ${
      on ? 'bg-white shadow-[inset_0_0_0_1px_var(--primary)]' : 'bg-white shadow-[inset_0_0_0_1px_#dfe7e6]'}`}
    onClick={onClick}
  >{children}</button>
}

/** 저장된 값이 문서가 아니면 편집기가 빈 문서로 연다. 서버가 변환해 주므로 드문 경우다. */
function parse(value: string) {
  try {
    const document = JSON.parse(value)
    return document?.type === 'doc' ? document : undefined
  }
  catch {
    return undefined
  }
}

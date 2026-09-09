import Image from '@tiptap/extension-image'
import { EditorContent, useEditor, type ChainedCommands, type Editor } from '@tiptap/react'
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
        codeBlock: false,
        horizontalRule: false,
        heading: { levels: [2, 3] },
        // 건 링크를 눌러 확인할 수 있게 연다. 기본값이 새 탭이라 쓰던 글이 날아가지 않는다.
        link: { openOnClick: true, autolink: false, protocols: ['http', 'https'] },
      }),
      OwnImage,
    ],
    content: parse(value),
    // 기본값은 문서가 바뀔 때만 다시 그린다. 그러면 글자를 고르거나 서식만 바뀐 순간에는 툴바가
    // 그대로라 눌린 표시가 늦게 나타난다. 제목은 문서가 바뀌어 바로 보이고 굵게는 안 보였다.
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: changed }) => onChange(JSON.stringify(changed.getJSON())),
    // 편집기 안의 태그에 사이트와 같은 스타일을 건다. 렌더러와 같은 문자열을 쓰므로 두 화면이
    // 저절로 같아진다. 이것이 `관리자에서 본 모양 = 사이트에서 본 모양`의 실제 구현이다.
    editorProps: {
      attributes: { class: `${contentStyles} min-h-[18rem] p-4 outline-none` },
      /**
       * 붙여넣기로 들어오는 사진을 가로챈다.
       *
       * 파일이면 올려서 넣고, 웹 페이지에서 복사한 사진이면 주소만 오므로 안내하고 버린다.
       * 남의 서버 주소를 본문에 두면 방문자 접속 기록이 그쪽으로 새어 나가고, 그 페이지가
       * 사진을 내리면 우리 화면이 깨진다.
       */
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])]
        if (files.length > 0) { void insertFiles(files); return true }
        if (droppedExternalImage(event.clipboardData?.getData('text/html'))) {
          onFailure('웹 페이지에서 복사한 사진은 넣을 수 없습니다. 파일로 저장한 뒤 사진 버튼으로 올려 주세요.')
        }
        return false
      },
      handleDrop: (_view, event) => {
        const files = [...((event as DragEvent).dataTransfer?.files ?? [])]
        if (files.length > 0) { void insertFiles(files); return true }
        if (droppedExternalImage((event as DragEvent).dataTransfer?.getData('text/html'))) {
          onFailure('웹 페이지에서 끌어온 사진은 넣을 수 없습니다. 파일로 저장한 뒤 사진 버튼으로 올려 주세요.')
          return true
        }
        return false
      },
    },
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

  /** 사진 버튼·붙여넣기·드래그가 모두 이 함수로 모인다. 올린 뒤에만 본문에 들어간다. */
  async function insertFiles(chosen: File[]) {
    if (!editor) return
    const images = chosen.filter((file) => file.type.startsWith('image/'))
    if (images.length === 0) return
    try {
      for (const file of images) {
        const saved = await api.uploadImage(file)
        // 대체 텍스트는 사진이 안 뜰 때 대신 보이고 화면 낭독기가 읽는다. 나중에 붙이려면
        // 이미 넣은 사진이 전부 설명 없는 상태가 되므로 넣을 때 받는다.
        const alt = window.prompt('사진 설명을 입력하세요. 사진이 보이지 않을 때 대신 표시됩니다.') ?? ''
        editor.chain().focus().setImage({ src: contentImageUrl(saved.id), alt }).run()
      }
    }
    catch {
      onFailure('사진을 올리지 못했습니다. JPG, PNG, WebP만 8MB까지 올릴 수 있습니다.')
    }
  }

  /**
   * 툴바 명령은 고른 범위를 되돌린 뒤 실행한다.
   *
   * 버튼을 누르는 사이 편집기에서 포커스가 빠지면서 고른 범위가 풀린다. 그러면 굵게가 고른
   * 글자가 아니라 다음에 칠 글자에만 걸려, 눌러도 아무 일이 없다가 글씨를 쳐야 굵어졌다.
   */
  function command(run: (chain: ChainedCommands) => ChainedCommands) {
    if (!editor) return
    const { from, to } = editor.state.selection
    run(editor.chain().focus().setTextSelection({ from, to })).run()
  }

  /**
   * 고른 글자에 링크를 건다.
   *
   * 고른 글자가 없으면 걸 자리가 없다. 조용히 넘어가면 버튼이 고장 난 것처럼 보이므로 알린다.
   */
  function setLink() {
    if (!editor) return
    if (editor.state.selection.empty) {
      onFailure('링크를 걸 글자를 먼저 고른 뒤 링크 버튼을 눌러 주세요.')
      return
    }
    const current = editor.getAttributes('link').href as string | undefined
    const href = window.prompt('링크 주소를 입력하세요. 비우면 링크를 없앱니다.', current ?? 'https://')
    if (href === null) return
    command((chain) => (href.trim() ? chain.setLink({ href: href.trim() }) : chain.unsetLink()))
  }

  return <div className="mt-[0.375rem] rounded-[0.3125rem] border border-field-line">
    <div className="flex flex-wrap items-center gap-[0.125rem] rounded-t-[0.3125rem] border-b border-field-line bg-white px-2 py-[0.375rem] text-muted">
      <Tool editor={editor} label="되돌리기" disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}>
        <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
      </Tool>
      <Tool editor={editor} label="다시 실행" disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}>
        <path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
      </Tool>

      <Divider />

      <Tool editor={editor} label="제목" active="heading" attrs={{ level: 2 }}
        onClick={() => command((chain) => chain.toggleHeading({ level: 2 }))}>
        <path d="M4 12h8" /><path d="M4 18V6" /><path d="M12 18V6" />
        <path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1" />
      </Tool>
      <Tool editor={editor} label="작은 제목" active="heading" attrs={{ level: 3 }}
        onClick={() => command((chain) => chain.toggleHeading({ level: 3 }))}>
        <path d="M4 12h8" /><path d="M4 18V6" /><path d="M12 18V6" />
        <path d="M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2" />
        <path d="M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2" />
      </Tool>

      <Divider />

      <Tool editor={editor} label="굵게" active="bold"
        onClick={() => command((chain) => chain.toggleBold())}>
        <path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />
      </Tool>
      <Tool editor={editor} label="기울임" active="italic"
        onClick={() => command((chain) => chain.toggleItalic())}>
        <path d="M19 4h-9" /><path d="M14 20H5" /><path d="m15 4-4 16" />
      </Tool>
      <Tool editor={editor} label="밑줄" active="underline"
        onClick={() => command((chain) => chain.toggleUnderline())}>
        <path d="M6 4v6a6 6 0 0 0 12 0V4" /><path d="M4 20h16" />
      </Tool>
      <Tool editor={editor} label="취소선" active="strike"
        onClick={() => command((chain) => chain.toggleStrike())}>
        <path d="M4 12h16" />
        <path d="M17.5 6.5C16.5 5 14.5 4.2 12 4.2c-3 0-5 1.3-5 3.3 0 1.5 1 2.5 3 3.2" />
        <path d="M7 17c1 1.5 2.8 2.8 5.5 2.8 3 0 5-1.4 5-3.4 0-1.1-.5-2-1.6-2.7" />
      </Tool>
      <Tool editor={editor} label="코드" active="code"
        onClick={() => command((chain) => chain.toggleCode())}>
        <path d="m9 17-5-5 5-5" /><path d="m15 7 5 5-5 5" />
      </Tool>
      <Tool editor={editor} label="링크" active="link" onClick={setLink}>
        <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.8 1.7" />
        <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
      </Tool>

      <Divider />

      <Tool editor={editor} label="목록" active="bulletList"
        onClick={() => command((chain) => chain.toggleBulletList())}>
        <path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" />
        <path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" />
      </Tool>
      <Tool editor={editor} label="번호 목록" active="orderedList"
        onClick={() => command((chain) => chain.toggleOrderedList())}>
        <path d="M10 6h11" /><path d="M10 12h11" /><path d="M10 18h11" />
        <path d="M4 6h1v4" /><path d="M4 10h2" /><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
      </Tool>

      <Divider />

      <Tool editor={editor} label="사진" onClick={() => file.current?.click()}>
        <rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="1.6" />
        <path d="m21 15-4.5-4.5a2 2 0 0 0-3 0L3.5 20" />
      </Tool>
      <input
        className="hidden"
        ref={file}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => { void insertFiles([...(event.target.files ?? [])]); event.target.value = '' }}
      />
    </div>
    <EditorContent editor={editor} />
  </div>
}

function Divider() {
  return <span className="mx-[0.3125rem] h-4 w-px bg-[#e4ebea]" aria-hidden="true" />
}

/**
 * 툴바 버튼. 아이콘 하나에 이름은 읽어 주는 쪽에만 준다.
 *
 * `admin-theme.css`의 `.admin-app button`이 레이어 밖이라 테두리와 글자색 유틸리티를 이긴다.
 * 그래서 눌린 상태의 색은 인라인 스타일로 준다 — 인라인은 그 규칙보다 우선한다.
 * 테두리 대신 배경으로 표시하는 것은 AI05-014의 선택 표시와 같은 우회다.
 *
 * 버튼을 누르는 순간 편집기에서 포커스가 빠지면 고른 범위가 풀려 서식이 걸리지 않는다.
 * `mousedown`의 기본 동작을 막아 포커스를 편집기에 둔 채로 명령만 보낸다.
 */
function Tool({ editor, label, active, attrs, disabled, onClick, children }: {
  editor: Editor
  label: string
  active?: string
  attrs?: Record<string, unknown>
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  const on = active ? editor.isActive(active, attrs) : false
  return <button
    type="button"
    title={label}
    aria-label={label}
    aria-pressed={active ? on : undefined}
    disabled={disabled}
    style={on ? { color: 'var(--primary)' } : undefined}
    className={`grid h-7 w-7 place-items-center rounded-[0.25rem] disabled:opacity-35 ${
      on ? 'bg-[#e3efed]' : 'hover:bg-sub'}`}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
  >
    <svg
      width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >{children}</svg>
  </button>
}

/**
 * 우리가 올린 사진만 본문에 들어온다.
 *
 * <p>기본 설정은 어떤 `<img>`든 받아들여서, 웹 페이지에서 복사하거나 끌어다 놓으면 남의 서버
 * 주소가 그대로 본문에 박힌다. 저장할 때 서버가 거부하지만 그때는 이미 글을 다 쓴 뒤다.
 * 아예 들어오지 못하게 해서 서버 화이트리스트와 같은 선을 편집기에도 둔다.
 */
const OwnImage = Image.extend({
  parseHTML: () => [{ tag: 'img[src^="/api/site/images/"]' }],
}).configure({ inline: false, allowBase64: false })

/** 붙여넣거나 끌어온 것에 남의 사진이 섞여 있는지. 안내를 띄울지 판단한다. */
function droppedExternalImage(html: string | undefined) {
  return typeof html === 'string' && /<img\b/i.test(html)
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

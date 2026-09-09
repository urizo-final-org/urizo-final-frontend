import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import { TextStyle } from '@tiptap/extension-text-style'
import { EditorContent, useEditor, type ChainedCommands, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { contentStyles } from '../site/contentDocument'
import { HIGHLIGHT_COLORS, TEXT_COLORS } from '../site/contentPalette'
import { contentImageUrl, type CmsApi } from './api'
import { cleanImportedHtml } from './contentHtml'

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
  /** 소스 편집 중인 HTML. `null`이면 평소처럼 편집기를 보여준다. */
  const [source, setSource] = useState<string | null>(null)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // 인라인 코드는 열지 않는다. 이 사이트의 컨텐츠에 명령어나 함수 이름을 쓸 일이 없다.
        code: false,
        codeBlock: false,
        heading: { levels: [2, 3] },
        // 건 링크를 눌러 확인할 수 있게 연다. 기본값이 새 탭이라 쓰던 글이 날아가지 않는다.
        link: { openOnClick: true, autolink: false, protocols: ['http', 'https'] },
      }),
      OwnImage,
      // 색은 `textStyle` 마크의 속성으로 붙는다. `Color`만 넣으면 붙을 자리가 없다.
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
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
   * 소스 편집을 열고 닫는다.
   *
   * 열 때는 지금 본문을 HTML로 보여주고, 닫을 때 그것을 다시 본문으로 삼는다. 실제 변환은
   * Tiptap이 하며 편집기가 켠 부품만 스키마를 통과하므로 모르는 것은 알아서 사라진다.
   * 조용히 사라지면 붙여넣은 글이 반쯤 없어진 것을 나중에 발견하므로 무엇이 빠졌는지 알린다.
   */
  function toggleSource() {
    if (!editor) return
    if (source === null) {
      setSource(editor.getHTML())
      return
    }
    const cleaned = cleanImportedHtml(source)
    editor.commands.setContent(cleaned.html, { emitUpdate: true })
    setSource(null)
    if (cleaned.dropped.length > 0) {
      onFailure(`넣을 수 없는 ${cleaned.dropped.map((tag) => `<${tag}>`).join(' ')} 을(를) 빼고 반영했습니다.`)
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
    const { from, to, empty } = editor.state.selection
    const chain = editor.chain().focus()
    // 커서만 있을 때는 범위를 다시 세우지 않는다. ProseMirror가 선택을 바꾸면 `storedMarks`를
    // 비우기 때문에, 굵게를 켜 두고 밑줄을 누르면 굵게가 꺼진다. 서식을 겹쳐 켤 수 없게 된다.
    run(empty ? chain : chain.setTextSelection({ from, to })).run()
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
      {/*
        소스 편집 중에는 서식 단추를 잠근다. 편집기가 화면에 없는데 명령만 도는 자리를 없앤다.
        `contents`라 배치에는 영향이 없고, 소스 편집 단추는 이 밖에 두어 계속 누를 수 있다.
      */}
      <fieldset className="contents" disabled={source !== null}>
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
      <Tool editor={editor} label="링크" active="link" onClick={setLink}>
        <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.8 1.7" />
        <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
      </Tool>

      <Divider />

      {/*
        링크 글자에는 색을 칠하지 않는다. 파란 밑줄 자체가 눌러서 나가는 곳이라는 표시라,
        다른 색을 얹으면 그 신호가 흐려진다. 밑줄은 링크에, 글자색은 그 안쪽에 걸려 서로 어긋나기도 한다.
      */}
      <Swatches
        label="글자색"
        colors={TEXT_COLORS}
        disabled={editor.isActive('link')}
        current={editor.getAttributes('textStyle').color as string | undefined}
        onPick={(color) => command((chain) => (color ? chain.setColor(color) : chain.unsetColor()))}
      >
        <path d="m5 19 6-14h2l6 14" /><path d="M7.5 14h9" />
      </Swatches>
      <Swatches
        label="형광펜"
        colors={HIGHLIGHT_COLORS}
        disabled={editor.isActive('link')}
        current={editor.getAttributes('highlight').color as string | undefined}
        onPick={(color) => command((chain) => (color
          ? chain.setHighlight({ color })
          : chain.unsetHighlight()))}
        clearable
      >
        <path d="m15 4 5 5-9 9H6v-5z" /><path d="M4 21h16" />
      </Swatches>

      <Divider />

      <Tool editor={editor} label="인용문" active="blockquote"
        onClick={() => command((chain) => chain.toggleBlockquote())}>
        <path d="M4 6h16" /><path d="M4 18h16" />
        <path d="M8 10v4" /><path d="M12 10h8" /><path d="M12 14h5" />
      </Tool>
      {/*
        인용문 안에는 넣지 못하게 막는다. 넣고 나면 지울 방법이 마땅치 않아 커서가 갇힌다.
        링크 글자 가운데도 막는다. 거기서 나누면 같은 주소를 가리키는 링크 둘이 생긴다.
      */}
      <Tool editor={editor} label="구분선"
        disabled={editor.isActive('blockquote') || editor.isActive('link')}
        onClick={() => command((chain) => chain.setHorizontalRule())}>
        <path d="M3 12h18" /><path d="M6 7h12" opacity="0.4" />
        <path d="M6 17h12" opacity="0.4" />
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
      </fieldset>

      <span className="ml-auto" />

      {/* 자주 쓰는 것이 아니라 맨 끝에 둔다. 잘못 고치면 본문이 예상과 다르게 바뀐다. */}
      <Tool editor={editor} label="소스 편집" pressed={source !== null} onClick={toggleSource}>
        <path d="m9 17-5-5 5-5" /><path d="m15 7 5 5-5 5" />
      </Tool>
    </div>
    {source === null
      ? <EditorContent editor={editor} />
      : <textarea
        className="block min-h-[18rem] w-full resize-y border-0 bg-sub p-4 font-mono text-[0.8125rem] leading-[1.65] text-body outline-none"
        aria-label="HTML 소스"
        spellCheck={false}
        value={source}
        onChange={(event) => setSource(event.target.value)}
      />}
  </div>
}

function Divider() {
  return <span className="mx-[0.3125rem] h-4 w-px bg-[#e4ebea]" aria-hidden="true" />
}

/**
 * 색을 고르는 툴바 단추.
 *
 * <p>색을 자유롭게 입력받지 않고 정해진 것만 보여준다. 서버가 목록 밖 값을 거부하므로,
 * 고를 수 없게 하는 편이 저장할 때 막는 것보다 낫다.
 *
 * <p>지금 걸린 색을 아래쪽 띠로 보여준다. 아이콘만으로는 무엇이 걸려 있는지 알 수 없다.
 */
function Swatches({ label, colors, current, onPick, clearable, disabled, children }: {
  label: string
  colors: readonly { name: string; value: string | null }[]
  current?: string
  onPick: (color: string | null) => void
  clearable?: boolean
  disabled?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return <span className="relative">
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-expanded={open && !disabled}
      // 색이 걸려 있는지 읽어 주는 쪽에도 알린다. 아래 띠는 눈으로만 보이는 표시다.
      aria-pressed={current !== undefined}
      disabled={disabled}
      className="grid h-7 w-7 place-items-center rounded-[0.25rem] hover:bg-sub disabled:opacity-35"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => setOpen((was) => !was)}
    >
      <span className="grid gap-[0.125rem]">
        <svg
          width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        >{children}</svg>
        <span
          className="h-[0.1875rem] w-[0.9375rem] rounded-full"
          style={{ background: current ?? '#c3cfd2' }}
          aria-hidden="true"
        />
      </span>
    </button>
    {open && !disabled && <span
      className="absolute left-0 top-[1.875rem] z-20 flex gap-[0.1875rem] rounded-[0.3125rem] border border-line-soft bg-white p-[0.3125rem] shadow-[0_4px_12px_#1020341f]"
      role="group"
      aria-label={`${label} 고르기`}
    >
      {colors.map((color) => <button
        key={color.name}
        type="button"
        title={color.name}
        aria-label={color.name}
        className="h-[1.125rem] w-[1.125rem] rounded-[0.1875rem] shadow-[inset_0_0_0_1px_#00000018]"
        style={{ background: color.value ?? '#ffffff' }}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { onPick(color.value); setOpen(false) }}
      >{color.value === null && <span className="text-[0.625rem] text-muted-3">✕</span>}</button>)}
      {clearable && <button
        type="button"
        title="지우기"
        aria-label="지우기"
        className="h-[1.125rem] rounded-[0.1875rem] px-[0.3125rem] text-[0.625rem] text-muted-2 shadow-[inset_0_0_0_1px_#00000018]"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { onPick(null); setOpen(false) }}
      >지우기</button>}
    </span>}
  </span>
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
function Tool({ editor, label, active, attrs, disabled, pressed, onClick, children }: {
  editor: Editor
  label: string
  active?: string
  attrs?: Record<string, unknown>
  disabled?: boolean
  /** 편집기 상태가 아니라 화면 상태로 눌린 표시를 정할 때 쓴다. 소스 편집이 그렇다. */
  pressed?: boolean
  onClick: () => void
  children: ReactNode
}) {
  const on = pressed ?? (active ? editor.isActive(active, attrs) : false)
  return <button
    type="button"
    title={label}
    aria-label={label}
    aria-pressed={active !== undefined || pressed !== undefined ? on : undefined}
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

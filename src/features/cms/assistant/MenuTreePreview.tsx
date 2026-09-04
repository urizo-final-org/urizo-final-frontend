import { useState } from 'react'
import { hasMenuChange, type MenuChange, type MenuTreeNode } from './menuTree'

/** 변경 표시. 추가는 초록, 삭제는 빨강, 자리·값 변경은 노랑이다. */
const marks: Record<Exclude<MenuChange, 'none'>, { label: string; className: string }> = {
  added: { label: '추가', className: 'bg-[#f0f8f3] text-[#2f6b4f]' },
  removed: { label: '삭제', className: 'bg-[#fdf1f0] text-[#a3564f] line-through' },
  moved: { label: '이동', className: 'bg-[#fdf6e6] text-[#8a6a25]' },
  changed: { label: '변경', className: 'bg-[#fdf6e6] text-[#8a6a25]' },
}

function Row({ node, depth }: { node: MenuTreeNode; depth: number }) {
  const mark = node.change === 'none' ? null : marks[node.change]
  return <div
    className={`flex items-center gap-2 rounded-[0.25rem] px-[0.4375rem] py-[0.3125rem] text-[0.8125rem] ${
      mark ? mark.className : 'text-muted-2'}`}
    style={{ marginLeft: `${depth * 1.125}rem` }}
  >
    <span aria-hidden="true" className="select-none text-muted-3">{depth === 0 ? '📁' : '└'}</span>
    <b className="min-w-0 flex-1 truncate font-semibold">{node.name}</b>
    <small className="shrink-0 font-mono text-[0.6875rem] opacity-70">{node.path}</small>
    {mark && <span className="shrink-0 rounded bg-white/70 px-[0.3125rem] py-[0.0625rem] text-[0.65625rem] font-semibold">
      {node.change === 'moved' && node.from !== null ? `${node.from}번째에서 이동` : mark.label}
    </span>}
  </div>
}

/**
 * 결과 트리. 메뉴는 위치가 곧 정보라서 바뀐 항목만 뽑으면 어디로 들어가는지 알 수 없다.
 *
 * 변경 지점 주변만 펼치고 나머지는 접어 둔다. 번호는 표시하지 않는다. 화면은 순서만 알고
 * 번호 규칙은 Backend가 가지므로, 번호를 그리면 두 곳이 갈라진다.
 */
export default function MenuTreePreview({ nodes }: { nodes: MenuTreeNode[] }) {
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  function toggle(key: string) {
    setOpened((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  return <div className="grid gap-[0.125rem] rounded-[0.3125rem] border border-line-soft p-2">
    {nodes.map((node) => {
      const expanded = hasMenuChange(node) || opened.has(node.key)
      return <div key={node.key} className="grid gap-[0.125rem]">
        <div className="flex items-center gap-1">
          {node.children.length > 0
            ? <button
              type="button"
              className="grid h-5 w-5 shrink-0 place-items-center rounded border border-btn-line bg-white text-[0.625rem] text-muted"
              onClick={() => toggle(node.key)}
              aria-expanded={expanded}
              aria-label={`${node.name} 하위 메뉴 ${expanded ? '접기' : '펼치기'}`}
            >{expanded ? '−' : '+'}</button>
            : <span className="h-5 w-5 shrink-0" aria-hidden="true" />}
          <div className="min-w-0 flex-1"><Row node={node} depth={0} /></div>
          {!expanded && node.children.length > 0 && <small className="shrink-0 text-[0.6875rem] text-muted-3">하위 {node.children.length}개</small>}
        </div>
        {expanded && node.children.map((child) => <div key={child.key} className="pl-6">
          <Row node={child} depth={1} />
        </div>)}
      </div>
    })}
    {nodes.length === 0 && <p className="m-0 px-2 py-1 text-[0.75rem] text-muted-2">표시할 메뉴가 없습니다.</p>}
  </div>
}

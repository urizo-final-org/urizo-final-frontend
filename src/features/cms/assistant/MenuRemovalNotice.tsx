import { Icon } from '../../../shared/ui/icons'
import type { AssistantMenu } from './menuTree'

/**
 * 삭제로 사라지는 것들을 목록으로 센다.
 *
 * 트리로는 딸려 나가는 하위가 잘 안 보인다. 사람은 "메뉴 하나 지운다"고만 생각하므로
 * 갯수를 세어 주는 것이 이 화면의 핵심이다. 메뉴 삭제는 되돌릴 수 없다.
 */
export default function MenuRemovalNotice({ target, removed }: {
  target: AssistantMenu
  removed: AssistantMenu[]
}) {
  return <div className="rounded-[0.3125rem] border border-[#f0d5d1] bg-fail-bg px-[0.6875rem] py-[0.625rem]">
    <p className="m-0 flex items-center gap-2 text-[0.8125rem] font-semibold text-fail-fg">
      <Icon name="triangle-alert" size={15} />
      {removed.length > 0
        ? `"${target.name}"을(를) 삭제하면 하위 메뉴도 함께 사라집니다`
        : `"${target.name}" 메뉴를 삭제합니다`}
    </p>
    <div className="mt-[0.625rem] grid gap-[0.1875rem]">
      <MenuLine menu={target} depth={0} />
      {removed.map((child) => <MenuLine key={child.id} menu={child} depth={1} />)}
    </div>
    <p className="mb-0 mt-[0.625rem] text-[0.75rem] font-semibold text-fail-fg">
      총 {removed.length + 1}개 메뉴가 삭제됩니다.
    </p>
    <p className="mb-0 mt-[0.1875rem] text-[0.71875rem] text-muted">
      연결된 컨텐츠·게시판은 삭제되지 않고 연결만 해제됩니다. 삭제한 메뉴는 되돌릴 수 없습니다.
    </p>
  </div>
}

function MenuLine({ menu, depth }: { menu: AssistantMenu; depth: number }) {
  return <div
    className="flex items-center gap-2 text-[0.8125rem] text-body"
    style={{ marginLeft: `${depth * 1.125}rem` }}
  >
    <span aria-hidden="true" className="select-none text-muted-3">{depth === 0 ? '·' : '└'}</span>
    <b className="min-w-0 truncate font-semibold line-through">{menu.name}</b>
    <small className="shrink-0 font-mono text-[0.6875rem] text-muted-3">{menu.path}</small>
    {menu.link && <small className="shrink-0 text-[0.6875rem] text-muted-2">{menu.link}</small>}
  </div>
}

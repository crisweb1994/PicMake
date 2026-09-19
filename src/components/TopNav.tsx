/** 顶左浮岛：品牌 / 历史 / 设置 */
import { Button } from '@heroui/react'
import { Menu, Settings } from 'lucide-react'

export function TopNav(props: { onHistory: () => void; onSettings: () => void }) {
  return (
    <nav className="pm-island pm-nav" aria-label="主导航">
      <div className="pm-brand">
        <i aria-hidden="true" />
        picmake
      </div>
      <div className="pm-vr" aria-hidden="true" />
      <Button variant="ghost" isIconOnly size="sm" aria-label="历史" onPress={props.onHistory}>
        <Menu size={15} />
      </Button>
      <Button variant="ghost" isIconOnly size="sm" aria-label="设置" onPress={props.onSettings}>
        <Settings size={15} />
      </Button>
    </nav>
  )
}

/** 顶左浮岛：品牌 / 主题切换 / 历史 / 设置 */
import { Button } from "@heroui/react";
import { Menu, Moon, Settings, Sun } from "lucide-react";
import type { ResolvedTheme } from "../lib/theme";

export function TopNav(props: {
  theme: ResolvedTheme;
  onToggleTheme: () => void;
  onHistory: () => void;
  onSettings: () => void;
}) {
  const dark = props.theme === "dark";
  return (
    <nav className="pm-island pm-nav" aria-label="主导航">
      <div className="pm-brand">
        <img
          src="/favicon.svg"
          alt=""
          aria-hidden="true"
          className="pm-brand-logo"
        />
        PicMake
      </div>
      <div className="pm-vr" aria-hidden="true" />
      <Button
        variant="ghost"
        isIconOnly
        size="sm"
        aria-label={dark ? "切换到浅色模式" : "切换到深色模式"}
        onPress={props.onToggleTheme}
      >
        {dark ? <Sun size={15} /> : <Moon size={15} />}
      </Button>
      <Button
        variant="ghost"
        isIconOnly
        size="sm"
        aria-label="历史"
        onPress={props.onHistory}
      >
        <Menu size={15} />
      </Button>
      <Button
        variant="ghost"
        isIconOnly
        size="sm"
        aria-label="设置"
        onPress={props.onSettings}
      >
        <Settings size={15} />
      </Button>
    </nav>
  );
}

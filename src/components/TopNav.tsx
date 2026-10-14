/** 顶左浮岛：品牌 / 主题切换 / 历史 / 设置 / GitHub 源码链接 */
import { useTranslation } from "react-i18next";
import { Button, buttonVariants } from "@heroui/react";
import { Menu, Moon, Settings, Sun } from "lucide-react";
import type { ResolvedTheme } from "../lib/theme";

const REPO_URL = "https://github.com/crisweb1994/PicMake";

export function TopNav(props: {
  theme: ResolvedTheme;
  onToggleTheme: () => void;
  onHistory: () => void;
  onSettings: () => void;
}) {
  const { t } = useTranslation();
  const dark = props.theme === "dark";
  return (
    <nav className="pm-island pm-nav" aria-label={t("nav.label")}>
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
        aria-label={dark ? t("nav.toLight") : t("nav.toDark")}
        onPress={props.onToggleTheme}
      >
        {dark ? <Sun size={15} /> : <Moon size={15} />}
      </Button>
      <Button
        variant="ghost"
        isIconOnly
        size="sm"
        aria-label={t("nav.history")}
        onPress={props.onHistory}
      >
        <Menu size={15} />
      </Button>
      <Button
        variant="ghost"
        isIconOnly
        size="sm"
        aria-label={t("nav.settings")}
        onPress={props.onSettings}
      >
        <Settings size={15} />
      </Button>
      {/* 外链用 <a> 套 ghost 按钮样式；Lucide 1.x 不含品牌图标，标志用内联 SVG */}
      <a
        className={buttonVariants({
          variant: "ghost",
          size: "sm",
          isIconOnly: true,
        })}
        href={REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("nav.github")}
        title={t("nav.github")}
      >
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <path
            fill="currentColor"
            d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
          />
        </svg>
      </a>
    </nav>
  );
}

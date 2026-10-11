/** 历史抽屉：纯展示的受控弹层 */
import { useState } from "react";
import {
  Button,
  Drawer,
  DrawerBackdrop,
  DrawerContent,
  DrawerDialog,
} from "@heroui/react";
import { Search, Settings2, Star, X } from "lucide-react";
import { fmtTime } from "../../lib/format";
import type { HistoryRow } from "../../db/schema";
import {
  DEFAULT_HISTORY_FILTER,
  filterHistoryRows,
  isHistoryFilterActive,
  type HistoryFilter,
  type HistoryRange,
} from "../../lib/history-filter";
import { Segmented } from "../controls";

/* ── 历史抽屉：筛选为内部视角，关闭时丢弃；星标经 onToggleStar 写库 ── */
export function HistoryDrawer(props: {
  open: boolean;
  rows: HistoryRow[];
  thumbnailUrls: Record<string, string>;
  currentId: string | null;
  onSelect: (id: string) => void;
  onToggleStar: (id: string) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<HistoryFilter>(DEFAULT_HISTORY_FILTER);
  const close = () => {
    props.onClose();
    setFilter(DEFAULT_HISTORY_FILTER);
  };
  const list = filterHistoryRows(props.rows, filter);
  return (
    <Drawer
      isOpen={props.open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DrawerBackdrop isKeyboardDismissDisabled>
        <DrawerContent placement="left">
          <DrawerDialog aria-label="生成历史" className="pm-drawer-hd">
            <div className="pm-drawer-h">
              历史
              <Button
                variant="ghost"
                isIconOnly
                size="sm"
                aria-label="关闭"
                onPress={close}
              >
                <X size={14} />
              </Button>
            </div>
            <div className="pm-dfilter">
              <div className="pm-dsearch">
                <Search size={13} aria-hidden="true" />
                <input
                  type="text"
                  value={filter.query}
                  placeholder="搜索描述…"
                  aria-label="搜索历史描述"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) =>
                    setFilter({ ...filter, query: e.target.value })
                  }
                />
                {filter.query !== "" && (
                  <button
                    type="button"
                    className="pm-dclear"
                    aria-label="清除搜索词"
                    onClick={() => setFilter({ ...filter, query: "" })}
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
              <Segmented<HistoryRange>
                full
                mini
                ariaLabel="按日期筛选"
                options={[
                  { value: "all", label: "全部" },
                  { value: "today", label: "今天" },
                  { value: "7d", label: "近7天" },
                  { value: "30d", label: "近30天" },
                ]}
                value={filter.range}
                onChange={(range) => setFilter({ ...filter, range })}
              />
              <button
                type="button"
                className={"pm-dfav" + (filter.starredOnly ? " on" : "")}
                aria-pressed={filter.starredOnly}
                onClick={() =>
                  setFilter({ ...filter, starredOnly: !filter.starredOnly })
                }
              >
                <Star
                  size={12}
                  aria-hidden="true"
                  fill={filter.starredOnly ? "currentColor" : "none"}
                />
                只看收藏
              </button>
            </div>
            {isHistoryFilterActive(filter) && list.length > 0 && (
              <div className="pm-dcount">
                <span>
                  {list.length} 条结果 · 共 {props.rows.length} 条
                </span>
                <button
                  type="button"
                  onClick={() => setFilter(DEFAULT_HISTORY_FILTER)}
                >
                  清除筛选
                </button>
              </div>
            )}
            <div className="pm-dlist">
              {list.map((r) => (
                <div key={r.id} className="pm-drow">
                  <button
                    type="button"
                    className="pm-ditem"
                    aria-current={r.id === props.currentId}
                    onClick={() => props.onSelect(r.id)}
                  >
                    <div
                      className="pm-dthumb"
                      aria-hidden="true"
                      style={
                        props.thumbnailUrls[r.imageIds[0]]
                          ? {
                              backgroundImage: `url(${props.thumbnailUrls[r.imageIds[0]]})`,
                            }
                          : undefined
                      }
                    />
                    <span className="pm-dtxt">
                      <span className="p">{r.prompt}</span>
                      <span className="s">
                        {fmtTime(r.createdAt)} · {r.imageIds.length} 张
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={"pm-dstar" + (r.starred ? " on" : "")}
                    aria-pressed={!!r.starred}
                    aria-label={r.starred ? "取消收藏" : "收藏"}
                    onClick={() => props.onToggleStar(r.id)}
                  >
                    <Star
                      size={13}
                      aria-hidden="true"
                      fill={r.starred ? "currentColor" : "none"}
                    />
                  </button>
                </div>
              ))}
              {props.rows.length === 0 ? (
                <p className="pm-dempty">
                  还没有作品，生成的图片会自动保存在本机
                </p>
              ) : (
                list.length === 0 && (
                  <div className="pm-dnone">
                    <p className="pm-dempty">
                      没有匹配的历史记录
                      <br />
                      调整搜索词或筛选条件试试
                    </p>
                    <button
                      type="button"
                      className="pm-dnone-reset"
                      onClick={() => setFilter(DEFAULT_HISTORY_FILTER)}
                    >
                      清除筛选
                    </button>
                  </div>
                )
              )}
            </div>
            <div className="pm-drawer-f">
              <Settings2 size={11} /> 全部数据仅保存在本机浏览器
            </div>
          </DrawerDialog>
        </DrawerContent>
      </DrawerBackdrop>
    </Drawer>
  );
}

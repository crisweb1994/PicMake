/** 弹层组：引导 / 设置 / 确认 / 灯箱 / 错误岛 / Toast / 历史抽屉，纯展示
 *  Modal/Drawer 使用 HeroUI 复合组件（React Aria 提供焦点圈禁与滚动锁）；
 *  灯箱与 Toast 为沉浸/轻反馈场景，保持自绘（迁移决策见 AGENTS 讨论记录）。 */
import { useState } from "react";
import {
  Button,
  Drawer,
  DrawerBackdrop,
  DrawerContent,
  DrawerDialog,
  Input,
  Modal,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
  Spinner,
  useOverlayState,
} from "@heroui/react";
import { ChevronLeft, ChevronRight, Search, Settings2, Star, X } from "lucide-react";
import { fmtTime } from "../lib/format";
import type { HistoryRow } from "../db/schema";
import {
  DEFAULT_HISTORY_FILTER,
  filterHistoryRows,
  isHistoryFilterActive,
  type HistoryFilter,
  type HistoryRange,
} from "../lib/history-filter";
import { Segmented } from "./controls";
import { StageToolbar } from "./Stage";
import type {
  ConfirmState,
  DisplayImage,
  DisplayInput,
} from "../lib/view-models";
import type { ThemePref } from "../lib/theme";

interface TestResult {
  ok: true;
  models: string[];
}
type TestConn = (
  baseUrl: string,
  apiKey: string,
) => Promise<TestResult | { ok: false; message: string }>;

function ConnResult(props: { result: string | null }) {
  if (!props.result) return null;
  return (
    <p
      className={
        "pm-tconn" + (props.result.startsWith("连接成功") ? " ok" : "")
      }
    >
      {props.result}
    </p>
  );
}

function TestButton(props: { testing: boolean; onTest: () => void }) {
  return (
    <Button
      variant="secondary"
      isDisabled={props.testing}
      onPress={props.onTest}
    >
      {props.testing ? <Spinner size="sm" /> : "测试连接"}
    </Button>
  );
}

/* ── 设置弹窗（PRD FR-1） ── */
export function SettingsModal(props: {
  open: boolean;
  baseUrl: string;
  apiKey: string;
  storageText: string;
  theme: ThemePref;
  onThemeChange: (theme: ThemePref) => void;
  onTest: TestConn;
  onSave: (baseUrl: string, apiKey: string) => void;
  onClose: () => void;
}) {
  const [baseUrl, setBaseUrl] = useState(props.baseUrl);
  const [apiKey, setApiKey] = useState(props.apiKey);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  return (
    <Modal
      isOpen={props.open}
      onOpenChange={(o) => {
        if (!o) props.onClose();
      }}
    >
      <ModalBackdrop>
        <ModalContainer placement="center">
          <ModalDialog aria-label="设置" className="pm-modal">
            <Modal.CloseTrigger />
            <h3>连接你的 API</h3>
            <p className="sub">配置一次即可，数据只保存在本机浏览器。</p>
            <label>外观</label>
            <Segmented
              full
              ariaLabel="外观"
              options={[
                { value: "light", label: "浅色" },
                { value: "dark", label: "深色" },
                { value: "system", label: "跟随系统" },
              ]}
              value={props.theme}
              onChange={props.onThemeChange}
            />
            <label htmlFor="s-base">API 地址</label>
            <Input
              id="s-base"
              autoComplete="off"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
            <p className="pm-hint">
              支持官方地址或兼容中转站，如 https://example.com/v1；末尾 /v1
              会自动处理。
            </p>
            <label htmlFor="s-key">API Key</label>
            <Input
              id="s-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <ConnResult result={result} />
            <p className="pm-hint">
              Key
              仅保存在本机浏览器，只发往上面配置的地址；使用中转站时，画面数据会经过中转方。
            </p>
            <p className="pm-hint">{props.storageText}</p>
            <div className="pm-mbtns">
              <TestButton
                testing={testing}
                onTest={() => {
                  setTesting(true);
                  setResult(null);
                  void props.onTest(baseUrl, apiKey).then((r) => {
                    setTesting(false);
                    setResult(
                      r.ok
                        ? `连接成功 · ${r.models.length} 个模型可用`
                        : r.message,
                    );
                  });
                }}
              />
              <Button
                variant="primary"
                onPress={() => props.onSave(baseUrl, apiKey)}
              >
                保存
              </Button>
            </div>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}

/* ── 通用确认 ── */
export function ConfirmDialog(props: {
  state: ConfirmState | null;
  onCancel: () => void;
}) {
  const st = useOverlayState({
    isOpen: props.state != null,
    onOpenChange: (o) => {
      if (!o) props.onCancel();
    },
  });
  return (
    <Modal state={st}>
      <ModalBackdrop className="pm-confirm" isKeyboardDismissDisabled>
        <ModalContainer placement="center">
          <ModalDialog
            role="alertdialog"
            aria-label={props.state?.title ?? "确认"}
            className="pm-modal"
          >
            <h3>{props.state?.title}</h3>
            <p className="sub">{props.state?.desc}</p>
            <div className="pm-mbtns">
              <Button variant="secondary" onPress={props.onCancel}>
                取消
              </Button>
              <Button
                variant="primary"
                onPress={() => {
                  const ok = props.state?.onOk;
                  props.onCancel();
                  ok?.();
                }}
              >
                继续
              </Button>
            </div>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}

/* ── 灯箱：全屏沉浸查看器，保持自绘 ── */
export function Lightbox(props: {
  img: DisplayImage | null;
  prompt: string;
  onDownload: () => void;
  onReuse?: () => void;
  onClose: () => void;
}) {
  if (!props.img) return null;
  return (
    <div
      className="pm-lb"
      role="dialog"
      aria-label="查看大图"
      onClick={(e) => e.target === e.currentTarget && props.onClose()}
    >
      <button
        type="button"
        className="pm-x-btn"
        aria-label="关闭大图"
        onClick={props.onClose}
      >
        <X size={15} />
      </button>
      <div className="pm-lb-wrap">
        <div
          className="pm-lb-im"
          style={{ backgroundImage: `url(${props.img.url})` }}
          role="img"
          aria-label={props.prompt}
          onClick={props.onClose}
        />
        <div className="pm-lb-bar">
          <p>{props.prompt}</p>
          <Button variant="secondary" onPress={props.onDownload}>
            下载
          </Button>
          {props.onReuse && (
            <Button variant="primary" onPress={props.onReuse}>
              复用参数
            </Button>
          )}
          <Button variant="secondary" onPress={props.onClose}>
            关闭
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── 轮播：多图网格点选浮层，左右切换，底部工具条与单张一致（PRD §5） ── */
export function Carousel(props: {
  img: DisplayImage;
  prompt: string;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onZoom: () => void;
  onDownload: () => void;
  onReuse: () => void;
  onEdit?: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="pm-car"
      role="dialog"
      aria-label="查看图片"
      onClick={(e) => e.target === e.currentTarget && props.onClose()}
    >
      <button
        type="button"
        className="pm-x-btn"
        aria-label="关闭轮播"
        onClick={props.onClose}
      >
        <X size={15} />
      </button>
      <button
        type="button"
        className="pm-car-arrow prev"
        aria-label="上一张"
        onClick={props.onPrev}
      >
        <ChevronLeft size={19} />
      </button>
      <figure className="pm-car-fig">
        <img src={props.img.url} alt={props.prompt} />
        <figcaption>
          {props.index + 1} / {props.total}
        </figcaption>
      </figure>
      <button
        type="button"
        className="pm-car-arrow next"
        aria-label="下一张"
        onClick={props.onNext}
      >
        <ChevronRight size={19} />
      </button>
      <StageToolbar
        onZoom={props.onZoom}
        onDownload={props.onDownload}
        onReuse={props.onReuse}
        onEdit={props.onEdit}
        onDelete={props.onDelete}
      />
    </div>
  );
}

/* ── 历史抽屉（PRD FR-6）：HeroUI Drawer，左侧滑出 ──
   筛选（2026-09-23）为抽屉内部视角：条件 state 属 UI 语义，关闭时丢弃、重开回到未筛选；
   星标是外部副作用，经 onToggleStar(id) 上报，由接线层写库。 */
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
                  onChange={(e) => setFilter({ ...filter, query: e.target.value })}
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

/** 输入预览由 Modal 限制焦点和锁滚动；图片尺寸仅为加载后的 UI 测量。 */
export function InputPreview(props: {
  image: DisplayInput | null;
  onClose: () => void;
}) {
  const [size, setSize] = useState("");
  return (
    <Modal
      isOpen={!!props.image}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <ModalBackdrop isKeyboardDismissDisabled>
        <ModalContainer placement="center">
          <ModalDialog className="pm-input-preview" aria-label="输入图片预览">
            <h3>{props.image?.label}</h3>
            <img
              src={props.image?.url}
              alt={props.image?.name ?? "输入图片"}
              onLoad={(event) =>
                setSize(
                  `${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight}`,
                )
              }
            />
            <p>{size}</p>
            <Button variant="secondary" onPress={props.onClose}>
              关闭预览
            </Button>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}

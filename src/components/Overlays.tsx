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
import { ChevronLeft, ChevronRight, Settings2, X } from "lucide-react";
import { fmtTime } from "../lib/format";
import type { HistoryRow } from "../db/schema";
import { StageToolbar } from "./Stage";
import type {
  ConfirmState,
  DisplayImage,
  ErrorState,
} from "../lib/view-models";

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
            <label htmlFor="s-base">API 地址</label>
            <Input
              id="s-base"
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
      <ModalBackdrop className="pm-confirm">
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

/* ── 错误岛（PRD FR-8） ── */
export function ErrorIsland(props: {
  error: ErrorState | null;
  onEdit: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  if (!props.error) return null;
  return (
    <div className="pm-err" role="alert">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M12 9v4M12 17h.01" />
        <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z" />
      </svg>
      <div>
        <b>{props.error.title}</b>
        <p>{props.error.message}</p>
        <div className="acts">
          {props.error.kind === "save-failed" ? (
            <>
              <button type="button" onClick={props.onRetry}>
                重试保存
              </button>
              <button type="button" onClick={props.onDiscard}>
                放弃结果
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={props.onEdit}>
                去修改描述
              </button>
              <button type="button" onClick={props.onRetry}>
                重试生成
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── 历史抽屉（PRD FR-6）：HeroUI Drawer，左侧滑出 ── */
export function HistoryDrawer(props: {
  open: boolean;
  rows: HistoryRow[];
  thumbnailUrls: Record<string, string>;
  currentId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Drawer
      isOpen={props.open}
      onOpenChange={(o) => {
        if (!o) props.onClose();
      }}
    >
      <DrawerBackdrop>
        <DrawerContent placement="left">
          <DrawerDialog aria-label="生成历史" className="pm-drawer-hd">
            <div className="pm-drawer-h">
              历史
              <Button
                variant="ghost"
                isIconOnly
                size="sm"
                aria-label="关闭"
                onPress={props.onClose}
              >
                <X size={14} />
              </Button>
            </div>
            <div className="pm-dlist">
              {props.rows.map((r) => (
                <button
                  key={r.id}
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
              ))}
              {props.rows.length === 0 && (
                <p className="pm-dempty">
                  还没有作品，生成的图片会自动保存在本机
                </p>
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

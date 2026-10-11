/** 设置弹窗：纯展示的受控弹层 */
import { useState } from "react";
import {
  Button,
  Input,
  Modal,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
  Spinner,
} from "@heroui/react";
import { Segmented } from "../controls";
import type { ThemePref } from "../../lib/theme";

interface TestResult {
  ok: true;
  models: string[];
}
type TestConn = (
  baseUrl: string,
  apiKey: string,
) => Promise<TestResult | { ok: false; message: string }>;

/* ── 设置弹窗 ── */
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
            {result && (
              <p
                className={
                  "pm-tconn" + (result.startsWith("连接成功") ? " ok" : "")
                }
              >
                {result}
              </p>
            )}
            <p className="pm-hint">
              Key
              仅保存在本机浏览器，只发往上面配置的地址；使用中转站时，画面数据会经过中转方。
            </p>
            <p className="pm-hint">{props.storageText}</p>
            <div className="pm-mbtns">
              <Button
                variant="secondary"
                isDisabled={testing}
                onPress={() => {
                  setTesting(true);
                  setResult(null);
                  void props.onTest(baseUrl, apiKey).then((r) => {
                    setTesting(false);
                    setResult(
                      r.ok
                        ? `连接成功 · ${r.models.length} 个模型可用 · ${
                            r.models.some((m) => m.includes("gpt-image-2.5"))
                              ? "含"
                              : "未含"
                          } gpt-image-2.5 系列`
                        : r.message,
                    );
                  });
                }}
              >
                {testing ? <Spinner size="sm" /> : "测试连接"}
              </Button>
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

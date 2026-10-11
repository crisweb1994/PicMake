/** 设置流程：保存配置、测试连接（调用 API 与 toast 在这里） */
import { toast } from "@heroui/react";
import { testConnection as requestModels } from "../api/client";
import { ERROR_HINTS } from "../lib/types";
import { useSettings } from "../store/settings";
import { closeSettings } from "../store/workspace/actions";

/** 保存设置（有 apiKey 即视为已引导，启动弹窗由它决定） */
export function saveSettings(baseUrl: string, apiKey: string) {
  useSettings.getState().setApi(baseUrl, apiKey);
  closeSettings();
  toast("设置已保存");
}

export async function testConnection(baseUrl: string, apiKey: string) {
  const result = await requestModels({ baseUrl, apiKey });
  return result.ok
    ? result
    : { ok: false as const, message: ERROR_HINTS[result.error.kind] };
}

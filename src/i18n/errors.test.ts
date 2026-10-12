import { afterEach, describe, expect, it } from "vitest";
import { API_ERROR_DETAIL_CODES, ApiError, clientError } from "../lib/types";
import { errorDetail, errorHint, errorMessage, kindMessage } from "./errors";
import { i18n, t } from "./index";

afterEach(async () => {
  await i18n.changeLanguage("zh-CN");
});

describe("errorMessage（中文输出与改造前逐字一致）", () => {
  it("服务端原文原样保留，不翻译", () => {
    const error = new ApiError("auth", "Incorrect API key provided", 401, {
      code: "key-invalid",
    });
    expect(errorMessage(error, t)).toBe(
      "API Key 无效：Incorrect API key provided",
    );
  });

  it("没有服务端原文：用客户端细节", () => {
    const error = new ApiError("auth", "", 401, { code: "key-invalid" });
    expect(errorMessage(error, t)).toBe("API Key 无效：Key 无效");
    expect(errorMessage(clientError("network", "unreachable"), t)).toBe(
      "无法连接到 API 地址：无法连接到 API 地址",
    );
  });

  it("细节带参数", () => {
    expect(
      errorMessage(
        clientError("unknown", "request-failed", { status: 418 }),
        t,
      ),
    ).toBe("生成失败：请求失败（418）");
    expect(
      errorMessage(
        clientError("source-unavailable", "source-missing", { index: 2 }),
        t,
      ),
    ).toBe("来源图片不可用：图2：来源图片不可用，无法继续编辑");
  });

  it("既没有原文也没有细节：用该种类的通用建议", () => {
    expect(errorMessage(new ApiError("rate-limit", ""), t)).toBe(
      "请求过于频繁：请求过于频繁，稍等片刻再试。",
    );
  });

  it("不是 ApiError：按未知错误", () => {
    expect(errorMessage(new Error("boom"), t)).toBe(
      "生成失败：生成失败，请重试。",
    );
    expect(errorDetail("oops", t)).toBe("生成失败，请重试。");
  });

  it("标题 + 通用建议", () => {
    expect(kindMessage("save-failed", t)).toBe(
      "本地保存失败：图片已生成，但本地保存失败。结果暂存在内存，可查看或下载；离开前会再次确认。",
    );
    expect(kindMessage("history-unavailable", t)).toBe(
      "历史记录读取失败：本地数据暂时无法读取，可刷新页面重试；在此期间新生成的结果可能无法保存。",
    );
  });

  it("限制数值来自 lib 常量", () => {
    expect(errorHint("too-many-images", t)).toBe("最多添加 16 张输入图片。");
    expect(errorHint("image-too-large", t)).toBe(
      "请选择小于 50 MiB 的非空图片。",
    );
  });
});

describe("errorMessage（英文）", () => {
  it("标题、细节与服务端原文", async () => {
    await i18n.changeLanguage("en");
    expect(errorMessage(clientError("network", "unreachable"), t)).toBe(
      "Can't reach the API URL: Can't reach the API URL",
    );
    expect(
      errorMessage(new ApiError("auth", "Incorrect API key provided", 401), t),
    ).toBe("Invalid API key: Incorrect API key provided");
    expect(errorHint("too-many-images", t)).toBe(
      "You can add at most 16 input images.",
    );
  });
});

describe("细节文案完整", () => {
  for (const locale of ["zh-CN", "en"]) {
    it(`${locale}：每个细节码都有文案，参数齐全时没有残留占位符`, async () => {
      await i18n.changeLanguage(locale);
      for (const code of API_ERROR_DETAIL_CODES) {
        const error = clientError("unknown", code, { status: 500, index: 3 });
        const text = errorDetail(error, t);
        expect(text, code).not.toBe("");
        expect(text, code).not.toContain("{{");
        expect(text, code).not.toContain("errors.detail");
      }
    });
  }
});

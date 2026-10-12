import { afterEach, describe, expect, it } from "vitest";
import { SKETCH_PALETTE } from "../lib/sketch";
import { i18n, t } from "./index";
import {
  inpaintIssueText,
  inputLabel,
  inputName,
  issueText,
  missingText,
  ratioLabel,
  sizeChipValue,
  sizeReasonText,
  sizeText,
  sketchMeta,
  uploadIssueText,
} from "./labels";

afterEach(async () => {
  await i18n.changeLanguage("zh-CN");
});

const form = { ratio: "3:2" as const, base: "1k" as const, cw: "", ch: "" };

describe("尺寸文本", () => {
  it("中文", () => {
    expect(sizeText("auto", t)).toBe("自动");
    expect(sizeText({ w: 1536, h: 1024 }, t)).toBe("1536 × 1024");
    expect(sizeChipValue(form, t)).toBe("3:2 · 1K");
    expect(sizeChipValue({ ...form, ratio: "auto" }, t)).toBe("自动");
    expect(sizeChipValue({ ...form, cw: "1280", ch: "960" }, t)).toBe(
      "1280×960",
    );
    expect(ratioLabel("auto", t)).toBe("自动");
    expect(ratioLabel("16:9", t)).toBe("16:9");
  });

  it("英文", async () => {
    await i18n.changeLanguage("en");
    expect(sizeText("auto", t)).toBe("Auto");
    expect(sizeChipValue({ ...form, ratio: "auto" }, t)).toBe("Auto");
    expect(sizeChipValue(form, t)).toBe("3:2 · 1K");
  });
});

describe("提示文案", () => {
  it("校验问题码（限制数值取自 lib）", () => {
    expect(issueText("empty-prompt", t)).toBe("先写一句画面描述");
    expect(issueText("too-large", t)).toBe("长宽上限 3840 × 2160");
    expect(issueText("custom-size", t)).toBe(
      "自定义尺寸无效：宽高须被 16 整除，比例 1:3 ～ 3:1，不超过 3840 × 2160",
    );
  });

  it("重绘问题码", () => {
    expect(inpaintIssueText("empty-mask", t)).toBe("请先涂选需要修改的区域");
  });

  it("重绘输出尺寸的原因", async () => {
    expect(sizeReasonText({ floor: null, scaled: false }, t)).toBe(
      "原尺寸合法直出",
    );
    expect(sizeReasonText({ floor: "h", scaled: false }, t)).toBe(
      "高度向下取 16 的倍数",
    );
    expect(sizeReasonText({ floor: "both", scaled: true }, t)).toBe(
      "宽度与高度向下取 16 的倍数，等比放入 3840 × 2160 输出框",
    );
    await i18n.changeLanguage("en");
    expect(sizeReasonText({ floor: "w", scaled: true }, t)).toBe(
      "Width rounded down to a multiple of 16 · Scaled to fit the 3840 × 2160 output frame",
    );
  });

  it("缺失的资源名", () => {
    expect(missingText({ kind: "mask" }, t)).toBe("选区");
    expect(missingText({ kind: "base" }, t)).toBe("底图");
    expect(missingText({ kind: "reference" }, t)).toBe("参考图");
    expect(missingText({ kind: "reference", name: "a.png" }, t)).toBe(
      "参考图「a.png」",
    );
  });

  it("上传读取提示（中文与改造前一致）", () => {
    expect(
      uploadIssueText(
        { kind: "file", file: "bad.png", error: "invalid-image" },
        t,
      ),
    ).toBe("bad.png：请选择有效的 PNG、JPEG 或 WebP 图片。");
    expect(uploadIssueText({ kind: "overflow", kept: 1, skipped: 2 }, t)).toBe(
      "最多添加 16 张输入图片。本次添加 1 张，2 张未添加。",
    );
  });

  it("草图弹层说明", async () => {
    const size = { width: 640, height: 480 };
    expect(sketchMeta(size, { kind: "new" }, t)).toBe("640 × 480");
    expect(sketchMeta(size, { kind: "attachment", index: 2 }, t)).toBe(
      "640 × 480 · 图2 的草图",
    );
    expect(sketchMeta(size, { kind: "history" }, t)).toBe(
      "640 × 480 · 历史草图",
    );
    await i18n.changeLanguage("en");
    expect(sketchMeta(size, { kind: "attachment", index: 2 }, t)).toBe(
      "640 × 480 · sketch of Image 2",
    );
  });

  it("每个色板颜色在两种语言里都有名字", async () => {
    for (const locale of ["zh-CN", "en"]) {
      await i18n.changeLanguage(locale);
      for (const color of SKETCH_PALETTE)
        expect(i18n.exists(`sketch.colorName.${color.id}`), color.id).toBe(
          true,
        );
    }
  });
});

describe("输入来源的名字", () => {
  it("中文", () => {
    expect(inputName({ kind: "file", fileName: "cat.png" }, t)).toBe("cat.png");
    expect(inputName({ kind: "sketch" }, t)).toBe("草图");
    expect(inputName({ kind: "base" }, t)).toBe("底图");
    expect(inputName({ kind: "work" }, t)).toBe("已有作品");
    expect(inputName({ kind: "work", workIndex: 2 }, t)).toBe(
      "已有作品 · 第 2 张",
    );
    expect(inputLabel({ kind: "sketch" }, 0, t)).toBe("图1 · 草图");
  });

  it("英文：用户文件名原样，系统来源翻译", async () => {
    await i18n.changeLanguage("en");
    expect(inputName({ kind: "file", fileName: "猫.png" }, t)).toBe("猫.png");
    expect(inputName({ kind: "work", workIndex: 2 }, t)).toBe(
      "Existing work · image 2",
    );
    expect(inputLabel({ kind: "base" }, 1, t)).toBe("Image 2 · Base image");
  });
});

describe("带数值的文案（中文与改造前逐字一致）", () => {
  it("限制数值、计数与连接测试", () => {
    expect(t("bar.uploadDesc", { max: 16 })).toBe(
      "PNG / JPEG / WebP · 连草图最多 16 张",
    );
    expect(t("bar.atMax", { max: 16 })).toBe("已达 16 张输入上限");
    expect(t("params.sizeHint", { long: 3840, short: 2160 })).toBe(
      "宽高须被 16 整除 · 比例 1:3 ～ 3:1 · ≤ 3840 × 2160",
    );
    expect(t("toast.drawLimitCommands", { max: 2000 })).toBe(
      "已达绘制上限（2000 步），请撤销或清空后再继续",
    );
    expect(t("settings.testOkWith", { count: 3 })).toBe(
      "连接成功 · 3 个模型可用 · 含 gpt-image-2.5 系列",
    );
    expect(t("settings.testOkWithout", { count: 1 })).toBe(
      "连接成功 · 1 个模型可用 · 未含 gpt-image-2.5 系列",
    );
    expect(
      t("settings.storageUsed", {
        generations: t("count.generations", { count: 3 }),
        images: t("count.images", { count: 12 }),
        size: "4.2 MB",
      }),
    ).toBe("本地已存 3 次 · 12 张 · 已用 4.2 MB");
    expect(t("history.resultCount", { count: 2, total: 9 })).toBe(
      "2 条结果 · 共 9 条",
    );
    expect(t("confirm.delete.desc", { count: 4 })).toBe(
      "包含 4 张图片，删除后无法恢复。",
    );
  });

  it("英文按单复数选词", async () => {
    await i18n.changeLanguage("en");
    expect(t("count.images", { count: 1 })).toBe("1 image");
    expect(t("count.images", { count: 2 })).toBe("2 images");
    expect(t("count.images", { count: 0 })).toBe("0 images");
    expect(t("history.resultCount", { count: 1, total: 9 })).toBe(
      "1 result · 9 total",
    );
    expect(t("settings.testOkWith", { count: 1 })).toBe(
      "Connected · 1 model available · includes the gpt-image-2.5 series",
    );
    expect(t("confirm.delete.desc", { count: 1 })).toBe(
      "It contains 1 image. This can't be undone.",
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  BASE_LABELS,
  DEFAULT_FORM,
  MAX_MULTI_RATIOS,
  PRESET_RATIOS,
  customOk,
  formSize,
  formSizes,
  isMultiSize,
  missingSizes,
  multiPatch,
  nearestRatio,
  paramsToForm,
  formToParams,
  ratioSize,
  sizeToPreset,
  toggleRatioPatch,
  validateParams,
  withoutMulti,
  type GenForm,
} from "./params";
import { validateSize } from "./size";

describe("formSize", () => {
  it("比例 chip 生效时用基准像素", () => {
    const s = formSize({ ...DEFAULT_FORM, ratio: "16:9" });
    expect(s).toEqual({ w: 1792, h: 1008 });
  });

  it("auto 透传", () => {
    expect(formSize({ ...DEFAULT_FORM, ratio: "auto" })).toBe("auto");
  });

  it("合法自定义优先于比例", () => {
    const s = formSize({
      ...DEFAULT_FORM,
      ratio: "1:1",
      cw: "1280",
      ch: "768",
    });
    expect(s).toEqual({ w: 1280, h: 768 });
  });

  it("非法自定义回退比例（生成入口另行拦截）", () => {
    const s = formSize({
      ...DEFAULT_FORM,
      ratio: "1:1",
      cw: "1000",
      ch: "1000",
    });
    expect(s).toEqual({ w: 1024, h: 1024 });
  });
});

describe("customOk", () => {
  it("空值合法", () => {
    expect(customOk(DEFAULT_FORM)).toBe(true);
  });
  it("非法值被识别", () => {
    expect(customOk({ cw: "1000", ch: "1000" })).toBe(false);
    expect(customOk({ cw: "1024", ch: "" })).toBe(false);
  });
});

describe("基准分辨率", () => {
  it("1K 为基准像素", () => {
    expect(formSize({ ...DEFAULT_FORM, ratio: "3:2", base: "1k" })).toEqual({
      w: 1536,
      h: 1024,
    });
  });

  it("2K 为 1K 的两倍线性尺寸（保持 16 整除）", () => {
    expect(formSize({ ...DEFAULT_FORM, ratio: "3:2", base: "2k" })).toEqual({
      w: 3072,
      h: 2048,
    });
    expect(formSize({ ...DEFAULT_FORM, ratio: "1:1", base: "2k" })).toEqual({
      w: 2048,
      h: 2048,
    });
  });

  it("4K 等比放入 3840 × 2160", () => {
    expect(formSize({ ...DEFAULT_FORM, ratio: "16:9", base: "4k" })).toEqual({
      w: 3840,
      h: 2160,
    });
    const square = formSize({ ...DEFAULT_FORM, ratio: "1:1", base: "4k" });
    expect(square).toEqual({ w: 2160, h: 2160 }); // 正方形被短边限制
    const t = formSize({ ...DEFAULT_FORM, ratio: "3:2", base: "4k" }) as {
      w: number;
      h: number;
    };
    expect(t.w).toBeLessThanOrEqual(3840);
    expect(t.h).toBeLessThanOrEqual(2160);
    expect(t.w % 16).toBe(0);
    expect(t.h % 16).toBe(0);
  });

  it("auto 时基准无效", () => {
    expect(formSize({ ...DEFAULT_FORM, ratio: "auto", base: "4k" })).toBe(
      "auto",
    );
  });

  it("自定义宽高优先于基准", () => {
    expect(
      formSize({
        ...DEFAULT_FORM,
        ratio: "3:2",
        base: "4k",
        cw: "1280",
        ch: "768",
      }),
    ).toEqual({
      w: 1280,
      h: 768,
    });
  });
});

describe("form ↔ params 往返", () => {
  it("自定义尺寸经生成后可完整复用", () => {
    const form: GenForm = {
      ...DEFAULT_FORM,
      prompt: "p",
      model: "sunburst",
      cw: "2560",
      ch: "1440",
      quality: "xhigh",
    };
    const restored = paramsToForm(formToParams(form));
    expect(restored.cw).toBe("2560");
    expect(restored.ch).toBe("1440");
    expect(restored.model).toBe("sunburst");
    expect(restored.quality).toBe("xhigh");
  });

  it("auto 尺寸复用后仍是 auto", () => {
    const restored = paramsToForm(
      formToParams({ ...DEFAULT_FORM, ratio: "auto" }),
    );
    expect(restored.ratio).toBe("auto");
    expect(restored.cw).toBe("");
  });

  it("复用时保留背景、格式、质量和张数", () => {
    const restored = paramsToForm(
      formToParams({
        ...DEFAULT_FORM,
        bg: "transparent",
        fmt: "webp",
        n: 4,
      }),
    );
    expect(restored.bg).toBe("transparent");
    expect(restored.fmt).toBe("webp");
    expect(restored.n).toBe(4);
  });

  it("拒绝带小数的自定义尺寸", () => {
    expect(customOk({ cw: "1024.5", ch: "1024" })).toBe(false);
  });
});

describe("预设比例 × 基准", () => {
  it("21 种组合都是合法尺寸，像素互不相同，可以唯一反推", () => {
    const seen = new Set<string>();
    for (const { id: base } of BASE_LABELS)
      for (const ratio of PRESET_RATIOS) {
        const size = ratioSize(ratio, base);
        expect(validateSize(size.w, size.h), `${ratio} ${base}`).toEqual([]);
        seen.add(`${size.w}x${size.h}`);
        expect(sizeToPreset(size)).toEqual({ ratio, base });
      }
    expect(seen.size).toBe(PRESET_RATIOS.length * BASE_LABELS.length);
  });

  it("不是预设组合的尺寸反推不出", () => {
    expect(sizeToPreset({ w: 1280, h: 768 })).toBeNull();
  });
});

describe("多比例：开关", () => {
  const form = (patch: Partial<GenForm> = {}): GenForm => ({
    ...DEFAULT_FORM,
    ...patch,
  });
  const apply = (f: GenForm, patch: Partial<GenForm>): GenForm => ({
    ...f,
    ...patch,
  });

  it("开启：当前是某个预设比例就保持选中", () => {
    const f = form({ ratio: "16:9", base: "2k" });
    const on = apply(f, multiPatch(f, true));
    expect(on).toMatchObject({ multi: true, ratios: ["16:9"], base: "2k" });
  });

  it("开启：当前是「自动」或自定义宽高，就清空并选中默认比例 3:2", () => {
    const auto = form({ ratio: "auto" });
    expect(apply(auto, multiPatch(auto, true))).toMatchObject({
      multi: true,
      ratios: ["3:2"],
      ratio: "3:2",
    });
    const custom = form({ ratio: "1:1", cw: "1280", ch: "768" });
    expect(apply(custom, multiPatch(custom, true))).toMatchObject({
      multi: true,
      ratios: ["3:2"],
      cw: "",
      ch: "",
    });
  });

  it("关闭：只保留顺序最靠前的比例，回到单选", () => {
    const f = form({ multi: true, ratios: ["16:9", "3:2", "9:16"] });
    const off = apply(f, multiPatch(f, false));
    expect(off).toMatchObject({ multi: false, ratios: [], ratio: "3:2" });
  });

  it("状态没变时没有补丁", () => {
    expect(multiPatch(form(), false)).toEqual({});
    const on = form({ multi: true, ratios: ["1:1"] });
    expect(multiPatch(on, true)).toEqual({});
  });

  it("开关不改张数：关闭后恢复原张数", () => {
    const f = form({ n: 3 });
    const on = apply(f, multiPatch(f, true));
    const two = apply(on, toggleRatioPatch(on, "16:9")!);
    expect(formToParams(two).n).toBe(1);
    expect(formToParams(apply(two, multiPatch(two, false))).n).toBe(3);
  });
});

describe("多比例：点选比例", () => {
  const on = (ratios: GenForm["ratios"]): GenForm => ({
    ...DEFAULT_FORM,
    multi: true,
    ratios,
  });

  it("按 chip 顺序排列，与点选先后无关", () => {
    let f = on(["16:9"]);
    f = { ...f, ...toggleRatioPatch(f, "1:1")! };
    f = { ...f, ...toggleRatioPatch(f, "9:16")! };
    expect(f.ratios).toEqual(["1:1", "16:9", "9:16"]);
  });

  it("至少保留 1 个：取消最后一个不生效", () => {
    expect(toggleRatioPatch(on(["3:2"]), "3:2")).toBeNull();
    expect(toggleRatioPatch(on(["3:2", "1:1"]), "3:2")).toMatchObject({
      ratios: ["1:1"],
    });
  });

  it("最多 4 个：选满后不能再加，但可以取消", () => {
    const full = on(["1:1", "4:3", "3:4", "3:2"]);
    expect(full.ratios).toHaveLength(MAX_MULTI_RATIOS);
    expect(toggleRatioPatch(full, "16:9")).toBeNull();
    expect(toggleRatioPatch(full, "1:1")).toMatchObject({
      ratios: ["4:3", "3:4", "3:2"],
    });
  });
});

describe("多比例：表单 → 参数", () => {
  const multi = (patch: Partial<GenForm> = {}): GenForm => ({
    ...DEFAULT_FORM,
    prompt: "p",
    multi: true,
    ratios: ["1:1", "16:9", "9:16"],
    base: "2k",
    n: 3,
    ...patch,
  });

  it("2 个以上比例：每个比例一个尺寸，n 固定为 1，size 取第一个", () => {
    const params = formToParams(multi());
    expect(params.sizes).toEqual([
      { w: 2048, h: 2048 },
      { w: 3584, h: 2016 },
      { w: 2016, h: 3584 },
    ]);
    expect(params.n).toBe(1);
    expect(params.size).toEqual({ w: 2048, h: 2048 });
  });

  it("只选 1 个比例：与普通单尺寸生成完全一致，张数照常", () => {
    const single = multi({ ratios: ["16:9"], n: 2 });
    expect(isMultiSize(single)).toBe(false);
    expect(formSizes(single)).toBeNull();
    const params = formToParams(single);
    expect(params).toEqual(
      formToParams({
        ...DEFAULT_FORM,
        prompt: "p",
        ratio: "16:9",
        base: "2k",
        n: 2,
      }),
    );
    expect(params.sizes).toBeUndefined();
  });

  it("多比例下自定义宽高与「自动」不参与", () => {
    const f = multi({ cw: "1280", ch: "768", ratio: "auto" });
    expect(formSize(f)).toEqual({ w: 2048, h: 2048 });
    expect(formToParams(f).sizes).toHaveLength(3);
  });

  it("各个尺寸都通过尺寸校验", () => {
    expect(validateParams(formToParams(multi({ base: "4k" })))).toEqual([]);
  });

  it("withoutMulti：退回单选，其余不动；本来就是单选时返回原对象", () => {
    const f = multi();
    expect(withoutMulti(f)).toMatchObject({
      multi: false,
      ratios: [],
      ratio: "1:1",
      base: "2k",
      n: 3,
    });
    expect(formToParams(withoutMulti(f)).sizes).toBeUndefined();
    expect(withoutMulti(DEFAULT_FORM)).toBe(DEFAULT_FORM);
  });
});

describe("复用参数", () => {
  it("多尺寸记录：还原多比例开关、所选比例与基准", () => {
    const f: GenForm = {
      ...DEFAULT_FORM,
      prompt: "p",
      multi: true,
      ratios: ["4:3", "2:3", "16:9"],
      base: "4k",
    };
    const restored = paramsToForm(formToParams(f));
    expect(restored).toMatchObject({
      multi: true,
      ratios: ["4:3", "2:3", "16:9"],
      base: "4k",
      n: 1,
    });
    expect(formToParams(restored)).toEqual(formToParams(f));
  });

  it("多尺寸记录里的尺寸反推不出预设时退回单尺寸，不丢请求参数", () => {
    const restored = paramsToForm({
      ...formToParams({ ...DEFAULT_FORM, prompt: "p" }),
      size: { w: 1280, h: 768 },
      sizes: [
        { w: 1280, h: 768 },
        { w: 1024, h: 1024 },
      ],
    });
    expect(restored).toMatchObject({ multi: false, cw: "1280", ch: "768" });
  });

  it("基准不一致的多尺寸也退回单尺寸", () => {
    const restored = paramsToForm({
      ...formToParams({ ...DEFAULT_FORM, prompt: "p" }),
      sizes: [ratioSize("1:1", "1k"), ratioSize("16:9", "2k")],
    });
    expect(restored.multi).toBe(false);
  });

  it("单尺寸恰好是预设比例 × 基准：还原成比例与基准，而不是自定义宽高", () => {
    const restored = paramsToForm(
      formToParams({ ...DEFAULT_FORM, prompt: "p", ratio: "16:9", base: "2k" }),
    );
    expect(restored).toMatchObject({
      ratio: "16:9",
      base: "2k",
      cw: "",
      ch: "",
    });
  });
});

describe("比例识别", () => {
  it("接近预设比例的尺寸认作该比例；不能靠约分", () => {
    // 1360 × 1024 约分是 85:64，4K 的 3:2 是 3248 × 2160（203:135）
    expect(nearestRatio(1360, 1024)).toBe("4:3");
    expect(nearestRatio(3248, 2160)).toBe("3:2");
    expect(nearestRatio(1792, 1008)).toBe("16:9");
    expect(nearestRatio(1008, 1792)).toBe("9:16");
    expect(nearestRatio(1000, 1010)).toBe("1:1");
  });

  it("都不接近时认不出", () => {
    expect(nearestRatio(2000, 1000)).toBeNull();
    expect(nearestRatio(0, 100)).toBeNull();
  });
});

describe("未生成的尺寸", () => {
  const a = ratioSize("1:1", "1k");
  const b = ratioSize("16:9", "1k");
  const c = ratioSize("9:16", "1k");

  it("全部有图时没有缺失", () => {
    expect(missingSizes([a, b, c], [c, a, b])).toEqual([]);
  });

  it("按像素精确匹配，缺哪个报哪个", () => {
    expect(missingSizes([a, b, c], [a, c])).toEqual([b]);
    expect(missingSizes([a, b, c], [b])).toEqual([a, c]);
  });

  it("服务端返回的尺寸与请求略有不同时按比例就近匹配，每张图只用一次", () => {
    expect(missingSizes([a, b], [{ w: 1000, h: 1000 }])).toEqual([b]);
    expect(missingSizes([a, a], [a])).toEqual([a]);
  });
});

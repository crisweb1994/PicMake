/** 草稿附件的展示投影：缩略图 URL、编号标签、草图标记与 ✎ 入口角色 */
import { useMemo } from "react";
import type { InputImage } from "../lib/types";
import { inputDisplay, type DisplayInput } from "../lib/view-models";
import { useImageAssets } from "./useImageAssets";

export function useDraftImages(
  inputs: InputImage[],
  hasInpaint: boolean,
): DisplayInput[] {
  const uploads = useMemo(
    () => inputs.flatMap((input) => (input.upload ? [input.upload] : [])),
    [inputs],
  );
  const { assets } = useImageAssets(
    inputs.map((input) => input.imageId),
    uploads,
  );
  return inputs.map((input, index) => ({
    id: input.imageId,
    ...inputDisplay(input.name, index),
    url: assets[input.imageId]?.url,
    isSketch: !!input.upload?.sketch,
    // ✎ 入口角色：底图=修改选区；重绘中参考图停用；普通图可发起
    inpaintRole: hasInpaint ? (index === 0 ? "mask" : "ref") : "candidate",
  }));
}

/** 草稿附件的展示投影：缩略图 URL、名字种类、草图标记与 ✎ 入口角色 */
import { useMemo } from "react";
import type { InputImage } from "../lib/types";
import {
  inputNaming,
  workIndexOf,
  type DisplayInput,
} from "../lib/view-models";
import { useWorkspace } from "../store/workspace";
import { selectRows } from "../store/workspace/selectors";
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
  const rows = useWorkspace(selectRows);
  return inputs.map((input, index) => {
    const isSketch = !!input.upload?.sketch;
    return {
      id: input.imageId,
      index,
      // 重绘时 inputs[0] 恒为底图
      naming: inputNaming(input, {
        sketch: isSketch,
        base: hasInpaint && index === 0,
        workIndex: workIndexOf(rows, input.generationId, input.imageId),
      }),
      url: assets[input.imageId]?.url,
      isSketch,
      // ✎ 入口角色：底图=修改选区；重绘中参考图停用；普通图可发起
      inpaintRole: hasInpaint ? (index === 0 ? "mask" : "ref") : "candidate",
    };
  });
}

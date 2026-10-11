/** 草稿流程：上传读取、移除图片与选区（提示在这里发） */
import { toast } from "@heroui/react";
import { readInputImage } from "../lib/input-images";
import { ApiError, ERROR_HINTS, type InputImage } from "../lib/types";
import { useWorkspace } from "../store/workspace";
import {
  beginRead,
  finishRead,
  removeDraftInput,
  removeDraftMask,
} from "../store/workspace/actions";

const currentReadId = () => useWorkspace.getState().draft.readId;

/** 上传：逐个读取（只在内存，不写库）；上一批没读完时忽略，批次被打断就丢弃结果 */
export async function addFiles(files: File[]) {
  if (!files.length || currentReadId() !== null) return;
  const readId = crypto.randomUUID();
  beginRead(readId);
  const added: InputImage[] = [];
  const errors: string[] = [];
  for (const file of files) {
    if (currentReadId() !== readId) return;
    try {
      const image = await readInputImage(file);
      added.push({ imageId: image.id, name: file.name, upload: image });
    } catch (error) {
      errors.push(
        `${file.name}：${error instanceof ApiError ? error.message : ERROR_HINTS["invalid-image"]}`,
      );
    }
  }
  finishRead(readId, added, errors);
}

export function removeInput(id: string) {
  toast(
    removeDraftInput(id) === "base-and-mask"
      ? "已移除底图与选区，剩余图片重新编号，请检查描述"
      : "图片编号已更新，请检查描述中的图序号",
  );
}

export function removeMask() {
  removeDraftMask();
  toast("已移除选区：保留底图与描述，切换为普通图片编辑");
}

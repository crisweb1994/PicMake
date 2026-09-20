/** 编辑草稿：来源与保真度；开始/结束时的页面联动由编排层负责。 */
import { useState } from "react";
import type { EditDraft, InputFidelity } from "../lib/types";

export function useEdit() {
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

  const start = (source: EditDraft["source"]) => {
    setEditDraft({ source, inputFidelity: "low" });
  };

  const setInputFidelity = (inputFidelity: InputFidelity) => {
    setEditDraft((draft) => (draft ? { ...draft, inputFidelity } : null));
  };

  return {
    editDraft,
    start,
    close: () => setEditDraft(null),
    setInputFidelity,
  };
}

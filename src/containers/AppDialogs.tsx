/** 全局确认框与保存中提示 */
import { ConfirmDialog } from "../components/overlays/ConfirmDialog";
import { useWorkspace } from "../store/workspace";
import { closeConfirm } from "../store/workspace/actions";

export function AppDialogs() {
  const confirm = useWorkspace((s) => s.confirm);
  const saving = useWorkspace((s) => s.run.phase === "saving");

  return (
    <>
      <ConfirmDialog state={confirm} onCancel={closeConfirm} />
      {saving && (
        <p className="pm-saving" role="status">
          正在保存到本地…
        </p>
      )}
    </>
  );
}

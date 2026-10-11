/** 通用确认：纯展示的受控弹层 */
import {
  Button,
  Modal,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
} from "@heroui/react";
import type { ConfirmState } from "../../lib/view-models";

/* ── 通用确认 ── */
export function ConfirmDialog(props: {
  state: ConfirmState | null;
  onCancel: () => void;
}) {
  return (
    <Modal
      isOpen={props.state != null}
      onOpenChange={(open) => {
        if (!open) props.onCancel();
      }}
    >
      <ModalBackdrop className="pm-confirm" isKeyboardDismissDisabled>
        <ModalContainer placement="center">
          <ModalDialog
            role="alertdialog"
            aria-label={props.state?.title ?? "确认"}
            className="pm-modal"
          >
            <h3>{props.state?.title}</h3>
            <p className="sub">{props.state?.desc}</p>
            <div className="pm-mbtns">
              <Button variant="secondary" onPress={props.onCancel}>
                {props.state?.cancelLabel ?? "取消"}
              </Button>
              <Button
                variant="primary"
                onPress={() => {
                  const ok = props.state?.onOk;
                  props.onCancel();
                  ok?.();
                }}
              >
                {props.state?.okLabel ?? "继续"}
              </Button>
            </div>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}

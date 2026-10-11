/** 输入图片预览：纯展示的受控弹层 */
import { useState } from "react";
import {
  Button,
  Modal,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
} from "@heroui/react";
import type { DisplayInput } from "../../lib/view-models";

/** 输入预览；草图额外提供「继续画这张草图」 */
export function InputPreview(props: {
  image: DisplayInput | null;
  onContinueSketch?: () => void;
  onClose: () => void;
}) {
  const [size, setSize] = useState("");
  return (
    <Modal
      isOpen={!!props.image}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <ModalBackdrop isKeyboardDismissDisabled>
        <ModalContainer placement="center">
          <ModalDialog className="pm-input-preview" aria-label="输入图片预览">
            <h3>{props.image?.label}</h3>
            <img
              src={props.image?.url}
              alt={props.image?.name ?? "输入图片"}
              onLoad={(event) =>
                setSize(
                  `${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight}`,
                )
              }
            />
            <p>{size}</p>
            {props.image?.isSketch && props.onContinueSketch && (
              <Button
                variant="primary"
                onPress={props.onContinueSketch}
                className="pm-input-preview-continue"
              >
                继续画这张草图
              </Button>
            )}
            <Button variant="secondary" onPress={props.onClose}>
              关闭预览
            </Button>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}

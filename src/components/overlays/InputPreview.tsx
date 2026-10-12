/** 输入图片预览：纯展示的受控弹层 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Modal,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
} from "@heroui/react";
import { inputLabel, inputName } from "../../i18n/labels";
import type { DisplayInput } from "../../lib/view-models";

/** 输入预览；草图额外提供「继续画这张草图」 */
export function InputPreview(props: {
  image: DisplayInput | null;
  onContinueSketch?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
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
          <ModalDialog
            className="pm-input-preview"
            aria-label={t("input.previewLabel")}
          >
            <h3>
              {props.image &&
                inputLabel(props.image.naming, props.image.index, t)}
            </h3>
            <img
              src={props.image?.url}
              alt={
                props.image
                  ? inputName(props.image.naming, t)
                  : t("input.fallbackAlt")
              }
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
                {t("input.continueSketch")}
              </Button>
            )}
            <Button variant="secondary" onPress={props.onClose}>
              {t("input.closePreview")}
            </Button>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}

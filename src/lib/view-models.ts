import type { HistoryRow } from "../db/schema";
import type { ApiErrorKind } from "./types";

export interface DisplayImage {
  id: string;
  url: string;
}

export interface DisplayGen {
  row: HistoryRow;
  images: DisplayImage[];
}

export interface ErrorState {
  kind: ApiErrorKind;
  title: string;
  message: string;
}

export interface ConfirmState {
  title: string;
  desc: string;
  onOk: () => void;
}

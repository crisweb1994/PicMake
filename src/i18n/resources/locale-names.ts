import type { Locale } from "../../lib/locale";

/** 语言的自称：每种语言用自己的文字书写，不随界面语言翻译（业内惯例，选错语言时也能认出来） */
export const LOCALE_NAMES: Record<Locale, string> = {
  "zh-CN": "简体中文",
  en: "English",
};

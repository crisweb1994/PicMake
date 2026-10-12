import { en } from "./en";
import { zhCN } from "./zh-CN";

/** 资源结构：由源语言推出，其他语言必须与它同构（缺 key、多 key、嵌套不一致都会编译失败） */
type Shape<T> = { [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };
export type LocaleResource = Shape<typeof zhCN>;

/** 各语言的翻译资源；新增语言：补一份同构文件，加进这里和 lib/locale.ts 的 LOCALES */
export const resources = {
  "zh-CN": { translation: zhCN },
  en: { translation: en },
} as const;

export type TranslationResource = typeof zhCN;

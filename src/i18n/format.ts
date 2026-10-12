/** 依赖当前语言的格式化。调用方（组件）须同时订阅语言变化（useTranslation），否则切换语言后不会重算。 */
import type { i18n as I18n } from "i18next";
import { SOURCE_LOCALE, type Locale } from "../lib/locale";

/** 同年显示「月日」：各语言都用短月份（中文 10月12日、英文 Oct 12） */
const MONTH_DAY: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
};

/** 跨年显示完整日期；各语言的习惯写法不同（中文 2025/10/12、英文 Oct 12, 2025） */
const FULL_DATE: Record<Locale, Intl.DateTimeFormatOptions> = {
  "zh-CN": { year: "numeric", month: "numeric", day: "numeric" },
  en: { year: "numeric", month: "short", day: "numeric" },
};

const pad = (n: number) => String(n).padStart(2, "0");

/** 记录时间：1 分钟内 / 今天 / 同年 / 跨年；时分固定 24 小时制，各语言一致 */
export function fmtTime(
  ts: number,
  i18n: Pick<I18n, "t" | "language">,
  now = Date.now(),
): string {
  const language = (
    i18n.language in FULL_DATE ? i18n.language : SOURCE_LOCALE
  ) as Locale;
  const d = new Date(ts);
  const current = new Date(now);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (now - ts < 60_000) return i18n.t("time.justNow");
  if (d.toDateString() === current.toDateString())
    return i18n.t("time.today", { time });
  if (d.getFullYear() === current.getFullYear())
    return i18n.t("time.dateTime", {
      date: new Intl.DateTimeFormat(language, MONTH_DAY).format(d),
      time,
    });
  return new Intl.DateTimeFormat(language, FULL_DATE[language]).format(d);
}

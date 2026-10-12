/** vitest 全局准备：flows / store 的测试要用 t()，统一用源语言初始化，断言沿用中文原文 */
import { SOURCE_LOCALE } from "../lib/locale";
import { initI18n } from "./index";

initI18n(SOURCE_LOCALE);

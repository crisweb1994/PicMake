/** 历史列表订阅：IndexedDB 变更经 liveQuery 回推到 store；出错只提示，保留已加载的数据 */
import { liveQuery } from "dexie";
import { toast } from "@heroui/react";
import { db, ensurePersistentStorage, type HistoryRow } from "../db/schema";
import { t } from "../i18n";
import { kindMessage } from "../i18n/errors";
import { rowsLoaded } from "../store/workspace/actions";

/** 订阅源的最小接口，测试可替换 */
export interface RowsObservable {
  subscribe(observer: {
    next: (rows: HistoryRow[]) => void;
    error: (error: unknown) => void;
  }): { unsubscribe(): void };
}

/** 全部记录，按创建时间倒序 */
export const observeHistory = (): RowsObservable =>
  liveQuery(() => db.history.orderBy("createdAt").reverse().toArray());

/** App 挂载时启动，返回值作为 effect 的 cleanup 退订（StrictMode 下重复订阅安全） */
export function startHistorySync(
  observe: () => RowsObservable = observeHistory,
): () => void {
  void ensurePersistentStorage();
  const subscription = observe().subscribe({
    next: rowsLoaded,
    error: () => toast(kindMessage("history-unavailable", t)),
  });
  return () => subscription.unsubscribe();
}

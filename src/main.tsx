import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toast } from "@heroui/react";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    {/* toast() 只负责入队，必须挂这个区域才会显示。顶部居中避开左上导航、右上详情浮卡和底部创作条；
        hotkey 置空：不提供应用快捷键，且 macOS 上 Option+T 用于输入字符 */}
    <Toast.Provider placement="top" hotkey={[]} />
  </StrictMode>,
);

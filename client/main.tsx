import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import "@/app/globals.css";
import { applyStoredAppTheme } from "@/lib/app-theme";
import { getPlatformCapabilities } from "@/lib/platform/capabilities";
import { clientRouter } from "./router";

applyStoredAppTheme(localStorage);
const runtime = getPlatformCapabilities().runtime;
if (runtime.native && runtime.platform === "android") {
  document.documentElement.dataset.nativeInsets = "system-bars";
}

const root = document.getElementById("root");
if (!root) throw new Error("没有找到客户端挂载节点");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <RouterProvider router={clientRouter} />
  </React.StrictMode>,
);

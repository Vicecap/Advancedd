import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installCsrfFetch } from "./lib/csrf-fetch";

installCsrfFetch();

const BASE = import.meta.env.BASE_URL ?? "/";

function reportError(message: string, stack?: string) {
  if (localStorage.getItem("admin_error_logging") === "false") return;
  try {
    fetch(`${BASE}api/errors/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        message: String(message).slice(0, 2000),
        stack: stack ? String(stack).slice(0, 5000) : undefined,
        url: window.location.href,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

window.addEventListener("error", (e) => {
  if (e.message && !e.message.includes("ResizeObserver")) {
    reportError(e.message, e.error?.stack);
  }
});

window.addEventListener("unhandledrejection", (e) => {
  const msg = e.reason?.message ?? String(e.reason) ?? "Unhandled promise rejection";
  if (!msg.includes("ResizeObserver")) {
    reportError(msg, e.reason?.stack);
  }
});

createRoot(document.getElementById("root")!).render(<App />);

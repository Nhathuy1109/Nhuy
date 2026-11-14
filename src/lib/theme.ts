import { useSyncExternalStore } from "react";

export type ThemePref = "auto" | "light" | "dark";

export const THEME_KEY = "library-theme";

const listeners = new Set<() => void>();

function readPref(): ThemePref {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "auto";
  } catch {
    return "auto";
  }
}

function systemDark(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(pref: ThemePref): void {
  const dark = pref === "dark" || (pref === "auto" && systemDark());
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#151b25" : "#f6f3ea");
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === "auto") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* ignore: vẫn áp dụng cho phiên hiện tại */
  }
  applyTheme(pref);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
  const onSystem = () => {
    if (readPref() === "auto") applyTheme("auto");
  };
  media?.addEventListener("change", onSystem);
  return () => {
    listeners.delete(listener);
    media?.removeEventListener("change", onSystem);
  };
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, readPref, () => "auto" as ThemePref);
}

/** Chạy trước khi vẽ trang để không bị chớp sáng khi mở ở chế độ tối. */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_KEY}');var d=p==='dark'||(p!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',d?'#151b25':'#f6f3ea');}catch(e){}})();`;

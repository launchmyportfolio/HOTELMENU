import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function AppShell({ children }) {
  const location = useLocation();

  useEffect(() => {
    const root = document.documentElement;
    const nav = document.querySelector(".nav");
    const footer = document.querySelector(".footer");

    const updateLayoutOffsets = () => {
      const headerHeight = Math.round(nav?.getBoundingClientRect().height || 70);
      const footerHeight = Math.round(footer?.getBoundingClientRect().height || 72);

      root.style.setProperty("--app-header-height", `${headerHeight}px`);
      root.style.setProperty("--app-footer-height", `${footerHeight}px`);
    };

    updateLayoutOffsets();

    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(updateLayoutOffsets)
      : null;

    if (resizeObserver) {
      if (nav) resizeObserver.observe(nav);
      if (footer) resizeObserver.observe(footer);
    }

    window.addEventListener("resize", updateLayoutOffsets);

    return () => {
      window.removeEventListener("resize", updateLayoutOffsets);
      resizeObserver?.disconnect();
    };
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <main className="app-shell__main">
        {children}
      </main>
    </div>
  );
}

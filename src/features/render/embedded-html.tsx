"use client";

import { useRef, useEffect, type ReactNode } from "react";

interface EmbeddedHtmlProps {
  html: string;
  fallback?: ReactNode;
}

export function EmbeddedHtml({ html, fallback }: EmbeddedHtmlProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Set innerHTML — scripts in innerHTML don't execute automatically
    el.innerHTML = html;

    // Manually execute <script> tags
    const scripts = el.querySelectorAll<HTMLScriptElement>("script");
    scripts.forEach((oldScript) => {
      const newScript = document.createElement("script");
      for (const attr of oldScript.attributes) {
        newScript.setAttribute(attr.name, attr.value);
      }
      newScript.textContent = oldScript.textContent;
      oldScript.parentNode?.replaceChild(newScript, oldScript);
    });
  }, [html]);

  if (!html && fallback) return <>{fallback}</>;

  return <div ref={ref} />;
}

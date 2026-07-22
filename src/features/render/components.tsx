import type { ReactNode } from "react";

export interface CalloutProps {
  variant?: "info" | "warning" | "error";
  title?: string;
  children: ReactNode;
}

const VARIANT_STYLES: Record<string, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-900",
};

const VARIANT_LABELS: Record<string, string> = {
  info: "Info",
  warning: "Warning",
  error: "Error",
};

export function Callout({ variant = "info", title, children }: CalloutProps) {
  return (
    <div className={`border-l-4 rounded-none p-4 my-4 ${VARIANT_STYLES[variant]}`}>
      <p className="font-semibold mb-1">{title ?? VARIANT_LABELS[variant]}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export function EmbeddedHtml({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

export function CodeBlock({ code, language }: { code: string; language?: string }) {
  return (
    <pre className="text-sm overflow-x-auto" data-language={language}>
      <code>{code}</code>
    </pre>
  );
}

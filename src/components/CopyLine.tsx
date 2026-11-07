"use client";

import { useRef, useState } from "react";

export function CopyLine({ text }: { text: string }) {
  const ref = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      if (ref.current) {
        const r = document.createRange();
        r.selectNodeContents(ref.current);
        const s = window.getSelection();
        s?.removeAllRanges();
        s?.addRange(r);
      }
    }
  }
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      <code ref={ref} className="select-all font-mono text-[0.8rem] [overflow-wrap:anywhere]">{text}</code>
      <button type="button" className="btn btn-quiet btn-sm" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
    </span>
  );
}

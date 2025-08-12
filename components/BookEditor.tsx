"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import MarkdownPreview from "@uiw/react-markdown-preview";

const Monaco = dynamic(() => import("@monaco-editor/react"), { ssr: false });

export default function BookEditor({
  initial,
  onSave,
}: { initial: string; onSave: (md: string) => void }) {
  const [val, setVal] = useState(initial || "");
  const [split, setSplit] = useState(56);
  const drag = useRef(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.current) return;
      const vw = Math.max(1, window.innerWidth);
      const pct = Math.min(76, Math.max(34, (e.clientX / vw) * 100));
      setSplit(pct);
    };
    const onUp = () => (drag.current = false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const cols = `${split}% 12px ${100 - split}%`;
  const preview = useMemo(() => val, [val]);

  return (
    <>
      <div className="card-head" style={{ position: "sticky", top: 0, zIndex: 10 }}>
        <div><strong>Editor</strong> <span className="muted">Split preview • book layout</span></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-ghost" onClick={() => onSave(val)}>
            Save
          </button>
        </div>
      </div>

      <div className="editor-layout" style={{ gridTemplateColumns: cols }}>
        <div className="preview-wrap">
          <div className="book-shell">
            <div className="book">
              <section className="page">
                <MarkdownPreview source={preview} />
              </section>
              <section className="page">
                <MarkdownPreview source={preview} />
              </section>
            </div>
          </div>
        </div>
        <div
          className="drag-handle"
          onMouseDown={(e) => { e.preventDefault(); drag.current = true; }}
        />
        <div className="editor-pane">
          <Monaco
            height="100%"
            defaultLanguage="markdown"
            theme="vs-dark"
            value={val}
            onChange={(v) => setVal(v ?? "")}
            options={{ minimap: { enabled: false }, wordWrap: "on", smoothScrolling: true }}
          />
        </div>
      </div>
    </>
  );
}

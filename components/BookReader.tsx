"use client";
import MarkdownPreview from "@uiw/react-markdown-preview";

export default function BookReader({ md, title }: { md: string; title: string }) {
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="card-head" style={{ position: "sticky", top: 0 }}>
        <div><strong>Reading:</strong> {title}</div>
      </div>
      <div className="book-shell" style={{ height: "calc(100vh - 52px)" }}>
        <div className="book">
          <section className="page"><MarkdownPreview source={md} /></section>
          <section className="page"><MarkdownPreview source={md} /></section>
        </div>
      </div>
    </div>
  );
}

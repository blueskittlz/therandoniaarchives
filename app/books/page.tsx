"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase/client.ts";

type Book = { id:number; name:string; author:string; summary:string|null; version:number; created_at:string };

export default function BooksPage(){
  const [q,setQ]=useState("");
  const [books,setBooks]=useState<Book[]>([]);
  const [error,setError]=useState<string|null>(null);

  async function load() {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) { setError("Login required."); setBooks([]); return; }

    let query = supabase.from("books").select("id,name,author,summary,version,created_at").order("created_at",{ascending:false});
    if(q.trim()) query = query.ilike("name",`%${q.trim()}%`);
    const { data, error } = await query;
    if(error) setError(error.message); else setBooks((data||[]) as Book[]);
  }
  useEffect(()=>{ load(); },[]);

  return (
    <div className="container">
      <div className="card">
        <div className="card-head">
          <div><strong>Library</strong> <span className="muted">Search, read, write.</span></div>
          <div style={{display:"flex",gap:8}}>
            <input className="input" placeholder="Search by title…" value={q} onChange={e=>setQ(e.target.value)} />
            <button className="btn-ghost" onClick={load}>Go</button>
            <Link href="/books/new" className="btn">New</Link>
          </div>
        </div>

        <div className="card-body" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14}}>
          {books.map(b=>(
            <div key={b.id} className="card" style={{padding:14}}>
              <div style={{fontWeight:800}}>{b.name}</div>
              <div className="muted">by {b.author}</div>
              <div className="muted">{b.summary || "No summary yet."}</div>
              <div style={{display:"flex",gap:8,marginTop:10}}>
                <Link className="btn-ghost" href={`/books/${b.id}`}>Read</Link>
                <Link className="btn-ghost" href={`/books/${b.id}/edit`}>Edit</Link>
              </div>
            </div>
          ))}
          {!books.length && !error && <div className="muted">No books yet</div>}
          {error && <div style={{color:"var(--danger)"}}>{error}</div>}
        </div>
      </div>
    </div>
  );
}

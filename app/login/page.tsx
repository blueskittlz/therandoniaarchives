"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client.ts";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function signin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setErr(error.message);
    router.push("/books");
  }

  async function signup() {
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) return setErr(error.message);
    router.push("/books");
  }

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 480, margin: "0 auto" }}>
        <div className="card-head" style={{ justifyContent: "center" }}>
          <div style={{ fontWeight: 900, fontSize: 24 }}>Realm Library</div>
        </div>
        <div className="card-body">
          <form onSubmit={signin} style={{ display: "grid", gap: 10 }}>
            <input className="input" type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required />
            <input className="input" type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} required />
            {err && <div className="muted" style={{ color: "var(--danger)" }}>{err}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" disabled={busy} type="submit">Login</button>
              <button className="btn-ghost" disabled={busy} type="button" onClick={signup}>Sign up</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

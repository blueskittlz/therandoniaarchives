import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase"; // <- your Supabase client init file

interface User {
  id: string;
  username: string;
  role: "admin" | "author" | "member";
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
}

const SESSION_MAX_MS = 1000 * 60 * 60 * 24 * 3; // 3 days
const SESSION_TS_KEY = "randonia:lastLoginAt";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const getProfile = async (uid: string, email: string) => {
    if (!supabase) throw new Error("Supabase not configured");

    try {
      const { data: existing, error: selectError } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", uid)
        .maybeSingle();

      if (selectError) {
        setUser({ id: uid, username: email || "Unknown", role: "member" });
        return;
      }

      if (!existing) {
        // No profile row visible/available due to RLS or absence; fall back to member locally
        setUser({ id: uid, username: email || "Unknown", role: "member" });
        return;
      }

      setUser({ id: uid, username: email || "Unknown", role: existing.role });
    } catch {
      setUser({ id: uid, username: email || "Unknown", role: "member" });
    }
  };

  // Enforce 3-day soft expiry: if older than 3 days, sign out on startup and when timer elapses
  const enforceExpiry = async (loginAtMs?: number | null) => {
    const now = Date.now();
    const last = typeof loginAtMs === "number" ? loginAtMs : Number(localStorage.getItem(SESSION_TS_KEY) || 0);
    if (last && now - last > SESSION_MAX_MS) {
      await supabase?.auth.signOut();
      localStorage.removeItem(SESSION_TS_KEY);
      setUser(null);
    } else if (last) {
      const remaining = SESSION_MAX_MS - (now - last);
      window.setTimeout(async () => {
        await supabase?.auth.signOut();
        localStorage.removeItem(SESSION_TS_KEY);
        setUser(null);
      }, Math.max(remaining, 0));
    }
  };

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data.session;
        if (session?.user) {
          await getProfile(session.user.id, session.user.email || "");
          enforceExpiry(null);
        }
      } catch {
        // ignore and proceed to login screen
      } finally {
        setLoading(false);
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await getProfile(session.user.id, session.user.email || "");
      } else {
        setUser(null);
      }
    });

    // Refresh profile on tab focus
    const onFocus = () => {
      supabase.auth.getSession().then(({ data }) => {
        const s = data.session;
        if (s?.user) getProfile(s.user.id, s.user.email || "").catch(() => undefined);
      });
    };
    window.addEventListener("focus", onFocus);

    return () => {
      listener.subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const signUp = async (email: string, password: string) => {
    if (!supabase) throw new Error("Supabase not configured");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    if (error) throw error;

    const newUserId = data.user?.id;
    if (newUserId) {
      // Rely on first authenticated session to load profile (or fall back to member)
      if (data.session) {
        localStorage.setItem(SESSION_TS_KEY, String(Date.now()));
        await getProfile(newUserId, data.user?.email || "");
        enforceExpiry(Date.now());
      }
    }
  };

  const login = async (email: string, password: string) => {
    if (!supabase) throw new Error("Supabase not configured");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) {
      localStorage.setItem(SESSION_TS_KEY, String(Date.now()));
      await getProfile(data.user.id, data.user.email || "");
      enforceExpiry(Date.now());
    }
  };

  const logout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    localStorage.removeItem(SESSION_TS_KEY);
    setUser(null);
  };

  const value = useMemo(() => ({ user, loading, login, logout, signUp }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

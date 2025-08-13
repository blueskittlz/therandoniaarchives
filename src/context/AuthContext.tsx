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
        setUser({ id: uid, username: email || "Unknown", role: "member" });
        return;
      }

      setUser({ id: uid, username: email || "Unknown", role: existing.role });
    } catch {
      setUser({ id: uid, username: email || "Unknown", role: "member" });
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
          // set a minimal user immediately; refine after profile fetch
          setUser({ id: session.user.id, username: session.user.email || "Unknown", role: "member" });
          getProfile(session.user.id, session.user.email || "").catch(() => undefined);
        }
      } catch {
        // ignore and proceed to login screen
      } finally {
        setLoading(false);
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        // set a minimal user immediately; refine after profile fetch
        setUser({ id: session.user.id, username: session.user.email || "Unknown", role: "member" });
        getProfile(session.user.id, session.user.email || "").catch(() => undefined);
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
    if (newUserId && data.session) {
      // set minimal user now; refine later
      setUser({ id: newUserId, username: data.user?.email || "Unknown", role: "member" });
      getProfile(newUserId, data.user?.email || "").catch(() => undefined);
    }
  };

  const login = async (email: string, password: string) => {
    if (!supabase) throw new Error("Supabase not configured");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) {
      // set minimal user now; refine later
      setUser({ id: data.user.id, username: data.user.email || "Unknown", role: "member" });
      getProfile(data.user.id, data.user.email || "").catch(() => undefined);
    }
  };

  const logout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
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

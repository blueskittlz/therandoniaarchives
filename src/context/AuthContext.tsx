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
        // No profile row visible/available due to RLS or absence; fall back to member locally
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

    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      if (session?.user) {
        getProfile(session.user.id, session.user.email || "").catch(() => {
          setUser({ id: session.user!.id, username: session.user!.email || "Unknown", role: "member" });
        });
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        getProfile(session.user.id, session.user.email || "").catch(() => {
          setUser({ id: session.user!.id, username: session.user!.email || "Unknown", role: "member" });
        });
      } else {
        setUser(null);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
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
        await getProfile(newUserId, data.user?.email || "");
      }
    }
  };

  const login = async (email: string, password: string) => {
    if (!supabase) throw new Error("Supabase not configured");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) {
      await getProfile(data.user.id, data.user.email || "");
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

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

    // Try to read existing profile
    const { data: existing, error: selectError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", uid)
      .maybeSingle();

    if (selectError) throw selectError;

    // If profile is missing, attempt to create a default one for the current user
    if (!existing) {
      const { data: created, error: upsertError } = await supabase
        .from("profiles")
        .upsert({ id: uid, role: "member" }, { onConflict: "id" })
        .select("id, role")
        .single();

      if (upsertError) {
        // eslint-disable-next-line no-console
        console.warn("Profile upsert failed (RLS may block before first login confirm):", upsertError.message);
        // Fallback to local user with default role so app works even if profile row missing
        setUser({ id: uid, username: email || "Unknown", role: "member" });
        return;
      }

      setUser({ id: uid, username: email || "Unknown", role: created.role });
      return;
    }

    setUser({ id: uid, username: email || "Unknown", role: existing.role });
  };

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      if (session?.user) {
        getProfile(session.user.id, session.user.email || "").catch(console.error);
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        getProfile(session.user.id, session.user.email || "").catch(console.error);
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
      // Try to create profile if a session exists; otherwise first login will create it
      if (data.session) {
        const { error: profileError } = await supabase
          .from("profiles")
          .upsert({ id: newUserId, role: "member" }, { onConflict: "id" });
        if (profileError) {
          // eslint-disable-next-line no-console
          console.warn("Failed to upsert profile on sign-up:", profileError.message);
        }
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

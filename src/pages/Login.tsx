import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await login(email.trim(), password);
      toast({ title: "Welcome back", description: `Logged in as ${email}` });
      navigate("/archive", { replace: true });
    } catch (err: any) {
      toast({ title: "Login failed", description: err?.message ?? "Unknown error" });
    } finally {
      setLoading(false);
    }
  };

  const supabaseMissing = !supabase;

  return (
    <div className="min-h-screen bg-background relative">
      <Helmet>
        <title>Login | Randonia Book Archive</title>
        <meta name="description" content="Login to Randonia's simple Minecraft book backup." />
        <link rel="canonical" href="/login" />
      </Helmet>

      <div className="absolute inset-0 pixel-grid opacity-60 pointer-events-none" aria-hidden="true" />

      <main className="container flex min-h-screen items-center justify-center">
        <h1 className="sr-only">Login to Randonia Book Archive</h1>
        <div className="w-full max-w-md">
          <Card className="shadow-xl">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold">Randonia Book Archive</CardTitle>
              <p className="text-sm text-muted-foreground">Safe, simple backups for our realm books.</p>
            </CardHeader>
            <CardContent>
              {supabaseMissing ? (
                <div className="space-y-2 text-center">
                  <p className="text-sm text-muted-foreground">
                    Supabase is not configured. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in a <code>.env</code> file and restart the server.
                  </p>
                </div>
              ) : (
                <form onSubmit={onSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
                  </div>
                  <Button type="submit" variant="hero" className="w-full" disabled={loading}>
                    {loading ? "Logging in..." : "Login"}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">No account? Ask a Randonia admin.</p>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Login;

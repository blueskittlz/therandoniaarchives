import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

const SignUp = () => {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: "Passwords do not match", description: "Please re-enter your password." });
      return;
    }
    try {
      setLoading(true);
      await signUp(email.trim(), password);
      toast({ title: "Check your email", description: "We sent a confirmation link. After confirming, return to login." });
      navigate("/login", { replace: true });
    } catch (err: any) {
      toast({ title: "Sign up failed", description: err?.message ?? "Unknown error" });
    } finally {
      setLoading(false);
    }
  };

  const supabaseMissing = !supabase;

  return (
    <div className="min-h-screen bg-background relative">
      <Helmet>
        <title>Sign Up | Randonia Book Archive</title>
        <meta name="description" content="Create an account for Randonia's book archive." />
        <link rel="canonical" href="/signup" />
      </Helmet>

      <div className="absolute inset-0 pixel-grid opacity-60 pointer-events-none" aria-hidden="true" />

      <main className="container flex min-h-screen items-center justify-center">
        <h1 className="sr-only">Create your account</h1>
        <div className="w-full max-w-md">
          <Card className="shadow-xl">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold">Create account</CardTitle>
              <p className="text-sm text-muted-foreground">Join the Randonia Book Archive.</p>
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
                    <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm">Confirm password</Label>
                    <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" required />
                  </div>
                  <Button type="submit" variant="hero" className="w-full" disabled={loading}>
                    {loading ? "Creating account..." : "Create account"}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Already have an account? <Link to="/login" className="underline">Log in</Link>.
                  </p>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default SignUp; 
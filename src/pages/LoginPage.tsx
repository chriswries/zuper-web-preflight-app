import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { AlertCircle } from "lucide-react";

export default function LoginPage() {
  const { user, loading, signIn, signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signUpSuccess, setSignUpSuccess] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);

  const validateDomain = (emailValue: string) => {
    if (isSignUp && emailValue && !emailValue.toLowerCase().endsWith("@zuper.co")) {
      setDomainError("Only @zuper.co email addresses can self-register. Contact an admin for an invitation.");
    } else {
      setDomainError(null);
    }
  };

  if (!loading && user) {
    return <Navigate to="/pages" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (isSignUp) {
        // Double-check domain restriction
        if (!email.toLowerCase().endsWith("@zuper.co")) {
          setDomainError("Only @zuper.co email addresses can self-register. Contact an admin for an invitation.");
          // Log rejection
          try {
            const domain = email.split("@")[1] || "unknown";
            await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/log-signup-rejection`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email_domain: domain }),
            });
          } catch { /* best-effort */ }
          return;
        }
        const { error } = await signUp(email, password, displayName);
        if (error) {
          setError(error);
        } else {
          setSignUpSuccess(true);
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) {
          setError(error);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (signUpSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">
              Z
            </div>
            <CardTitle className="text-xl">Check your email</CardTitle>
            <CardDescription>
              We sent a confirmation link to <strong>{email}</strong>. Click the link to activate your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => { setSignUpSuccess(false); setIsSignUp(false); }}>
              Back to sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">
            Z
          </div>
          <CardTitle className="text-xl">Zuper Web Preflight</CardTitle>
          <CardDescription>{isSignUp ? "Create your account" : "Sign in to your account"}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="displayName">Display name</Label>
                <Input
                  id="displayName"
                  type="text"
                  placeholder="Your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@zuper.co"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  validateDomain(e.target.value);
                }}
                required
              />
              {domainError && (
                <p className="text-xs text-destructive">{domainError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <Button className="w-full" type="submit" disabled={submitting || (isSignUp && !!domainError)}>
              {submitting ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                type="button"
                className="text-primary hover:underline font-medium"
                onClick={() => { setIsSignUp(!isSignUp); setError(null); setDomainError(null); }}
              >
                {isSignUp ? "Sign in" : "Sign up"}
              </button>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

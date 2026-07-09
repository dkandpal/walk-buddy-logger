import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type State = "loading" | "ready" | "already" | "invalid" | "success" | "error";

const SUPABASE_URL = "https://gpqkwnyocreyasvhfech.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdwcWt3bnlvY3JleWFzdmhmZWNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzOTQ1MTgsImV4cCI6MjA3NTk3MDUxOH0.a4I9SK5izg5SfkLWPObLdD3d44YjliVSaw60nNUTzIE";

const Unsubscribe = () => {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(
            token,
          )}`,
          { headers: { apikey: SUPABASE_ANON_KEY } },
        );
        const body = await res.json();
        if (!res.ok) return setState("invalid");
        if (body.valid === false && body.reason === "already_unsubscribed")
          return setState("already");
        if (body.valid === true) return setState("ready");
        setState("invalid");
      } catch {
        setState("error");
      }
    })();
  }, [token]);

  const confirm = async () => {
    if (!token) return;
    const { data, error } = await supabase.functions.invoke(
      "handle-email-unsubscribe",
      { body: { token } },
    );
    if (error) return setState("error");
    if ((data as any)?.success) return setState("success");
    if ((data as any)?.reason === "already_unsubscribed")
      return setState("already");
    setState("error");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div className="max-w-md w-full rounded-3xl border border-white/10 bg-white/5 backdrop-blur p-8 text-center">
        {state === "loading" && <p>Checking your link…</p>}
        {state === "invalid" && (
          <p className="text-lg">This unsubscribe link is invalid or expired.</p>
        )}
        {state === "already" && (
          <p className="text-lg">You're already unsubscribed. 👋</p>
        )}
        {state === "ready" && (
          <>
            <h1 className="text-2xl font-bold mb-4">Unsubscribe?</h1>
            <p className="mb-6 text-muted-foreground">
              You'll stop receiving emails from Walk Buddy Logger.
            </p>
            <Button onClick={confirm}>Confirm unsubscribe</Button>
          </>
        )}
        {state === "success" && (
          <p className="text-lg">You've been unsubscribed. Sorry to see you go!</p>
        )}
        {state === "error" && (
          <p className="text-lg">Something went wrong. Please try again later.</p>
        )}
      </div>
    </div>
  );
};

export default Unsubscribe;

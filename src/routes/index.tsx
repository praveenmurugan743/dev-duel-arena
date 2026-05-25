import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ensureAnonSession } from "@/lib/auth";
import { createRoom as createRoomFn, joinRoom as joinRoomFn } from "@/lib/game.functions";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

const PENDING_KEY = "dd:pendingCreate";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dev Duel — Real-time Developer Trivia" },
      {
        name: "description",
        content:
          "Battle other developers in real-time trivia. Create a room, share the 4-digit code, and duel.",
      },
      { property: "og:title", content: "Dev Duel — Real-time Developer Trivia" },
      {
        property: "og:description",
        content: "Multiplayer code trivia. Create a room and challenge your friends.",
      },
    ],
  }),
  component: Home,
});

function generateCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function Home() {
  const navigate = useNavigate();
  const { user, isGoogleUser, loading } = useAuth();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const createRoomRpc = useServerFn(createRoomFn);
  const joinRoomRpc = useServerFn(joinRoomFn);

  async function doCreate(displayName: string) {
    setBusy(true);
    try {
      const res = await createRoomRpc({ data: { displayName } });
      sessionStorage.setItem(`dd:player:${res.roomId}`, res.playerId);
      navigate({ to: "/room/$code", params: { code: res.code } });
    } catch (e) {
      console.error(e);
      toast.error("Failed to create room");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    if (!isGoogleUser) {
      if (name.trim()) sessionStorage.setItem(PENDING_KEY, name.trim());
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.href,
      });
      if (result.error) {
        sessionStorage.removeItem(PENDING_KEY);
        toast.error("Sign in failed");
      }
      return;
    }
    if (!name.trim()) return toast.error("Enter a display name");
    await doCreate(name.trim());
  }

  useEffect(() => {
    if (loading || !isGoogleUser) return;
    const pending = sessionStorage.getItem(PENDING_KEY);
    if (!pending) return;
    sessionStorage.removeItem(PENDING_KEY);
    setName(pending);
    void doCreate(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isGoogleUser]);

  async function handleJoin() {
    if (!name.trim()) return toast.error("Enter a display name");
    if (!/^\d{4}$/.test(code)) return toast.error("Enter the 4-digit room code");
    setBusy(true);
    try {
      await ensureAnonSession();
      const res = await joinRoomRpc({ data: { code, displayName: name.trim() } });
      sessionStorage.setItem(`dd:player:${res.roomId}`, res.playerId);
      navigate({ to: "/room/$code", params: { code } });
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to join room");
    } finally {
      setBusy(false);
    }
  }


  return (
    <main className="min-h-screen bg-grid flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="text-center mb-10">
          <div className="inline-block font-mono text-xs tracking-[0.3em] text-neon mb-4 border border-neon/40 rounded-full px-3 py-1">
            &gt; REAL-TIME MULTIPLAYER
          </div>
          <h1 className="text-6xl sm:text-7xl font-black tracking-tight">
            <span className="text-neon">DEV</span>{" "}
            <span className="text-foreground">DUEL</span>
          </h1>
          <p className="mt-4 text-muted-foreground font-mono text-sm">
            10 questions. 15 seconds each. One winner.
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 sm:p-8 space-y-6 shadow-neon">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
              Display Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 20))}
              placeholder="player_one"
              className="w-full bg-input border border-border rounded-md px-4 py-3 font-mono text-lg focus:outline-none focus:border-neon focus:shadow-neon transition"
            />
          </div>

          <button
            onClick={handleCreate}
            disabled={busy || loading}
            className="w-full bg-neon text-primary-foreground font-bold text-lg py-4 rounded-md hover:opacity-90 transition disabled:opacity-50 font-mono uppercase tracking-wider flex items-center justify-center gap-2"
          >
            {isGoogleUser ? (
              "Create Room"
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z"/></svg>
                Sign in with Google to Create
              </>
            )}
          </button>
          {!isGoogleUser && !loading && (
            <p className="text-center text-xs font-mono text-muted-foreground -mt-2">
              Hosting a room requires a Google account
            </p>
          )}

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs font-mono text-muted-foreground">OR JOIN</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="flex gap-3">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="0000"
              inputMode="numeric"
              className="flex-1 bg-input border border-border rounded-md px-4 py-3 font-mono text-2xl text-center tracking-[0.5em] focus:outline-none focus:border-neon transition"
            />
            <button
              onClick={handleJoin}
              disabled={busy}
              className="px-6 border border-neon text-neon font-mono font-bold uppercase rounded-md hover:bg-neon hover:text-primary-foreground transition disabled:opacity-50"
            >
              Join
            </button>
          </div>
        </div>

        <p className="text-center mt-8 text-xs font-mono text-muted-foreground">
          <Link to="/" className="hover:text-neon">
            ./devduel --version=1.0
          </Link>
        </p>
      </div>
    </main>
  );
}

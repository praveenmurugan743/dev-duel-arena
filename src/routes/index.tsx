import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureAnonSession } from "@/lib/auth";
import { pickRandomQuestionIds } from "@/lib/questions";
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
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return toast.error("Enter a display name");
    setBusy(true);
    try {
      const userId = await ensureAnonSession();
      const questionIds = await pickRandomQuestionIds(10);

      // Try a few times in case of code collision
      let roomCode = "";
      let roomId = "";
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateCode();
        const { data, error } = await supabase
          .from("rooms")
          .insert({
            code: candidate,
            status: "lobby",
            question_ids: questionIds,
            host_id: userId,
          })
          .select("id, code")
          .single();
        if (!error && data) {
          roomCode = data.code;
          roomId = data.id;
          break;
        }
      }
      if (!roomId) throw new Error("Could not create room");

      const { data: player, error: pErr } = await supabase
        .from("players")
        .insert({ room_id: roomId, user_id: userId, name: name.trim() })
        .select("id")
        .single();
      if (pErr || !player) throw pErr;

      sessionStorage.setItem(`dd:player:${roomId}`, player.id);
      navigate({ to: "/room/$code", params: { code: roomCode } });
    } catch (e) {
      console.error(e);
      toast.error("Failed to create room");
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    if (!name.trim()) return toast.error("Enter a display name");
    if (!/^\d{4}$/.test(code)) return toast.error("Enter the 4-digit room code");
    setBusy(true);
    try {
      const userId = await ensureAnonSession();
      const { data: room, error } = await supabase
        .from("rooms")
        .select("id, status")
        .eq("code", code)
        .maybeSingle();
      if (error || !room) {
        toast.error("Room not found");
        return;
      }
      if (room.status !== "lobby") {
        toast.error("Game already started");
        return;
      }
      const { data: player, error: pErr } = await supabase
        .from("players")
        .insert({ room_id: room.id, user_id: userId, name: name.trim() })
        .select("id")
        .single();
      if (pErr || !player) throw pErr;
      sessionStorage.setItem(`dd:player:${room.id}`, player.id);
      navigate({ to: "/room/$code", params: { code } });
    } catch (e) {
      console.error(e);
      toast.error("Failed to join room");
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
            disabled={busy}
            className="w-full bg-neon text-primary-foreground font-bold text-lg py-4 rounded-md hover:opacity-90 transition disabled:opacity-50 font-mono uppercase tracking-wider"
          >
            Create Room
          </button>

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

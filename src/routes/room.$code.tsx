import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { ensureAnonSession } from "@/lib/auth";
import type { PublicQuestion } from "@/lib/questions";
import {
  getRoomQuestions,
  startGame as startGameFn,
  advanceQuestion as advanceQuestionFn,
  submitAnswer as submitAnswerFn,
} from "@/lib/game.functions";
import { CodeQuestion } from "@/components/CodeQuestion";
import confetti from "canvas-confetti";
import { toast } from "sonner";

export const Route = createFileRoute("/room/$code")({
  head: ({ params }) => ({
    meta: [
      { title: `Room ${params.code} — Dev Duel` },
      { name: "description", content: "Live developer trivia room." },
    ],
  }),
  component: RoomPage,
});

const QUESTION_SECONDS = 15;

type Room = {
  id: string;
  code: string;
  status: string;
  question_ids: number[];
  current_question_index: number;
  question_started_at: string | null;
  host_id: string | null;
};

type Player = {
  id: string;
  name: string;
  score: number;
  user_id: string | null;
};

function RoomPage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [answerResult, setAnswerResult] = useState<{ index: number; isCorrect: boolean } | null>(null);
  const fetchQuestions = useServerFn(getRoomQuestions);
  const startGameRpc = useServerFn(startGameFn);
  const advanceRpc = useServerFn(advanceQuestionFn);
  const submitAnswerRpc = useServerFn(submitAnswerFn);
  const [selected, setSelected] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(QUESTION_SECONDS);
  const [advancing, setAdvancing] = useState(false);
  const advanceTimerRef = useRef<number | null>(null);

  const playerId =
    typeof window !== "undefined" && room
      ? sessionStorage.getItem(`dd:player:${room.id}`)
      : null;
  const isHost = !!userId && !!room && room.host_id === userId;

  // Bootstrap: anon session, fetch room + players, load questions
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const uid = await ensureAnonSession();
        if (cancelled) return;
        setUserId(uid);

        const { data: roomData, error } = await supabase
          .from("rooms")
          .select("*")
          .eq("code", code)
          .maybeSingle();
        if (error || !roomData) {
          toast.error("Room not found");
          navigate({ to: "/" });
          return;
        }
        const r = roomData as unknown as Room;
        setRoom(r);

        const qs = await fetchQuestions({ data: { roomId: r.id } });
        setQuestions(qs);

        const { data: ps } = await supabase
          .from("players")
          .select("id, name, score, user_id")
          .eq("room_id", r.id)
          .order("created_at", { ascending: true });
        setPlayers((ps ?? []) as Player[]);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, navigate]);

  // Realtime subscriptions
  useEffect(() => {
    if (!room) return;
    const channel = supabase
      .channel(`room:${room.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${room.id}` },
        (payload) => setRoom(payload.new as unknown as Room),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${room.id}` },
        async () => {
          const { data } = await supabase
            .from("players")
            .select("id, name, score, user_id")
            .eq("room_id", room.id)
            .order("created_at", { ascending: true });
          setPlayers((data ?? []) as Player[]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [room?.id]);

  // Reset selection when question changes
  useEffect(() => {
    setSelected(null);
  }, [room?.current_question_index]);

  // Countdown timer driven by question_started_at
  useEffect(() => {
    if (!room?.question_started_at || room.status !== "playing") {
      setTimeLeft(QUESTION_SECONDS);
      return;
    }
    const start = new Date(room.question_started_at).getTime();
    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      const left = Math.max(0, QUESTION_SECONDS - elapsed);
      setTimeLeft(left);
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [room?.question_started_at, room?.status, room?.current_question_index]);

  // Host auto-advances when timer hits 0
  useEffect(() => {
    if (!room || !isHost || room.status !== "playing") return;
    if (timeLeft > 0) return;
    if (advancing) return;
    if (advanceTimerRef.current) return;
    advanceTimerRef.current = window.setTimeout(() => {
      advanceTimerRef.current = null;
      void advance();
    }, 800);
    return () => {
      if (advanceTimerRef.current) {
        window.clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, isHost, room?.status, room?.current_question_index]);

  async function startGame() {
    if (!room) return;
    try {
      await startGameRpc({ data: { roomId: room.id } });
    } catch (e) {
      console.error(e);
      toast.error("Could not start game");
    }
  }

  async function advance() {
    if (!room) return;
    setAdvancing(true);
    try {
      await advanceRpc({ data: { roomId: room.id } });
    } catch (e) {
      console.error(e);
    } finally {
      setAdvancing(false);
    }
  }

  async function submitAnswer(option: string) {
    if (!room || !playerId || selected) return;
    setSelected(option);
    try {
      const res = await submitAnswerRpc({
        data: {
          roomId: room.id,
          questionIndex: room.current_question_index,
          option,
        },
      });
      if (typeof res.isCorrect === "boolean") {
        setAnswerResult({ index: room.current_question_index, isCorrect: res.isCorrect });
      }
    } catch (e) {
      console.error(e);
      setSelected(null);
    }
  }


  // Confetti on finish
  useEffect(() => {
    if (room?.status !== "finished") return;
    const burst = () => {
      confetti({
        particleCount: 120,
        spread: 90,
        origin: { y: 0.6 },
        colors: ["#7CFFB2", "#ffffff", "#3DDC84"],
      });
    };
    burst();
    const id = window.setTimeout(burst, 600);
    return () => window.clearTimeout(id);
  }, [room?.status]);

  if (!room) {
    return (
      <main className="min-h-screen flex items-center justify-center font-mono text-muted-foreground">
        Loading room...
      </main>
    );
  }

  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  const currentQuestion =
    room.status === "playing" ? questions[room.current_question_index] : null;
  const totalQuestions = (room.question_ids as number[]).length;

  return (
    <main className="min-h-screen bg-grid">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <header className="flex items-center justify-between mb-6">
          <div>
            <div className="text-xs font-mono text-muted-foreground tracking-widest">
              ROOM CODE
            </div>
            <div className="text-3xl font-black font-mono text-neon tracking-[0.3em]">
              {room.code}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-mono text-muted-foreground tracking-widest">
              DEV DUEL
            </div>
            <div className="text-sm font-mono">
              {room.status === "playing" && (
                <>
                  Q {room.current_question_index + 1}/{totalQuestions}
                </>
              )}
              {room.status === "lobby" && "LOBBY"}
              {room.status === "finished" && "FINAL RESULTS"}
            </div>
          </div>
        </header>

        <div className="grid lg:grid-cols-[1fr_280px] gap-6">
          <section>
            {room.status === "lobby" && (
              <LobbyView isHost={isHost} players={sortedPlayers} onStart={startGame} />
            )}
            {room.status === "playing" && currentQuestion && (
              <QuestionView
                question={currentQuestion}
                timeLeft={timeLeft}
                selected={selected}
                answerResult={
                  answerResult && answerResult.index === room.current_question_index
                    ? answerResult
                    : null
                }
                onAnswer={submitAnswer}
              />
            )}
            {room.status === "finished" && (
              <ResultsView players={sortedPlayers} onHome={() => navigate({ to: "/" })} />
            )}
          </section>

          <aside className="bg-card border border-border rounded-xl p-4 h-fit lg:sticky lg:top-6">
            <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">
              Leaderboard
            </h2>
            <ul className="space-y-2">
              {sortedPlayers.map((p, i) => (
                <li
                  key={p.id}
                  className={`flex items-center justify-between rounded-md px-3 py-2 font-mono text-sm ${
                    p.id === playerId
                      ? "bg-neon/10 border border-neon/40 text-neon"
                      : "bg-secondary"
                  }`}
                >
                  <span className="flex items-center gap-3 truncate">
                    <span className="text-muted-foreground">{i + 1}.</span>
                    <span className="truncate">{p.name}</span>
                  </span>
                  <span className="font-bold tabular-nums">{p.score}</span>
                </li>
              ))}
              {sortedPlayers.length === 0 && (
                <li className="text-xs font-mono text-muted-foreground">
                  Waiting for players...
                </li>
              )}
            </ul>
          </aside>
        </div>
      </div>
    </main>
  );
}

function LobbyView({
  isHost,
  players,
  onStart,
}: {
  isHost: boolean;
  players: Player[];
  onStart: () => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-8 sm:p-12 text-center shadow-neon">
      <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-4">
        Share the room code
      </div>
      <h1 className="text-5xl sm:text-6xl font-black mb-6">Waiting Room</h1>
      <p className="text-muted-foreground mb-8 font-mono text-sm">
        {players.length} {players.length === 1 ? "player" : "players"} connected
      </p>

      <div className="flex flex-wrap justify-center gap-2 mb-8">
        {players.map((p) => (
          <span
            key={p.id}
            className="font-mono text-sm px-3 py-1 rounded-full bg-secondary border border-border"
          >
            {p.name}
          </span>
        ))}
      </div>

      {isHost ? (
        <button
          onClick={onStart}
          disabled={players.length === 0}
          className="bg-neon text-primary-foreground font-mono font-bold uppercase tracking-wider px-8 py-4 rounded-md hover:opacity-90 transition disabled:opacity-50"
        >
          Start Duel →
        </button>
      ) : (
        <div className="font-mono text-sm text-muted-foreground animate-pulse">
          Waiting for host to start...
        </div>
      )}
    </div>
  );
}

function QuestionView({
  question,
  timeLeft,
  selected,
  answerResult,
  onAnswer,
}: {
  question: PublicQuestion;
  timeLeft: number;
  selected: string | null;
  answerResult: { index: number; isCorrect: boolean } | null;
  onAnswer: (option: string) => void;
}) {
  const pct = useMemo(() => Math.max(0, Math.min(100, (timeLeft / 15) * 100)), [timeLeft]);
  const showResult = answerResult !== null;

  return (
    <div className="bg-card border border-border rounded-xl p-6 sm:p-8 shadow-neon">
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2 font-mono text-[10px] uppercase tracking-widest">
          <span className="px-2 py-1 rounded bg-secondary border border-border">
            {question.category}
          </span>
          <span className="px-2 py-1 rounded bg-secondary border border-border">
            {question.difficulty}
          </span>
        </div>
        <div className="font-mono text-2xl font-bold tabular-nums text-neon">
          {Math.ceil(timeLeft)}s
        </div>
      </div>

      <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-6">
        <div
          className="h-full bg-neon transition-all duration-100 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>

      <CodeQuestion
        html={question.question}
        className="text-xl sm:text-2xl font-display leading-snug mb-8"
      />

      <div className="grid sm:grid-cols-2 gap-3">
        {question.options.map((opt: string, i: number) => {
          const isSelected = selected === opt;
          let cls = "border-border bg-secondary hover:border-neon hover:text-neon";
          if (showResult && isSelected) {
            cls = answerResult!.isCorrect
              ? "border-neon bg-neon/15 text-neon"
              : "border-destructive bg-destructive/15 text-destructive";
          } else if (selected !== null) {
            cls = "border-border bg-secondary opacity-60";
          }
          return (
            <button
              key={i}
              onClick={() => onAnswer(opt)}
              disabled={!!selected || timeLeft <= 0}
              className={`text-left px-4 py-4 rounded-md border-2 font-mono transition disabled:cursor-not-allowed ${cls}`}
            >
              <span className="text-xs text-muted-foreground mr-2">
                {String.fromCharCode(65 + i)}.
              </span>
              <span className="whitespace-pre-wrap">{opt.replace(/\\n/g, "\n")}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ResultsView({ players, onHome }: { players: Player[]; onHome: () => void }) {
  const winner = players[0];
  return (
    <div className="bg-card border border-border rounded-xl p-8 sm:p-12 text-center shadow-neon">
      <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-3">
        Duel Complete
      </div>
      <h1 className="text-5xl sm:text-6xl font-black mb-2">
        <span className="text-neon">{winner?.name ?? "—"}</span> wins
      </h1>
      <p className="font-mono text-muted-foreground mb-10">
        with {winner?.score ?? 0} points
      </p>

      <ol className="max-w-md mx-auto space-y-2 mb-10 text-left">
        {players.map((p, i) => (
          <li
            key={p.id}
            className={`flex items-center justify-between px-4 py-3 rounded-md font-mono ${
              i === 0
                ? "bg-neon/10 border border-neon text-neon"
                : "bg-secondary border border-border"
            }`}
          >
            <span className="flex items-center gap-3">
              <span className="text-2xl font-black tabular-nums">{i + 1}</span>
              <span>{p.name}</span>
            </span>
            <span className="font-bold tabular-nums">{p.score}</span>
          </li>
        ))}
      </ol>

      <button
        onClick={onHome}
        className="bg-neon text-primary-foreground font-mono font-bold uppercase tracking-wider px-8 py-4 rounded-md hover:opacity-90 transition"
      >
        New Game
      </button>
    </div>
  );
}

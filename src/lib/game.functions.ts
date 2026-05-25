import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getQuestionById,
  pickRandomIds,
  sanitizeQuestions,
  type PublicQuestion,
} from "./game.server";

const QUESTION_SECONDS = 15;
const QUESTIONS_PER_GAME = 10;

function generateCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// Returns questions for a room WITHOUT correct_option.
export const getRoomQuestions = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ roomId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }): Promise<PublicQuestion[]> => {
    const { data: room, error } = await supabaseAdmin
      .from("rooms")
      .select("question_ids")
      .eq("id", data.roomId)
      .maybeSingle();
    if (error || !room) throw new Error("Room not found");
    const ids = (room.question_ids as number[]) ?? [];
    return sanitizeQuestions(ids);
  });

// Create a room. Requires a non-anonymous (signed-in) user.
export const createRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ displayName: z.string().trim().min(1).max(20) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId, claims } = context;
    if ((claims as { is_anonymous?: boolean })?.is_anonymous) {
      throw new Error("Sign in required to create a room");
    }

    const questionIds = pickRandomIds(QUESTIONS_PER_GAME);

    let roomId = "";
    let roomCode = "";
    for (let i = 0; i < 6; i++) {
      const candidate = generateCode();
      const { data: room, error } = await supabaseAdmin
        .from("rooms")
        .insert({
          code: candidate,
          status: "lobby",
          question_ids: questionIds,
          host_id: userId,
        })
        .select("id, code")
        .single();
      if (!error && room) {
        roomId = room.id;
        roomCode = room.code;
        break;
      }
    }
    if (!roomId) throw new Error("Could not create room");

    const { data: player, error: pErr } = await supabaseAdmin
      .from("players")
      .insert({ room_id: roomId, user_id: userId, name: data.displayName })
      .select("id")
      .single();
    if (pErr || !player) throw new Error("Could not create player");

    return { roomId, code: roomCode, playerId: player.id };
  });

// Join a room. Works for anonymous users.
export const joinRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        code: z.string().regex(/^\d{4}$/),
        displayName: z.string().trim().min(1).max(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: room, error } = await supabaseAdmin
      .from("rooms")
      .select("id, status")
      .eq("code", data.code)
      .maybeSingle();
    if (error || !room) throw new Error("Room not found");
    if (room.status !== "lobby") throw new Error("Game already started");

    const { data: player, error: pErr } = await supabaseAdmin
      .from("players")
      .insert({ room_id: room.id, user_id: userId, name: data.displayName })
      .select("id")
      .single();
    if (pErr || !player) throw new Error("Could not join room");

    return { roomId: room.id, playerId: player.id };
  });

async function assertHost(roomId: string, userId: string) {
  const { data: room } = await supabaseAdmin
    .from("rooms")
    .select("id, host_id, status, current_question_index, question_ids")
    .eq("id", roomId)
    .maybeSingle();
  if (!room) throw new Error("Room not found");
  if (room.host_id !== userId) throw new Error("Only the host can do that");
  return room;
}

export const startGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ roomId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertHost(data.roomId, context.userId);
    const { error } = await supabaseAdmin
      .from("rooms")
      .update({
        status: "playing",
        current_question_index: 0,
        question_started_at: new Date().toISOString(),
      })
      .eq("id", data.roomId);
    if (error) throw error;
    return { ok: true };
  });

export const advanceQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ roomId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const room = await assertHost(data.roomId, context.userId);
    const ids = (room.question_ids as number[]) ?? [];
    const next = (room.current_question_index ?? -1) + 1;
    if (next >= ids.length) {
      await supabaseAdmin
        .from("rooms")
        .update({ status: "finished" })
        .eq("id", data.roomId);
    } else {
      await supabaseAdmin
        .from("rooms")
        .update({
          current_question_index: next,
          question_started_at: new Date().toISOString(),
        })
        .eq("id", data.roomId);
    }
    return { ok: true };
  });

// Submit answer. Server validates correctness and computes score.
export const submitAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        roomId: z.string().uuid(),
        questionIndex: z.number().int().min(0).max(100),
        option: z.string().min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Find player belonging to this user in this room
    const { data: player } = await supabaseAdmin
      .from("players")
      .select("id, score")
      .eq("room_id", data.roomId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!player) throw new Error("You are not in this room");

    // Verify the room is on this question and compute remaining time server-side
    const { data: room } = await supabaseAdmin
      .from("rooms")
      .select("status, current_question_index, question_ids, question_started_at")
      .eq("id", data.roomId)
      .maybeSingle();
    if (!room) throw new Error("Room not found");
    if (room.status !== "playing")
      throw new Error("Game is not in progress");
    if (room.current_question_index !== data.questionIndex)
      throw new Error("Question already ended");

    const ids = (room.question_ids as number[]) ?? [];
    const qid = ids[data.questionIndex];
    const question = qid != null ? getQuestionById(qid) : undefined;
    if (!question) throw new Error("Question not found");

    // Prevent duplicate answers
    const { data: existing } = await supabaseAdmin
      .from("answers")
      .select("id")
      .eq("player_id", player.id)
      .eq("question_index", data.questionIndex)
      .maybeSingle();
    if (existing) return { ok: true, duplicate: true };

    const startedAt = room.question_started_at
      ? new Date(room.question_started_at).getTime()
      : 0;
    const elapsed = startedAt ? (Date.now() - startedAt) / 1000 : QUESTION_SECONDS;
    const timeLeft = Math.max(0, QUESTION_SECONDS - elapsed);
    const isCorrect = data.option === question.correct_option;
    const earned = isCorrect ? 100 + Math.round(timeLeft * 10) : 0;

    const { error: aErr } = await supabaseAdmin.from("answers").insert({
      player_id: player.id,
      room_id: data.roomId,
      question_index: data.questionIndex,
      is_correct: isCorrect,
    });
    if (aErr) throw aErr;

    if (earned > 0) {
      await supabaseAdmin
        .from("players")
        .update({ score: (player.score ?? 0) + earned })
        .eq("id", player.id);
    }

    return { ok: true, isCorrect, earned };
  });

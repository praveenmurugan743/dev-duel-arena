import { describe, it, expect, vi, beforeEach } from "vitest";

const getSession = vi.fn();
const signInAnonymously = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSession(...args),
      signInAnonymously: (...args: unknown[]) => signInAnonymously(...args),
    },
  },
}));

import { ensureAnonSession } from "@/lib/auth";

describe("ensureAnonSession", () => {
  beforeEach(() => {
    getSession.mockReset();
    signInAnonymously.mockReset();
  });

  it("returns the existing session user id without creating a new one", async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: "existing-user" } } },
    });

    const id = await ensureAnonSession();

    expect(id).toBe("existing-user");
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("signs in anonymously when no session exists", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    signInAnonymously.mockResolvedValue({
      data: { user: { id: "new-anon-user" } },
      error: null,
    });

    const id = await ensureAnonSession();

    expect(signInAnonymously).toHaveBeenCalledOnce();
    expect(id).toBe("new-anon-user");
  });

  it("throws when anonymous sign-in fails", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    signInAnonymously.mockResolvedValue({
      data: { user: null },
      error: new Error("nope"),
    });

    await expect(ensureAnonSession()).rejects.toThrow("nope");
  });
});

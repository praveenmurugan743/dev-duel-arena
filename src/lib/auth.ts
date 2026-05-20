import { supabase } from "@/integrations/supabase/client";

export async function ensureAnonSession(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) return data.session.user.id;
  const { data: signIn, error } = await supabase.auth.signInAnonymously();
  if (error || !signIn.user) throw error ?? new Error("Anonymous sign-in failed");
  return signIn.user.id;
}

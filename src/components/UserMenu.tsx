import { useState } from "react";
import { LogOut } from "lucide-react";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu() {
  const { user, isGoogleUser } = useAuth();
  const [signingIn, setSigningIn] = useState(false);

  async function signIn() {
    setSigningIn(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.href,
    });
    if (result.error) {
      toast.error("Sign in failed");
      setSigningIn(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
  }

  if (!isGoogleUser) {
    return (
      <button
        onClick={signIn}
        disabled={signingIn}
        className="font-mono text-xs uppercase tracking-wider border border-neon/40 text-neon px-3 py-1.5 rounded-md hover:bg-neon hover:text-primary-foreground transition disabled:opacity-50"
      >
        {signingIn ? "..." : "Sign In"}
      </button>
    );
  }

  const meta = user!.user_metadata as { avatar_url?: string; full_name?: string; name?: string };
  const name = meta.full_name || meta.name || user!.email || "Player";
  const avatar = meta.avatar_url;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 bg-card border border-border rounded-full pl-1 pr-3 py-1 hover:border-neon transition">
        {avatar ? (
          <img src={avatar} alt={name} className="w-7 h-7 rounded-full" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-neon text-primary-foreground flex items-center justify-center font-bold text-xs">
            {name[0]?.toUpperCase()}
          </div>
        )}
        <span className="font-mono text-xs hidden sm:inline">{name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="font-mono text-xs">{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} className="font-mono text-xs cursor-pointer">
          <LogOut className="w-3 h-3 mr-2" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

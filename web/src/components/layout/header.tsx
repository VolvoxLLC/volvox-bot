"use client";

import { useEffect, useRef } from "react";
import { signOut, useSession } from "next-auth/react";
import { LogOut, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { MobileSidebar } from "./mobile-sidebar";

export function Header() {
  const { data: session, status } = useSession();
  const signingOut = useRef(false);

  // Single handler for RefreshTokenError — sign out and redirect to login.
  // session.error is set by the JWT callback when refreshDiscordToken fails.
  // Note: This is the ONLY RefreshTokenError handler in the app (providers.tsx
  // delegates to this component to avoid race conditions).
  // The signingOut guard prevents duplicate sign-out attempts when the session
  // refetches and re-triggers this effect.
  useEffect(() => {
    if (session?.error === "RefreshTokenError" && !signingOut.current) {
      signingOut.current = true;
      signOut({ callbackUrl: "/login" });
    }
  }, [session?.error]);

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
      <MobileSidebar />

      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-discord text-white font-bold text-sm">
          B
        </div>
        <span className="font-semibold hidden sm:inline-block">
          Bill Bot Dashboard
        </span>
      </div>

      <div className="ml-auto flex items-center gap-4">
        {status === "loading" && (
          <Skeleton className="h-8 w-8 rounded-full" />
        )}
        {session?.user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarImage
                    src={session.user.image ?? undefined}
                    alt={session.user.name ?? "User"}
                  />
                  <AvatarFallback>
                    {session.user.name?.charAt(0)?.toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {session.user.name}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a
                  href="https://github.com/BillChirico/bills-bot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Documentation
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}

"use client";

import { CreditCard, LayoutDashboard, LogOut, Settings, Shield, User } from "lucide-react";
import Link from "next/link";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Avatar } from "@/components/ui/primitives";

/**
 * Ends the session on the server (POST, same-origin), then does a full page load so no
 * signed-in data stays in the client router cache. The page reload also runs if the request
 * fails, so the header always reflects the real session state.
 */
async function signOut() {
  try {
    await fetch("/auth/sign-out", { method: "POST", credentials: "same-origin", redirect: "manual" });
  } finally {
    // A full load on purpose: router.push would keep signed-in pages in the client cache.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/");
  }
}

export function UserMenu({
  name,
  handle,
  avatarUrl,
  onboarded,
  isStaff,
}: {
  name: string;
  handle: string;
  avatarUrl: string | null;
  onboarded: boolean;
  isStaff: boolean;
}) {
  return (
    <Menu>
      <MenuTrigger className="ml-1 rounded-full" aria-label="Account menu">
        <Avatar src={avatarUrl} name={name} size={34} />
      </MenuTrigger>
      <MenuContent>
        <div className="px-3 py-2">
          <p className="truncate text-sm font-medium">{name}</p>
          {onboarded ? <p className="truncate text-xs text-muted">@{handle}</p> : null}
        </div>
        <MenuSeparator />
        {onboarded ? (
          <>
            <MenuItem asChild>
              <Link href="/home">
                <LayoutDashboard /> Dashboard
              </Link>
            </MenuItem>
            <MenuItem asChild>
              <Link href={`/members/${handle}`}>
                <User /> My profile
              </Link>
            </MenuItem>
            <MenuItem asChild>
              <Link href="/account/membership">
                <CreditCard /> Membership & billing
              </Link>
            </MenuItem>
            <MenuItem asChild>
              <Link href="/account/settings">
                <Settings /> Settings & security
              </Link>
            </MenuItem>
          </>
        ) : (
          <MenuItem asChild>
            <Link href="/onboarding">
              <User /> Complete your profile
            </Link>
          </MenuItem>
        )}
        {isStaff ? (
          <MenuItem asChild>
            <Link href="/admin">
              <Shield /> Administration
            </Link>
          </MenuItem>
        ) : null}
        <MenuSeparator />
        {/* Not a <form>: selecting a menu item closes (unmounts) the menu before a nested form
            can submit, so the click was silently lost. */}
        <MenuItem onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

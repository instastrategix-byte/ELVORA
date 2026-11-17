"use client";

import { CreditCard, LayoutDashboard, LogOut, Settings, Shield, User } from "lucide-react";
import Link from "next/link";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Avatar } from "@/components/ui/primitives";

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
        <form action="/auth/sign-out" method="post">
          <MenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut /> Sign out
            </button>
          </MenuItem>
        </form>
      </MenuContent>
    </Menu>
  );
}

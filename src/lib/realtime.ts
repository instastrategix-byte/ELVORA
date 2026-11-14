"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { isSupabaseConfigured } from "./env";
import { createClient } from "./supabase/client";

export type RealtimeStatus = "connecting" | "live" | "degraded" | "off";

/**
 * Subscribes to a PRIVATE broadcast topic ("user:<id>" or "conversation:<id>"). Authorization
 * is enforced by RLS on realtime.messages — a user without access never receives events.
 *
 * `onSync` runs on every successful (re)subscription so the UI reconciles from the database,
 * which remains the source of truth. Events missed while disconnected are recovered that way.
 */
export function useRealtime(
  topic: string | null,
  handlers: Record<string, (payload: Record<string, unknown>) => void>,
  onSync?: () => void,
): { status: RealtimeStatus; channel: RealtimeChannel | null } {
  const [status, setStatus] = useState<RealtimeStatus>(topic && isSupabaseConfigured() ? "connecting" : "off");
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const handlersRef = useRef(handlers);
  const syncRef = useRef(onSync);
  useEffect(() => {
    handlersRef.current = handlers;
    syncRef.current = onSync;
  });

  useEffect(() => {
    if (!topic || !isSupabaseConfigured()) return;
    const supabase = createClient();
    let active = true;
    let ch: RealtimeChannel | null = null;

    (async () => {
      await supabase.realtime.setAuth();
      if (!active) return;
      ch = supabase.channel(topic, { config: { private: true, broadcast: { self: false } } });
      for (const event of Object.keys(handlersRef.current)) {
        ch.on("broadcast", { event }, (msg) => handlersRef.current[event]?.((msg.payload ?? {}) as Record<string, unknown>));
      }
      ch.subscribe((state) => {
        if (!active) return;
        if (state === "SUBSCRIBED") {
          setStatus("live");
          syncRef.current?.();
        } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
          setStatus("degraded");
        } else if (state === "CLOSED") {
          setStatus("degraded");
        }
      });
      setChannel(ch);
    })().catch(() => active && setStatus("degraded"));

    return () => {
      active = false;
      if (ch) void supabase.removeChannel(ch);
      setChannel(null);
    };
  }, [topic]);

  return { status, channel };
}

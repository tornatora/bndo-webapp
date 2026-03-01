'use client';

import type { RealtimeChannel } from '@supabase/supabase-js';

type RealtimeClient = {
  removeChannel: (channel: RealtimeChannel) => Promise<unknown> | unknown;
};

export function subscribeToChannelSafely(factory: () => RealtimeChannel, label: string) {
  try {
    return factory();
  } catch (error) {
    console.warn(`[supabase-realtime] ${label} disabled`, error);
    return null;
  }
}

export function removeChannelSafely(client: RealtimeClient, channel: RealtimeChannel | null, label: string) {
  if (!channel) return;

  try {
    void client.removeChannel(channel);
  } catch (error) {
    console.warn(`[supabase-realtime] ${label} cleanup failed`, error);
  }
}

"use client";

import { createContext, useContext, type ReactNode } from "react";

/** Whether the server has a live Urdu/English voice model (AI_MODE=live + a TTS key), D-50. */
const VoiceContext = createContext<{ serverTts: boolean }>({ serverTts: false });

export function VoiceProvider({
  serverTts,
  children,
}: {
  serverTts: boolean;
  children: ReactNode;
}) {
  return <VoiceContext value={{ serverTts }}>{children}</VoiceContext>;
}

export const useVoiceConfig = () => useContext(VoiceContext);

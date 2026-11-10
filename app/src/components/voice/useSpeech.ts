"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useVoiceConfig } from "./VoiceProvider";

export type SpeechLang = "ur" | "en";
const BROWSER_LANG = { ur: "ur-PK", en: "en-US" } as const;

/** True when the browser has a speech voice for this language (Urdu voices are rare). */
export function browserHasVoice(lang: SpeechLang) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  return window.speechSynthesis.getVoices().some((v) => v.lang.toLowerCase().startsWith(lang));
}

/** Client-side cache of server-spoken audio, so replaying a prompt costs no extra call. */
const audioUrlCache = new Map<string, string>();

async function fetchServerSpeech(text: string, lang: SpeechLang): Promise<string | null> {
  const key = `${lang}:${text}`;
  const cached = audioUrlCache.get(key);
  if (cached) return cached;
  try {
    const res = await fetch("/api/ai/speak", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, lang }),
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("audio/")) return null;
    const url = URL.createObjectURL(await res.blob());
    audioUrlCache.set(key, url);
    return url;
  } catch {
    return null;
  }
}

export type SpeakOptions = {
  /** Pre-generated prompt file (`/public/audio/...`), tried first. */
  src?: string | null;
  /**
   * Allow the server Urdu/English voice model for this text. Only for fixed app text or the
   * user's own non-personal answers: never names, phones or addresses (docs/04).
   */
  voiceModel?: boolean;
};

/**
 * Speaks text in Urdu or English: recorded file → server voice model (ur-PK) → browser voice.
 * `canSpeak` says whether any of those could work, so callers can hide a button that can't.
 */
export function useSpeech(
  lang: SpeechLang,
  text: string | null | undefined,
  opts: SpeakOptions = {},
) {
  const { serverTts } = useVoiceConfig();
  const { src, voiceModel = false } = opts;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** Bumped by stop(): a play() still waiting on the network then gives up silently. */
  const seq = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileBroken, setFileBroken] = useState(false);
  const [serverBroken, setServerBroken] = useState(false);
  const [browserVoice, setBrowserVoice] = useState(false);

  // Voices load asynchronously in most browsers.
  useEffect(() => {
    if (!text) return;
    const check = () => setBrowserVoice(browserHasVoice(lang));
    check();
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.addEventListener("voiceschanged", check);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", check);
  }, [text, lang]);

  const stop = useCallback(() => {
    seq.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window)
      window.speechSynthesis.cancel();
    setPlaying(false);
    setLoading(false);
  }, []);

  useEffect(() => stop, [stop]);

  const useFile = !!src && !fileBroken;
  const useServer = !!text && voiceModel && serverTts && !serverBroken;
  const useBrowser = !!text && browserVoice;
  const canSpeak = useFile || useServer || useBrowser;

  const playUrl = useCallback(
    (url: string) =>
      new Promise<boolean>((resolve) => {
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.addEventListener("ended", () => setPlaying(false));
        audio.play().then(
          () => {
            setPlaying(true);
            resolve(true);
          },
          () => resolve(false),
        );
      }),
    [],
  );

  const playBrowser = useCallback(() => {
    if (!text || !browserHasVoice(lang)) return false;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = BROWSER_LANG[lang];
    utterance.onend = () => setPlaying(false);
    utterance.onerror = () => setPlaying(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setPlaying(true);
    return true;
  }, [lang, text]);

  const play = useCallback(async () => {
    stop();
    const id = seq.current;
    if (useFile && (await playUrl(src!))) return;
    if (id !== seq.current) return;
    if (useFile) setFileBroken(true);
    if (useServer) {
      setLoading(true);
      const url = await fetchServerSpeech(text!, lang);
      if (id !== seq.current) return;
      setLoading(false);
      if (url && (await playUrl(url))) return;
      if (id !== seq.current) return;
      setServerBroken(true);
    }
    playBrowser();
  }, [lang, playBrowser, playUrl, src, stop, text, useFile, useServer]);

  return { canSpeak, playing, loading, play, stop };
}

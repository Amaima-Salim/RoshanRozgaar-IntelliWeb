import "server-only";
import { getConfig } from "@/lib/config";
import { AiUnavailableError } from "../errors";
import { geminiJson } from "./gemini";
import { groqJson, groqVisionJson } from "./groq";
import { geminiVisionJson, type ImagePart } from "./vision";

/** Shared provider selection so every text task uses the same configured service. */
export async function textJson(system: string, user: string): Promise<unknown> {
  const { ai } = getConfig();
  if (ai.mode !== "live") throw new AiUnavailableError(ai.mode === "off" ? "off" : "invalid");
  const groq = ai.textProvider === "groq";
  const apiKey = groq ? ai.groqApiKey : ai.geminiApiKey;
  if (!apiKey) throw new AiUnavailableError("no_key");
  return (groq ? groqJson : geminiJson)(system, user, {
    apiKey,
    model: groq ? ai.groqModel : ai.geminiModel,
    timeoutMs: ai.timeoutMs,
  });
}

export async function visionJson(
  system: string,
  user: string,
  images: ImagePart[],
): Promise<unknown> {
  const { ai } = getConfig();
  if (ai.mode !== "live") throw new AiUnavailableError(ai.mode === "off" ? "off" : "invalid");
  const groq = ai.visionProvider === "groq";
  const apiKey = groq ? ai.groqApiKey : ai.geminiApiKey;
  if (!apiKey) throw new AiUnavailableError("no_key");
  return (groq ? groqVisionJson : geminiVisionJson)(system, user, images, {
    apiKey,
    model: groq ? ai.groqVisionModel : ai.geminiModel,
    timeoutMs: Math.max(ai.timeoutMs, 20_000),
  });
}

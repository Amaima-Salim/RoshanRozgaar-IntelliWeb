/**
 * Pre-generates the spoken prompts (D-50): every guide prompt and fixed feedback message, in Urdu
 * (ur-PK voice model) and English, into /public/audio/{ur,en}/, then rewrites
 * src/lib/guide/audio-manifest.ts. Uses TTS_PROVIDER (gemini | azure) and its key from .env.local.
 *
 *   npm run audio:generate                    # only missing files, with TTS_PROVIDER
 *   npm run audio:generate -- --force         # regenerate everything
 *   npm run audio:generate -- --provider=edge # free, no key: the `edge-tts` CLI
 *
 * `--provider=edge` runs the open-source `edge-tts` command (pip install edge-tts; set EDGE_TTS_BIN
 * if it is not on PATH) with the ur-PK-UzmaNeural voice. It uses Microsoft Edge's unofficial
 * read-aloud service: fine for pre-generating demo prompts, not a supported production API (D-50).
 *
 * Run with `--conditions=react-server` (the npm script does) so the `server-only` guard in the
 * provider modules resolves to its no-op build outside Next.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { azureSpeak, geminiSpeak, type SpeechLang } from "@/lib/ai/providers/tts";
import { loadConfig } from "@/lib/config";
import { loadEnvFiles } from "@/lib/db/load-env";
import { GUIDE_KEYS, SPOKEN_MESSAGE_KEYS } from "@/lib/guide";
import { createT, LANGS } from "@/lib/i18n";

loadEnvFiles();
const { ai } = loadConfig(process.env);
const force = process.argv.includes("--force");
const root = path.join(process.cwd(), "public", "audio");
const edge = process.argv.includes("--provider=edge");
const ext = edge || ai.tts.provider === "azure" ? "mp3" : "wav";
const EDGE_VOICE: Record<SpeechLang, string> = {
  ur: process.env.AZURE_SPEECH_UR_VOICE?.trim() || "ur-PK-UzmaNeural",
  en: "en-US-AvaNeural",
};

if (!edge && !ai.tts.configured) {
  console.error(
    ai.tts.provider === "azure"
      ? "AZURE_SPEECH_KEY and AZURE_SPEECH_REGION are required (TTS_PROVIDER=azure)."
      : "GEMINI_API_KEY is required (TTS_PROVIDER=gemini).",
  );
  process.exit(1);
}

async function synth(text: string, lang: SpeechLang) {
  if (edge) {
    const tmp = path.join(os.tmpdir(), `rr-edge-${process.pid}.mp3`);
    // The unofficial service sometimes returns no audio for valid text; a retry usually works.
    for (let attempt = 1; ; attempt++) {
      try {
        execFileSync(
          process.env.EDGE_TTS_BIN || "edge-tts",
          ["--voice", EDGE_VOICE[lang], "--text", text, "--write-media", tmp],
          { stdio: ["ignore", "ignore", "pipe"], timeout: 60_000 },
        );
        break;
      } catch (err) {
        if (attempt >= 4)
          throw new Error("edge-tts returned no audio after 4 attempts", { cause: err });
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    const bytes = new Uint8Array(readFileSync(tmp));
    unlinkSync(tmp);
    if (bytes.length === 0) throw new Error("empty audio");
    return { bytes, mime: "audio/mpeg" as const };
  }
  if (ai.tts.provider === "azure") {
    return azureSpeak(text, lang, {
      apiKey: ai.tts.azureKey!,
      region: ai.tts.azureRegion!,
      urVoice: ai.tts.azureUrVoice,
      timeoutMs: 60_000,
    });
  }
  return geminiSpeak(text, lang, {
    apiKey: ai.geminiApiKey!,
    model: ai.tts.geminiModel,
    timeoutMs: 60_000,
  });
}

const items: { id: string; key: string }[] = [
  ...Object.entries(GUIDE_KEYS).map(([id, key]) => ({ id, key })),
  ...SPOKEN_MESSAGE_KEYS.map((key) => ({ id: key, key })),
];

async function main() {
  let failed = 0;
  for (const lang of LANGS) {
    const dir = path.join(root, lang);
    mkdirSync(dir, { recursive: true });
    const { t } = createT(lang);
    for (const { id, key } of items) {
      const file = path.join(dir, `${id}.${ext}`);
      if (!force && existsSync(file)) continue;
      try {
        const audio = await synth(t(key as Parameters<typeof t>[0]), lang);
        writeFileSync(file, audio.bytes);
        console.log(`✓ ${lang}/${id}.${ext} (${Math.round(audio.bytes.length / 1024)} KB)`);
      } catch (err) {
        failed += 1;
        console.error(`✗ ${lang}/${id}: ${(err as Error).message}`);
      }
      // Free tiers are rate limited; pace the calls. Existing files are skipped, so a run that hit a
      // 429 can simply be repeated to resume.
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  // The manifest lists exactly the files that exist, so a failed prompt never points at nothing.
  const entries: [string, string][] = [];
  for (const lang of LANGS) {
    const dir = path.join(root, lang);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      const m = /^(.+)\.(mp3|wav)$/.exec(name);
      if (m && items.some((i) => i.id === m[1])) entries.push([`${lang}/${m[1]}`, name]);
    }
  }
  writeFileSync(
    path.join(process.cwd(), "src", "lib", "guide", "audio-manifest.ts"),
    `/**
 * Audio prompts that exist in /public/audio/{ur,en}/, as "lang/id" → file name.
 * GENERATED by \`npm run audio:generate\` (scripts/generate-guide-audio.ts, D-50): do not edit by
 * hand. Empty means no prompt has been generated yet; the guide buttons then use the server
 * voice model, else the browser voice, else hide.
 */
export const AUDIO_FILES: Readonly<Record<string, string>> = {${entries.length ? "\n" + entries.map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join("\n") + "\n" : ""}};
`,
  );
  console.log(`${entries.length} prompt files listed in audio-manifest.ts; ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}

void main();

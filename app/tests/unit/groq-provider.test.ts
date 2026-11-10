import { afterEach, describe, expect, it, vi } from "vitest";
import { groqJson, groqVisionJson, groqTranscribe } from "@/lib/ai/providers/groq";
import { loadConfig } from "@/lib/config";

const opts = { apiKey: "test-key", model: "test-model", timeoutMs: 1000 };
afterEach(() => vi.unstubAllGlobals());

function reply(content: string) {
  return Response.json({ choices: [{ message: { content } }] });
}

describe("Groq live provider", () => {
  it("uses Groq JSON mode and preserves system/user boundaries", async () => {
    let request: RequestInit | undefined;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
      request = init;
      return reply('{"trade":"plumber","when":null}');
    });
    expect(await groqJson("Return JSON", "bathroom trouble", opts)).toEqual({
      trade: "plumber",
      when: null,
    });
    const body = JSON.parse(String(request?.body));
    expect(body.messages).toEqual([
      { role: "system", content: "Return JSON" },
      { role: "user", content: "bathroom trouble" },
    ]);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(new Headers(request?.headers).get("authorization")).toBe("Bearer test-key");
    expect(request?.signal).toBeInstanceOf(AbortSignal);
  });

  it("fits vision responses within the account's 1000 output-token limit", async () => {
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.max_completion_tokens > 1000) return new Response("quota", { status: 429 });
      expect(body.reasoning_effort).toBe("none");
      return reply('{"cnicNumber":null}');
    });
    await expect(
      groqVisionJson("JSON", "read", [{ bytes: new Uint8Array([1]), mime: "image/png" }], {
        ...opts,
        model: "qwen/qwen3.8-27b",
      }),
    ).resolves.toEqual({ cnicNumber: null });
  });

  it("encodes images inline for OCR without exposing them through public URLs", async () => {
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.messages[1].content).toEqual([
        { type: "text", text: "Read this card" },
        { type: "image_url", image_url: { url: "data:image/png;base64,AQID" } },
      ]);
      return reply('{"cnicNumber":null}');
    });
    expect(
      await groqVisionJson(
        "Return JSON",
        "Read this card",
        [{ bytes: new Uint8Array([1, 2, 3]), mime: "image/png" }],
        opts,
      ),
    ).toEqual({ cnicNumber: null });
  });

  it.each(["not JSON", "null", "[]", '"text"'])(
    "rejects invalid JSON-object output: %s",
    async (content) => {
      vi.stubGlobal("fetch", async () => reply(content));
      await expect(groqJson("JSON", "text", opts)).rejects.toMatchObject({ reason: "invalid" });
    },
  );

  it("maps quota errors to the fallback error without exposing provider details", async () => {
    vi.stubGlobal("fetch", async () => new Response("secret provider details", { status: 429 }));
    await expect(groqJson("JSON", "text", opts)).rejects.toMatchObject({
      reason: "provider",
      message: "AI unavailable: provider",
    });
  });

  it("maps timeouts to the fallback timeout error", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    await expect(groqJson("JSON", "text", opts)).rejects.toMatchObject({ reason: "timeout" });
  });

  it("handles a broken response body as unavailable", async () => {
    vi.stubGlobal("fetch", async () => new Response("broken", { status: 200 }));
    await expect(groqJson("JSON", "text", opts)).rejects.toMatchObject({ reason: "invalid" });
  });

  it("lets Whisper detect English and Urdu voice-note language", async () => {
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const form = init.body as FormData;
      expect(form.has("language")).toBe(false);
      expect(form.get("model")).toBe("test-model");
      return Response.json({ text: "I can come tomorrow", language: "english" });
    });
    expect(await groqTranscribe({ bytes: new Uint8Array([1]), mime: "audio/webm" }, opts)).toEqual({
      text: "I can come tomorrow",
      language: "en",
    });
  });
  it.each([
    ["urdu", "ur"],
    ["English", "en"],
    ["en", "en"],
    ["ur", "ur"],
  ])("normalizes Whisper %s to app language %s", async (detected, expected) => {
    vi.stubGlobal("fetch", async () => Response.json({ text: "sample", language: detected }));
    expect(
      (await groqTranscribe({ bytes: new Uint8Array([1]), mime: "audio/webm" }, opts)).language,
    ).toBe(expected);
  });
});

describe("AI provider config", () => {
  it("defaults text and vision to Groq with independently configurable models", () => {
    const config = loadConfig({
      GROQ_API_KEY: "key",
      GROQ_MODEL: "text-model",
      GROQ_VISION_MODEL: "vision-model",
    });
    expect(config.ai.textProvider).toBe("groq");
    expect(config.ai.visionProvider).toBe("groq");
    expect(config.ai.groqModel).toBe("text-model");
    expect(config.ai.groqVisionModel).toBe("vision-model");
  });
  it("can keep Gemini explicitly and rejects unknown providers", () => {
    expect(
      loadConfig({ AI_TEXT_PROVIDER: "gemini", AI_VISION_PROVIDER: "gemini" }).ai.textProvider,
    ).toBe("gemini");
    expect(() => loadConfig({ AI_TEXT_PROVIDER: "unknown" })).toThrow();
  });
});

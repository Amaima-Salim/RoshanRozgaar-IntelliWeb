import { afterEach, describe, expect, it, vi } from "vitest";
import { azureSpeak, geminiSpeak, pcmToWav } from "@/lib/ai/providers/tts";

afterEach(() => vi.unstubAllGlobals());

describe("pcmToWav", () => {
  it("writes a valid 16-bit mono WAV header around the PCM", () => {
    const wav = pcmToWav(new Uint8Array([1, 0, 2, 0]), 24_000);
    const ascii = (a: number, b: number) => String.fromCharCode(...wav.slice(a, b));
    const v = new DataView(wav.buffer);
    expect(ascii(0, 4)).toBe("RIFF");
    expect(ascii(8, 12)).toBe("WAVE");
    expect(v.getUint32(24, true)).toBe(24_000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(4);
    expect(wav.length).toBe(48);
  });
});

describe("geminiSpeak", () => {
  it("asks for AUDIO (language auto-detected) and wraps headerless PCM as WAV", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: "audio/L16;codec=pcm;rate=24000",
                    data: Buffer.from([1, 0, 2, 0]).toString("base64"),
                  },
                },
              ],
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await geminiSpeak("سلام", "ur", { apiKey: "k", model: "m", timeoutMs: 1000 });
    expect(out.mime).toBe("audio/wav");
    expect(String.fromCharCode(...out.bytes.slice(0, 4))).toBe("RIFF");
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body));
    expect(body.generationConfig.responseModalities).toEqual(["AUDIO"]);
    expect(body.generationConfig.speechConfig.languageCode).toBeUndefined();
  });

  it("fails closed on a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("quota", { status: 429 })),
    );
    await expect(
      geminiSpeak("سلام", "ur", { apiKey: "k", model: "m", timeoutMs: 1000 }),
    ).rejects.toMatchObject({ reason: "provider" });
  });
});

describe("azureSpeak", () => {
  it("uses the ur-PK neural voice and escapes the text inside SSML", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) => new Response(new Uint8Array([0xff, 0xfb, 1])),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await azureSpeak("<b>نلکا</b> & پانی", "ur", {
      apiKey: "k",
      region: "eastus",
      timeoutMs: 1000,
    });
    expect(out.mime).toBe("audio/mpeg");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://eastus.tts.speech.microsoft.com/cognitiveservices/v1");
    const ssml = String(init.body);
    expect(ssml).toContain('xml:lang="ur-PK"');
    expect(ssml).toContain("ur-PK-UzmaNeural");
    expect(ssml).toContain("&lt;b&gt;نلکا&lt;/b&gt; &amp; پانی");
  });
});

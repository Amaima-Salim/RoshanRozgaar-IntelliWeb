import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("AI_MODE", "live");
  vi.stubEnv("AI_TEXT_PROVIDER", "groq");
  vi.stubEnv("AI_VISION_PROVIDER", "groq");
  vi.stubEnv("GROQ_API_KEY", "test-key");
  vi.stubEnv("GEMINI_API_KEY", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function respond(value: unknown) {
  vi.stubGlobal("fetch", async (url: string) => {
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    return Response.json({ choices: [{ message: { content: JSON.stringify(value) } }] });
  });
}

describe("Groq-backed app flows without a Gemini key", () => {
  it("drafts a request when local rules cannot identify the trade", async () => {
    respond({ trade: "plumber", when: null });
    const { draftRequest } = await import("@/lib/ai");
    expect(await draftRequest({ text: "something is wrong in the bathroom" })).toMatchObject({
      source: "llm",
      simulated: false,
      draft: { trade: "plumber" },
    });
  });
  it("extracts only the current profile step and drops unknown service areas", async () => {
    respond({
      trade: "plumber",
      yearsExperience: null,
      areaSlugs: ["invented"],
      indicativeRatePkr: null,
      rateBasis: null,
      weekdays: [],
      dayParts: [],
    });
    const { extractWorkerProfile } = await import("@/lib/ai");
    expect(
      await extractWorkerProfile({
        stepId: "trade",
        transcript: "I repair bathroom fixtures",
        allowedAreas: [],
      }),
    ).toMatchObject({ source: "llm", draft: { trade: "plumber", areaSlugs: [] } });
  });
  it("accepts a partial profile draft and leaves unstated fields empty", async () => {
    respond({ trade: "plumber", areaSlugs: null, weekdays: null, dayParts: null });
    const { extractWorkerProfile } = await import("@/lib/ai");
    expect(
      await extractWorkerProfile({
        stepId: "trade",
        transcript: "I repair bathroom fixtures",
        allowedAreas: [],
      }),
    ).toMatchObject({
      source: "llm",
      draft: { trade: "plumber", yearsExperience: null, areaSlugs: [] },
    });
  });
  it("translates chat voice-note text", async () => {
    respond({ translation: "I will arrive tomorrow." });
    const { translateText } = await import("@/lib/ai/chat");
    expect(await translateText({ text: "kal aaunga", from: "ur", to: "en" })).toEqual({
      translation: "I will arrive tomorrow.",
      simulated: false,
    });
  });
  it("creates a review draft through Groq", async () => {
    respond({
      tags: ["punctual"],
      sentiment: "positive",
      summaryEn: "Arrived on time.",
      summaryUr: "وقت پر آئے۔",
      flagged: false,
    });
    const { draftReview } = await import("@/lib/ai/trust");
    expect(await draftReview("waqt par aaye")).toMatchObject({
      simulated: false,
      draft: { tags: ["punctual"] },
    });
  });
  it("extracts a CNIC draft through the configured vision provider", async () => {
    respond({
      cnicNumber: "61101-1234567-1",
      fullName: "Demo Person",
      fatherName: null,
      dateOfBirth: null,
      dateOfIssue: null,
      dateOfExpiry: null,
    });
    const { ocrCnic } = await import("@/lib/ai/ocr");
    expect(await ocrCnic([{ bytes: new Uint8Array([1]), mime: "image/png" }])).toMatchObject({
      simulated: false,
      draft: { cnicNumber: "61101-1234567-1" },
    });
  });
  it("rejects hallucinated trust numbers and retains the deterministic fallback", async () => {
    respond({ en: "Rated 5 from 999 reviews", ur: "999" });
    const { phraseTrustSummary } = await import("@/lib/ai/trust");
    const { emptyRates } = await import("@/lib/domain/trust");
    expect(
      await phraseTrustSummary(
        { reviewCount: 1, avgStars: 4, jobsCompleted: 1, repeatCustomers: 0, rates: emptyRates() },
        [],
      ),
    ).toBeNull();
  });
  it("falls back to an empty draft on invalid model trade", async () => {
    respond({ trade: "admin", when: null });
    const { draftRequest } = await import("@/lib/ai");
    expect(await draftRequest({ text: "something is wrong in the bathroom" })).toMatchObject({
      source: "none",
      draft: { trade: null },
    });
  });
  it("does not call the network when AI is off or fixtures are selected", async () => {
    vi.stubEnv("AI_MODE", "off");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { textJson } = await import("@/lib/ai/providers/json");
    await expect(textJson("JSON", "text")).rejects.toMatchObject({ reason: "off" });
    expect(fetch).not.toHaveBeenCalled();
    vi.resetModules();
    vi.stubEnv("AI_MODE", "fixtures");
    const { draftRequest } = await import("@/lib/ai");
    expect(await draftRequest({ text: "fan band hai" })).toMatchObject({ simulated: true });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not fall through to another provider when the configured key is missing", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "other-key");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { textJson } = await import("@/lib/ai/providers/json");
    await expect(textJson("JSON", "text")).rejects.toMatchObject({ reason: "no_key" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

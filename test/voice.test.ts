import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addVoice,
  checkSubscription,
  createVoiceFromPreview,
  deleteVoice,
  formatResult,
  getUserInfo,
  getVoice,
  isolateAudio,
  listModels,
  listVoices,
  parseModels,
  parseVoices,
  requireApiKey,
  searchVoices,
  speechToText,
  textToSoundEffects,
  textToSpeech,
  textToVoice,
} from "../src/voice.js";
import type { FetchFn, HttpResponse } from "../src/types.js";

const VOICES_PAYLOAD = {
  voices: [
    { voice_id: "v_rachel", name: "Rachel", category: "premade" },
    { voice_id: "v_george", name: "George", category: "premade" },
    { name: "No Id Voice" },
  ],
};

const MODELS_PAYLOAD = [
  { model_id: "eleven_multilingual_v2", name: "Multilingual v2", description: "High quality" },
  { model_id: "scribe_v1", name: "Scribe v1" },
];

function jsonResponse(body: unknown, status = 200, statusText = "OK"): HttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(body),
    json: async () => body,
    arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(body)).buffer as ArrayBuffer,
  };
}

function audioResponse(bytes: number[]): HttpResponse {
  const buf = new Uint8Array(bytes).buffer as ArrayBuffer;
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: (n: string) => (n === "content-type" ? "audio/mpeg" : null) },
    text: async () => "",
    json: async () => { throw new Error("not json"); },
    arrayBuffer: async () => buf,
  };
}

interface Captured { url?: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }

function fakeFetch(captured: Captured): FetchFn {
  return async (url: string, init?: Captured["init"]) => {
    captured.url = url;
    captured.init = init;
    if (url.includes("/text-to-speech/")) return audioResponse([1, 2, 3, 4, 5, 6]);
    if (url.includes("/sound-generation")) return audioResponse([9, 9, 9]);
    if (url.includes("/audio-isolation")) return audioResponse([7, 7]);
    if (url.includes("/speech-to-text")) return jsonResponse({ text: "hello world", language_code: "en" });
    if (url.includes("/voices/search") || url.includes("/voices?")) return jsonResponse(VOICES_PAYLOAD);
    if (url.includes("/voice-generation/generate-voice")) return jsonResponse({ previews: [{ generated_voice_id: "gen_1" }] });
    if (url.includes("/voice-generation/create-voice")) return jsonResponse({ voice_id: "v_new" });
    if (url.includes("/voices/add")) return jsonResponse({ voice_id: "v_added" });
    if (url.includes("/voices/")) return jsonResponse({ voice_id: "v_rachel", name: "Rachel" });
    if (url.endsWith("/voices")) return jsonResponse(VOICES_PAYLOAD);
    if (url.endsWith("/models")) return jsonResponse(MODELS_PAYLOAD);
    if (url.endsWith("/user/subscription")) return jsonResponse({ tier: "creator", character_count: 1200 });
    if (url.endsWith("/user")) return jsonResponse({ user_id: "u_1", first_name: "Test" });
    return jsonResponse({ message: "not found" }, 404, "Not Found");
  };
}

describe("requireApiKey", () => {
  it("rejects missing or blank keys naming ELEVENLABS_API_KEY", () => {
    assert.throws(() => requireApiKey(undefined), /ELEVENLABS_API_KEY/);
    assert.throws(() => requireApiKey("  "), /ELEVENLABS_API_KEY/);
    assert.equal(requireApiKey(" k "), "k");
  });
});

describe("textToSpeech", () => {
  it("POSTs JSON to the voice endpoint with xi-api-key and summarises audio", async () => {
    const captured: Captured = {};
    const out = await textToSpeech(fakeFetch(captured), "test-key", { text: "Hello there", voice_id: "v_george" });
    assert.equal(out.kind, "audio");
    assert.equal(out.bytes, 6);
    assert.equal(out.base64Length, 8);
    assert.equal(out.contentType, "audio/mpeg");
    const url = new URL(captured.url ?? "");
    assert.equal(url.pathname, "/v1/text-to-speech/v_george");
    assert.equal(captured.init?.headers?.["xi-api-key"], "test-key");
    assert.equal(captured.init?.headers?.["Content-Type"], "application/json");
    const body = JSON.parse(captured.init?.body ?? "{}");
    assert.equal(body.text, "Hello there");
    assert.equal(body.model_id, "eleven_multilingual_v2");
    assert.ok(formatResult(out).includes("6 bytes"));
  });

  it("uses the documented default voice and honours output_format", async () => {
    const captured: Captured = {};
    await textToSpeech(fakeFetch(captured), "k", { text: "hi", output_format: "pcm_44100" });
    const url = new URL(captured.url ?? "");
    assert.equal(url.pathname, "/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM");
    assert.equal(url.searchParams.get("output_format"), "pcm_44100");
  });

  it("fails before any request when the key is missing and rejects empty text", async () => {
    let called = false;
    const spy: FetchFn = async () => { called = true; return jsonResponse({}); };
    await assert.rejects(() => textToSpeech(spy, undefined, { text: "x" }), /ELEVENLABS_API_KEY/);
    await assert.rejects(() => textToSpeech(fakeFetch({}), "k", { text: " " }), /non-empty/);
    assert.equal(called, false);
  });
});

describe("textToSoundEffects / isolateAudio", () => {
  it("POSTs text and optional controls to /sound-generation", async () => {
    const captured: Captured = {};
    const out = await textToSoundEffects(fakeFetch(captured), "k", { text: "rain on a roof", duration_seconds: 4, prompt_influence: 0.4 });
    assert.equal(out.bytes, 3);
    const url = new URL(captured.url ?? "");
    assert.equal(url.pathname, "/v1/sound-generation");
    assert.deepEqual(JSON.parse(captured.init?.body ?? "{}"), { text: "rain on a roof", duration_seconds: 4, prompt_influence: 0.4 });
  });

  it("POSTs the file path to /audio-isolation and summarises audio", async () => {
    const captured: Captured = {};
    const out = await isolateAudio(fakeFetch(captured), "k", { file_path: "/tmp/noisy.mp3" });
    assert.equal(out.bytes, 2);
    assert.ok((captured.url ?? "").endsWith("/v1/audio-isolation"));
    assert.deepEqual(JSON.parse(captured.init?.body ?? "{}"), { file_path: "/tmp/noisy.mp3" });
  });
});

describe("speechToText", () => {
  it("POSTs file_path and the scribe model default to /speech-to-text", async () => {
    const captured: Captured = {};
    const out = await speechToText(fakeFetch(captured), "k", { file_path: "/tmp/talk.mp3", language_code: "en" }) as { text: string };
    assert.equal(out.text, "hello world");
    assert.ok((captured.url ?? "").endsWith("/v1/speech-to-text"));
    assert.deepEqual(JSON.parse(captured.init?.body ?? "{}"), { file_path: "/tmp/talk.mp3", model_id: "scribe_v1", language_code: "en" });
  });
});

describe("voices", () => {
  it("lists voices from GET /voices, skipping records without an id", async () => {
    const captured: Captured = {};
    const out = await listVoices(fakeFetch(captured), "k");
    assert.equal(out.length, 2);
    assert.deepEqual(out[0], { voiceId: "v_rachel", name: "Rachel", category: "premade" });
    assert.equal(captured.init?.method, "GET");
    assert.equal(captured.init?.headers?.["xi-api-key"], "k");
  });

  it("gets one voice by id and searches with query params", async () => {
    const captured: Captured = {};
    const one = await getVoice(fakeFetch(captured), "k", "v_rachel") as { name: string };
    assert.equal(one.name, "Rachel");
    assert.ok((captured.url ?? "").endsWith("/v1/voices/v_rachel"));
    const found = await searchVoices(fakeFetch(captured), "k", { search: "rach", page_size: 5 });
    assert.equal(found.length, 2);
    const url = new URL(captured.url ?? "");
    assert.equal(url.searchParams.get("search"), "rach");
    assert.equal(url.searchParams.get("page_size"), "5");
  });

  it("adds and deletes voices with the right methods and bodies", async () => {
    const captured: Captured = {};
    await addVoice(fakeFetch(captured), "k", { name: "Narrator", description: "Warm" });
    assert.ok((captured.url ?? "").endsWith("/v1/voices/add"));
    assert.deepEqual(JSON.parse(captured.init?.body ?? "{}"), { name: "Narrator", description: "Warm" });
    await deleteVoice(fakeFetch(captured), "k", "v_old");
    assert.equal(captured.init?.method, "DELETE");
    assert.ok((captured.url ?? "").endsWith("/v1/voices/v_old"));
  });
});

describe("voice design", () => {
  it("designs a voice from a prompt and saves a preview", async () => {
    const captured: Captured = {};
    const designed = await textToVoice(fakeFetch(captured), "k", { prompt: "A calm British narrator", text: "Sample line" }) as { previews: Array<{ generated_voice_id: string }> };
    assert.equal(designed.previews[0].generated_voice_id, "gen_1");
    assert.deepEqual(JSON.parse(captured.init?.body ?? "{}"), { voice_description: "A calm British narrator", text: "Sample line" });
    const saved = await createVoiceFromPreview(fakeFetch(captured), "k", { generated_voice_id: "gen_1", voice_name: "Calm Narrator" }) as { voice_id: string };
    assert.equal(saved.voice_id, "v_new");
    assert.ok((captured.url ?? "").endsWith("/v1/voice-generation/create-voice"));
  });
});

describe("models and account", () => {
  it("lists models and reads subscription and user info", async () => {
    const captured: Captured = {};
    const models = await listModels(fakeFetch(captured), "k");
    assert.equal(models.length, 2);
    assert.equal(models[0].modelId, "eleven_multilingual_v2");
    const sub = await checkSubscription(fakeFetch(captured), "k") as { tier: string };
    assert.equal(sub.tier, "creator");
    assert.ok((captured.url ?? "").endsWith("/v1/user/subscription"));
    const user = await getUserInfo(fakeFetch(captured), "k") as { user_id: string };
    assert.equal(user.user_id, "u_1");
  });

  it("propagates HTTP failures and tolerates payloads without lists", async () => {
    const failing: FetchFn = async () => jsonResponse({}, 403, "Forbidden");
    await assert.rejects(() => listVoices(failing, "k"), /HTTP 403/);
    assert.deepEqual(parseVoices({}), []);
    assert.deepEqual(parseVoices(null), []);
    assert.deepEqual(parseModels({ not: "a list" }), []);
  });
});

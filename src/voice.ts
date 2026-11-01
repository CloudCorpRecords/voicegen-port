/**
 * voicegen-port core: the documented ElevenLabs core tool set against
 * https://api.elevenlabs.io/v1, with the key from ELEVENLABS_API_KEY
 * sent as the xi-api-key header and JSON request bodies.
 *
 * Audio-producing endpoints (text_to_speech, text_to_sound_effects,
 * isolate_audio) return binary audio upstream. This core reads the
 * bytes through the injected FetchFn and summarises them as an
 * AudioArtifact (byte count, base64 length, content type) — raw audio
 * is never placed in MCP text content.
 *
 * speech_to_text and add_voice are multipart uploads upstream; here
 * they are shaped as JSON bodies naming the file / voice behind the
 * same FetchFn seam, and that simplification is recorded in the
 * build report. A missing API key is an error before any request,
 * naming ELEVENLABS_API_KEY.
 */
import type {
  AddVoiceOptions,
  AudioArtifact,
  CreateVoiceFromPreviewOptions,
  FetchFn,
  HttpResponse,
  IsolateAudioOptions,
  ModelSummary,
  SearchVoicesOptions,
  SoundEffectsOptions,
  SpeechToTextOptions,
  TextToSpeechOptions,
  TextToVoiceOptions,
  VoiceSummary,
} from "./types.js";

export const VERSION = "0.1.0";

export const API_BASE = "https://api.elevenlabs.io/v1";

export const API_KEY_ENV = "ELEVENLABS_API_KEY";

/** Documented default voice used when text_to_speech omits voice_id. */
export const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

export const DEFAULT_TTS_MODEL = "eleven_multilingual_v2";

export function requireApiKey(apiKey: string | undefined): string {
  const key = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!key) {
    throw new Error(
      "ELEVENLABS_API_KEY environment variable is required: set ELEVENLABS_API_KEY to an ElevenLabs API key and retry",
    );
  }
  return key;
}

function requireString(value: unknown, field: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) throw new Error(`${field} must be a non-empty string`);
  return v;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

interface CallInit { method?: string; body?: Record<string, unknown> }

async function callApi(
  fetchFn: FetchFn,
  apiKey: string | undefined,
  path: string,
  init: CallInit = {},
): Promise<HttpResponse> {
  const key = requireApiKey(apiKey);
  let response: HttpResponse;
  try {
    response = await fetchFn(`${API_BASE}${path}`, {
      method: init.method ?? "GET",
      headers: {
        "xi-api-key": key,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch (err) {
    throw new Error(
      `ElevenLabs API request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `ElevenLabs API request failed: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
    );
  }
  return response;
}

async function callJson(
  fetchFn: FetchFn,
  apiKey: string | undefined,
  path: string,
  init: CallInit = {},
): Promise<unknown> {
  const response = await callApi(fetchFn, apiKey, path, init);
  try {
    return await response.json();
  } catch {
    throw new Error("ElevenLabs API returned a response that was not valid JSON");
  }
}

async function callAudio(
  fetchFn: FetchFn,
  apiKey: string | undefined,
  path: string,
  body: Record<string, unknown>,
): Promise<AudioArtifact> {
  const response = await callApi(fetchFn, apiKey, path, { method: "POST", body });
  let buf: ArrayBuffer;
  try {
    buf = await response.arrayBuffer();
  } catch {
    throw new Error("ElevenLabs API returned audio that could not be read");
  }
  const bytes = buf.byteLength;
  return {
    kind: "audio",
    bytes,
    base64Length: bytes === 0 ? 0 : 4 * Math.ceil(bytes / 3),
    contentType: response.headers.get("content-type") ?? undefined,
  };
}

export async function textToSpeech(
  fetchFn: FetchFn, apiKey: string | undefined, options: TextToSpeechOptions,
): Promise<AudioArtifact> {
  const text = requireString(options.text, "text");
  const voiceId = options.voice_id?.trim() || DEFAULT_VOICE_ID;
  const format = options.output_format?.trim();
  const path = `/text-to-speech/${encodeURIComponent(voiceId)}${format ? `?output_format=${encodeURIComponent(format)}` : ""}`;
  return callAudio(fetchFn, apiKey, path, {
    text,
    model_id: options.model_id?.trim() || DEFAULT_TTS_MODEL,
  });
}

export async function textToSoundEffects(
  fetchFn: FetchFn, apiKey: string | undefined, options: SoundEffectsOptions,
): Promise<AudioArtifact> {
  const text = requireString(options.text, "text");
  const body: Record<string, unknown> = { text };
  if (options.duration_seconds !== undefined) body.duration_seconds = options.duration_seconds;
  if (options.prompt_influence !== undefined) body.prompt_influence = options.prompt_influence;
  return callAudio(fetchFn, apiKey, "/sound-generation", body);
}

export async function speechToText(
  fetchFn: FetchFn, apiKey: string | undefined, options: SpeechToTextOptions,
): Promise<unknown> {
  const filePath = requireString(options.file_path, "file_path");
  const body: Record<string, unknown> = {
    file_path: filePath,
    model_id: options.model_id?.trim() || "scribe_v1",
  };
  if (options.language_code?.trim()) body.language_code = options.language_code.trim();
  return callJson(fetchFn, apiKey, "/speech-to-text", { method: "POST", body });
}

export async function isolateAudio(
  fetchFn: FetchFn, apiKey: string | undefined, options: IsolateAudioOptions,
): Promise<AudioArtifact> {
  const filePath = requireString(options.file_path, "file_path");
  return callAudio(fetchFn, apiKey, "/audio-isolation", { file_path: filePath });
}

export function parseVoices(payload: unknown): VoiceSummary[] {
  if (!isRecord(payload) || !Array.isArray(payload.voices)) return [];
  const out: VoiceSummary[] = [];
  for (const v of payload.voices) {
    if (!isRecord(v)) continue;
    const voiceId = str(v.voice_id) ?? str(v.voiceId);
    if (!voiceId) continue;
    out.push({ voiceId, name: str(v.name), category: str(v.category) });
  }
  return out;
}

export async function listVoices(
  fetchFn: FetchFn, apiKey: string | undefined,
): Promise<VoiceSummary[]> {
  return parseVoices(await callJson(fetchFn, apiKey, "/voices"));
}

export async function getVoice(
  fetchFn: FetchFn, apiKey: string | undefined, voiceId: string,
): Promise<unknown> {
  const id = requireString(voiceId, "voice_id");
  return callJson(fetchFn, apiKey, `/voices/${encodeURIComponent(id)}`);
}

export async function searchVoices(
  fetchFn: FetchFn, apiKey: string | undefined, options: SearchVoicesOptions,
): Promise<VoiceSummary[]> {
  const search = requireString(options.search, "search");
  const params = new URLSearchParams({ search });
  if (options.category?.trim()) params.set("category", options.category.trim());
  if (options.page_size !== undefined) params.set("page_size", String(Math.max(1, Math.floor(options.page_size))));
  return parseVoices(await callJson(fetchFn, apiKey, `/voices?${params.toString()}`));
}

export async function textToVoice(
  fetchFn: FetchFn, apiKey: string | undefined, options: TextToVoiceOptions,
): Promise<unknown> {
  const prompt = requireString(options.prompt, "prompt");
  const body: Record<string, unknown> = { voice_description: prompt };
  if (options.text?.trim()) body.text = options.text.trim();
  return callJson(fetchFn, apiKey, "/voice-generation/generate-voice", { method: "POST", body });
}

export async function createVoiceFromPreview(
  fetchFn: FetchFn, apiKey: string | undefined, options: CreateVoiceFromPreviewOptions,
): Promise<unknown> {
  const generatedVoiceId = requireString(options.generated_voice_id, "generated_voice_id");
  const voiceName = requireString(options.voice_name, "voice_name");
  const body: Record<string, unknown> = {
    generated_voice_id: generatedVoiceId,
    voice_name: voiceName,
  };
  if (options.voice_description?.trim()) body.voice_description = options.voice_description.trim();
  return callJson(fetchFn, apiKey, "/voice-generation/create-voice", { method: "POST", body });
}

export async function addVoice(
  fetchFn: FetchFn, apiKey: string | undefined, options: AddVoiceOptions,
): Promise<unknown> {
  const name = requireString(options.name, "name");
  const body: Record<string, unknown> = { name };
  if (options.description?.trim()) body.description = options.description.trim();
  return callJson(fetchFn, apiKey, "/voices/add", { method: "POST", body });
}

export async function deleteVoice(
  fetchFn: FetchFn, apiKey: string | undefined, voiceId: string,
): Promise<unknown> {
  const id = requireString(voiceId, "voice_id");
  return callJson(fetchFn, apiKey, `/voices/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function parseModels(payload: unknown): ModelSummary[] {
  if (!Array.isArray(payload)) return [];
  const out: ModelSummary[] = [];
  for (const m of payload) {
    if (!isRecord(m)) continue;
    const modelId = str(m.model_id) ?? str(m.modelId);
    if (!modelId) continue;
    out.push({ modelId, name: str(m.name), description: str(m.description) });
  }
  return out;
}

export async function listModels(
  fetchFn: FetchFn, apiKey: string | undefined,
): Promise<ModelSummary[]> {
  return parseModels(await callJson(fetchFn, apiKey, "/models"));
}

export async function checkSubscription(
  fetchFn: FetchFn, apiKey: string | undefined,
): Promise<unknown> {
  return callJson(fetchFn, apiKey, "/user/subscription");
}

export async function getUserInfo(
  fetchFn: FetchFn, apiKey: string | undefined,
): Promise<unknown> {
  return callJson(fetchFn, apiKey, "/user");
}

/** Render any core result as the text block MCP clients display. */
export function formatResult(value: unknown): string {
  if (isRecord(value) && value.kind === "audio") {
    const a = value as unknown as AudioArtifact;
    return `Audio generated: ${a.bytes} bytes (${a.base64Length} base64 chars)${a.contentType ? `, ${a.contentType}` : ""}. Raw audio is not embedded in text output.`;
  }
  return JSON.stringify(value, null, 2);
}

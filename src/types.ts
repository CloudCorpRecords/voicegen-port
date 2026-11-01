/**
 * voicegen-port types.
 *
 * Each interface mirrors one ElevenLabs API operation: speech and
 * sound generation, transcription, audio isolation, voice library
 * reads and writes, voice design, model listing, and account reads.
 * Optional fields are sent upstream only when provided, so the API's
 * own defaults apply otherwise. Audio-producing calls never return
 * raw audio through MCP text content; they return an AudioArtifact
 * summary (byte count, base64 length, content type).
 *
 * HTTP access is described by a minimal response surface (including
 * arrayBuffer for binary audio) so tests can inject a fake fetch and
 * never touch the network.
 */

export interface TextToSpeechOptions {
  text: string;
  voice_id?: string;
  model_id?: string;
  output_format?: string;
}

export interface SoundEffectsOptions {
  text: string;
  duration_seconds?: number;
  prompt_influence?: number;
}

export interface SpeechToTextOptions {
  /** Local path or identifier of the audio file to transcribe. */
  file_path: string;
  language_code?: string;
  model_id?: string;
}

export interface IsolateAudioOptions {
  /** Local path or identifier of the audio file to isolate. */
  file_path: string;
}

export interface SearchVoicesOptions {
  search: string;
  category?: string;
  page_size?: number;
}

export interface TextToVoiceOptions {
  /** Text description of the voice to design. */
  prompt: string;
  /** Sample text the preview voice will speak. */
  text?: string;
}

export interface CreateVoiceFromPreviewOptions {
  generated_voice_id: string;
  voice_name: string;
  voice_description?: string;
}

export interface AddVoiceOptions {
  name: string;
  description?: string;
}

export interface AudioArtifact {
  kind: "audio";
  /** Number of audio bytes the API returned. */
  bytes: number;
  /** Length the audio would occupy base64-encoded. */
  base64Length: number;
  contentType?: string;
}

export interface VoiceSummary {
  voiceId: string;
  name?: string;
  category?: string;
}

export interface ModelSummary {
  modelId: string;
  name?: string;
  description?: string;
}

/** Minimal HTTP response surface so tests can inject fixtures. */
export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: string;
  },
) => Promise<HttpResponse>;

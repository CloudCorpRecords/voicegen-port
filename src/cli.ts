#!/usr/bin/env node
/**
 * voicegen-port CLI.
 *
 *   voicegen-port tts <text> [--voice id] [--model id] [--format fmt]
 *   voicegen-port sfx <text> [--duration n] [--influence n]
 *   voicegen-port stt <file_path> [--language code] [--model id]
 *   voicegen-port isolate <file_path>
 *   voicegen-port voices
 *   voicegen-port voice <voice_id>
 *   voicegen-port search-voices <search> [--category c] [--page-size n]
 *   voicegen-port design <prompt> [--text sample]
 *   voicegen-port create-from-preview <generated_voice_id> <voice_name> [--description d]
 *   voicegen-port add-voice <name> [--description d]
 *   voicegen-port delete-voice <voice_id>
 *   voicegen-port models
 *   voicegen-port subscription
 *   voicegen-port user
 *   voicegen-port mcp
 *
 * Reads the ElevenLabs key from ELEVENLABS_API_KEY. Audio commands
 * print an artifact summary (bytes / base64 length), never raw audio.
 * Exit codes: 0 success, 1 API error, 2 usage error.
 */
import {
  addVoice,
  API_KEY_ENV,
  checkSubscription,
  createVoiceFromPreview,
  deleteVoice,
  formatResult,
  getUserInfo,
  getVoice,
  isolateAudio,
  listModels,
  listVoices,
  searchVoices,
  speechToText,
  textToSoundEffects,
  textToSpeech,
  textToVoice,
  VERSION,
} from "./voice.js";
import type { FetchFn } from "./types.js";

function usage(): never {
  console.error(`Usage:
  voicegen-port tts <text> [--voice id] [--model id] [--format fmt] [--json]
  voicegen-port sfx <text> [--duration n] [--influence n] [--json]
  voicegen-port stt <file_path> [--language code] [--model id] [--json]
  voicegen-port isolate <file_path> [--json]
  voicegen-port voices [--json]
  voicegen-port voice <voice_id> [--json]
  voicegen-port search-voices <search> [--category c] [--page-size n] [--json]
  voicegen-port design <prompt> [--text sample] [--json]
  voicegen-port create-from-preview <generated_voice_id> <voice_name> [--description d] [--json]
  voicegen-port add-voice <name> [--description d] [--json]
  voicegen-port delete-voice <voice_id> [--json]
  voicegen-port models [--json]
  voicegen-port subscription [--json]
  voicegen-port user [--json]
  voicegen-port mcp
  voicegen-port --version`);
  process.exit(2);
}

function flagValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx < 0 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function numFlag(args: string[], name: string): number | undefined {
  const raw = flagValue(args, name);
  if (raw === undefined) return undefined;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function positional(args: string[], valueFlags: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (valueFlags.includes(args[i])) i++;
    else if (args[i] !== "--json") out.push(args[i]);
  }
  return out;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (!cmd) usage();
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const apiKey = process.env[API_KEY_ENV];
  const asJson = rest.includes("--json");
  try {
    let out: unknown;
    if (cmd === "tts") {
      const text = positional(rest, ["--voice", "--model", "--format"]).join(" ").trim();
      if (!text) usage();
      out = await textToSpeech(fetchFn, apiKey, {
        text,
        voice_id: flagValue(rest, "--voice"),
        model_id: flagValue(rest, "--model"),
        output_format: flagValue(rest, "--format"),
      });
    } else if (cmd === "sfx") {
      const text = positional(rest, ["--duration", "--influence"]).join(" ").trim();
      if (!text) usage();
      out = await textToSoundEffects(fetchFn, apiKey, {
        text,
        duration_seconds: numFlag(rest, "--duration"),
        prompt_influence: numFlag(rest, "--influence"),
      });
    } else if (cmd === "stt") {
      const file = positional(rest, ["--language", "--model"])[0];
      if (!file) usage();
      out = await speechToText(fetchFn, apiKey, {
        file_path: file,
        language_code: flagValue(rest, "--language"),
        model_id: flagValue(rest, "--model"),
      });
    } else if (cmd === "isolate") {
      const file = positional(rest, [])[0];
      if (!file) usage();
      out = await isolateAudio(fetchFn, apiKey, { file_path: file });
    } else if (cmd === "voices") {
      out = await listVoices(fetchFn, apiKey);
    } else if (cmd === "voice") {
      const id = positional(rest, [])[0];
      if (!id) usage();
      out = await getVoice(fetchFn, apiKey, id);
    } else if (cmd === "search-voices") {
      const search = positional(rest, ["--category", "--page-size"]).join(" ").trim();
      if (!search) usage();
      out = await searchVoices(fetchFn, apiKey, {
        search,
        category: flagValue(rest, "--category"),
        page_size: numFlag(rest, "--page-size"),
      });
    } else if (cmd === "design") {
      const prompt = positional(rest, ["--text"]).join(" ").trim();
      if (!prompt) usage();
      out = await textToVoice(fetchFn, apiKey, { prompt, text: flagValue(rest, "--text") });
    } else if (cmd === "create-from-preview") {
      const pos = positional(rest, ["--description"]);
      if (pos.length < 2) usage();
      out = await createVoiceFromPreview(fetchFn, apiKey, {
        generated_voice_id: pos[0],
        voice_name: pos[1],
        voice_description: flagValue(rest, "--description"),
      });
    } else if (cmd === "add-voice") {
      const name = positional(rest, ["--description"]).join(" ").trim();
      if (!name) usage();
      out = await addVoice(fetchFn, apiKey, { name, description: flagValue(rest, "--description") });
    } else if (cmd === "delete-voice") {
      const id = positional(rest, [])[0];
      if (!id) usage();
      out = await deleteVoice(fetchFn, apiKey, id);
    } else if (cmd === "models") {
      out = await listModels(fetchFn, apiKey);
    } else if (cmd === "subscription") {
      out = await checkSubscription(fetchFn, apiKey);
    } else if (cmd === "user") {
      out = await getUserInfo(fetchFn, apiKey);
    } else {
      usage();
    }
    console.log(asJson ? JSON.stringify(out, null, 2) : formatResult(out));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();

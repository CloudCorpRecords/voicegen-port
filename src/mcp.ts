/**
 * voicegen-port MCP server. Tools: text_to_speech,
 * text_to_sound_effects, speech_to_text, isolate_audio, list_voices,
 * get_voice, search_voices, text_to_voice, create_voice_from_preview,
 * add_voice, delete_voice, list_models, check_subscription,
 * get_user_info.
 *
 * Why the low-level Server instead of McpServer: the high-level helper
 * converts zod schemas to JSON Schema and injects keys that are not in
 * this tool's public spec ("$schema" and "additionalProperties"), which
 * breaks exact tool-list/schema parity with the spec. This file serves
 * tools/list with the spec's exact input schemas as explicit literals,
 * while zod still validates every tools/call argument set.
 *
 * This is the documented core subset of the official ElevenLabs MCP
 * server; the omitted conversational-AI and telephony tools are listed
 * in the build report and the fixture's _source.
 *
 * The ElevenLabs key is read from ELEVENLABS_API_KEY at call time; a
 * missing key returns an honest isError result naming the variable
 * instead of failing the handshake.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
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
  searchVoices,
  speechToText,
  textToSoundEffects,
  textToSpeech,
  textToVoice,
  VERSION,
} from "./voice.js";
import type { FetchFn } from "./types.js";

const TextToSpeechArgs = z.object({
  text: z.string(),
  voice_id: z.string().optional(),
  model_id: z.string().optional(),
  output_format: z.string().optional(),
});
const SoundEffectsArgs = z.object({
  text: z.string(),
  duration_seconds: z.number().optional(),
  prompt_influence: z.number().optional(),
});
const SpeechToTextArgs = z.object({
  file_path: z.string(),
  language_code: z.string().optional(),
  model_id: z.string().optional(),
});
const IsolateAudioArgs = z.object({ file_path: z.string() });
const NoArgs = z.object({});
const GetVoiceArgs = z.object({ voice_id: z.string() });
const SearchVoicesArgs = z.object({
  search: z.string(),
  category: z.string().optional(),
  page_size: z.number().optional(),
});
const TextToVoiceArgs = z.object({
  prompt: z.string(),
  text: z.string().optional(),
});
const CreateVoiceFromPreviewArgs = z.object({
  generated_voice_id: z.string(),
  voice_name: z.string(),
  voice_description: z.string().optional(),
});
const AddVoiceArgs = z.object({
  name: z.string(),
  description: z.string().optional(),
});
const DeleteVoiceArgs = z.object({ voice_id: z.string() });

const TOOLS = [
  {
    name: "text_to_speech",
    description: "Convert text to speech using a specified voice.",
    inputSchema: {
      type: "object" as const,
      properties: {
        text: { type: "string", description: "The text to convert to speech." },
        voice_id: { type: "string", description: "The ID of the voice to use for speech generation; the documented default voice applies when omitted." },
        model_id: { type: "string", description: "The ID of the text-to-speech model to use; defaults to eleven_multilingual_v2 when omitted." },
        output_format: { type: "string", description: "The audio output format for the generated speech, such as mp3_44100_128 or pcm_44100." },
      },
      required: ["text"],
    },
  },
  {
    name: "text_to_sound_effects",
    description: "Generate sound effects from a text description.",
    inputSchema: {
      type: "object" as const,
      properties: {
        text: { type: "string", description: "A text description of the sound effect to generate." },
        duration_seconds: { type: "number", description: "The desired duration in seconds of the generated sound effect." },
        prompt_influence: { type: "number", description: "How strongly the generated sound effect should follow the text prompt, as a number between 0 and 1." },
      },
      required: ["text"],
    },
  },
  {
    name: "speech_to_text",
    description: "Transcribe speech from an audio file.",
    inputSchema: {
      type: "object" as const,
      properties: {
        file_path: { type: "string", description: "The path to the audio file to transcribe." },
        language_code: { type: "string", description: "The language code of the audio, such as en, to guide transcription when known." },
        model_id: { type: "string", description: "The ID of the speech-to-text model to use; defaults to scribe_v1 when omitted." },
      },
      required: ["file_path"],
    },
  },
  {
    name: "isolate_audio",
    description: "Isolate the voice in an audio file, removing background noise.",
    inputSchema: {
      type: "object" as const,
      properties: {
        file_path: { type: "string", description: "The path to the audio file whose voice should be isolated from background noise." },
      },
      required: ["file_path"],
    },
  },
  {
    name: "list_voices",
    description: "Get a list of all available voices.",
    inputSchema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_voice",
    description: "Retrieve a specific voice by its ID.",
    inputSchema: {
      type: "object" as const,
      properties: { voice_id: { type: "string", description: "The ID of the voice to retrieve." } },
      required: ["voice_id"],
    },
  },
  {
    name: "search_voices",
    description: "Search through the voice library for a specific voice.",
    inputSchema: {
      type: "object" as const,
      properties: {
        search: { type: "string", description: "The search text to match against voices in the voice library." },
        category: { type: "string", description: "The voice category to filter search results by, such as premade or cloned." },
        page_size: { type: "number", description: "The maximum number of voices to return in the search results." },
      },
      required: ["search"],
    },
  },
  {
    name: "text_to_voice",
    description: "Design a voice from a text description and return previews.",
    inputSchema: {
      type: "object" as const,
      properties: {
        prompt: { type: "string", description: "A text description of the voice to design, sent to ElevenLabs as the voice description." },
        text: { type: "string", description: "Optional sample text to be spoken in the generated voice previews." },
      },
      required: ["prompt"],
    },
  },
  {
    name: "create_voice_from_preview",
    description: "Save a voice preview from text_to_voice to the voice library.",
    inputSchema: {
      type: "object" as const,
      properties: {
        generated_voice_id: { type: "string", description: "The generated voice ID of the preview from text_to_voice to save." },
        voice_name: { type: "string", description: "The name to give the saved voice in the voice library." },
        voice_description: { type: "string", description: "An optional description for the saved voice." },
      },
      required: ["generated_voice_id", "voice_name"],
    },
  },
  {
    name: "add_voice",
    description: "Add a new voice to the voice library.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "The name of the new voice to add to the voice library." },
        description: { type: "string", description: "An optional description of the new voice." },
      },
      required: ["name"],
    },
  },
  {
    name: "delete_voice",
    description: "Delete a voice from the voice library by its ID.",
    inputSchema: {
      type: "object" as const,
      properties: { voice_id: { type: "string", description: "The ID of the voice to delete from the voice library." } },
      required: ["voice_id"],
    },
  },
  {
    name: "list_models",
    description: "Get a list of all available models.",
    inputSchema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "check_subscription",
    description: "Check the ElevenLabs subscription status for the account.",
    inputSchema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_user_info",
    description: "Get user account information for the API key owner.",
    inputSchema: { type: "object" as const, properties: {}, required: [] },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "voicegen-port", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  try {
    let out: unknown;
    if (name === "text_to_speech") {
      out = await textToSpeech(fetchFn, apiKey, TextToSpeechArgs.parse(args ?? {}));
    } else if (name === "text_to_sound_effects") {
      out = await textToSoundEffects(fetchFn, apiKey, SoundEffectsArgs.parse(args ?? {}));
    } else if (name === "speech_to_text") {
      out = await speechToText(fetchFn, apiKey, SpeechToTextArgs.parse(args ?? {}));
    } else if (name === "isolate_audio") {
      out = await isolateAudio(fetchFn, apiKey, IsolateAudioArgs.parse(args ?? {}));
    } else if (name === "list_voices") {
      NoArgs.parse(args ?? {});
      out = await listVoices(fetchFn, apiKey);
    } else if (name === "get_voice") {
      const parsed = GetVoiceArgs.parse(args ?? {});
      out = await getVoice(fetchFn, apiKey, parsed.voice_id);
    } else if (name === "search_voices") {
      out = await searchVoices(fetchFn, apiKey, SearchVoicesArgs.parse(args ?? {}));
    } else if (name === "text_to_voice") {
      out = await textToVoice(fetchFn, apiKey, TextToVoiceArgs.parse(args ?? {}));
    } else if (name === "create_voice_from_preview") {
      out = await createVoiceFromPreview(fetchFn, apiKey, CreateVoiceFromPreviewArgs.parse(args ?? {}));
    } else if (name === "add_voice") {
      out = await addVoice(fetchFn, apiKey, AddVoiceArgs.parse(args ?? {}));
    } else if (name === "delete_voice") {
      const parsed = DeleteVoiceArgs.parse(args ?? {});
      out = await deleteVoice(fetchFn, apiKey, parsed.voice_id);
    } else if (name === "list_models") {
      NoArgs.parse(args ?? {});
      out = await listModels(fetchFn, apiKey);
    } else if (name === "check_subscription") {
      NoArgs.parse(args ?? {});
      out = await checkSubscription(fetchFn, apiKey);
    } else if (name === "get_user_info") {
      NoArgs.parse(args ?? {});
      out = await getUserInfo(fetchFn, apiKey);
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatResult(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();

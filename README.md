# voicegen-port

voicegen-port turns text into spoken audio, and audio back into
text, through the ElevenLabs API. It can read a paragraph aloud in a
chosen voice, invent a sound effect from a description, transcribe a
recording, clean a noisy clip down to its voice, and manage the
voice library itself — designing new voices from a written
description and saving the ones worth keeping. It runs from the
command line or as an MCP server for agents.

An ElevenLabs API key is required. Put it in the
`ELEVENLABS_API_KEY` environment variable; the key is sent to the
API as the `xi-api-key` header and never appears in output. When the
variable is missing, every call fails with an error that names it.

Audio is binary, and this tool treats it honestly: generation calls
report an artifact summary (byte count, base64 length, content type)
instead of dumping raw audio into text output.

## Install

```bash
npx @reneturcios/voicegen-port voices
```

Or run the container image:

```bash
docker run -i -e ELEVENLABS_API_KEY ghcr.io/cloudcorprecords/voicegen-port
```

The container defaults to the MCP server (see below). Pass CLI
arguments to use it as a CLI instead.

## CLI

```bash
export ELEVENLABS_API_KEY="your ElevenLabs API key"

voicegen-port tts "Welcome to the show" --voice v_george
voicegen-port sfx "rain on a tin roof" --duration 4
voicegen-port stt interview.mp3 --language en
voicegen-port isolate noisy-call.mp3
voicegen-port voices
voicegen-port voice v_rachel
voicegen-port search-voices "narrator" --page-size 5
voicegen-port design "A calm British narrator" --text "Sample line"
voicegen-port create-from-preview gen_1 "Calm Narrator"
voicegen-port add-voice "Studio Voice" --description "Warm and close"
voicegen-port delete-voice v_old
voicegen-port models
voicegen-port subscription
voicegen-port user

voicegen-port --version
```

Exit codes: `0` on success, `1` when a call fails (including a
missing `ELEVENLABS_API_KEY` or an API error), `2` for usage errors.

## MCP server

One bin serves both faces. The `mcp` subcommand starts a stdio MCP
server:

```bash
npx -y @reneturcios/voicegen-port mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "voicegen-port": {
      "command": "npx",
      "args": ["-y", "@reneturcios/voicegen-port", "mcp"],
      "env": { "ELEVENLABS_API_KEY": "your ElevenLabs API key" }
    }
  }
}
```

### Tools

This is the documented core subset (14 tools) of the official
ElevenLabs MCP server. The conversational-AI and telephony tools
(`create_agent`, `list_agents`, `get_agent`, `delete_agent`,
`add_knowledge_base_to_agent`, `make_outbound_call`,
`list_phone_numbers`) plus `voice_clone`, `speech_to_speech`, and
`play_audio` are not implemented; see the build report.

| Tool | Input | What it returns |
| --- | --- | --- |
| `text_to_speech` | `text` (required), `voice_id`, `model_id`, `output_format` (optional) | Audio artifact summary: bytes, base64 length, content type. |
| `text_to_sound_effects` | `text` (required), `duration_seconds`, `prompt_influence` (optional) | Audio artifact summary for the generated effect. |
| `speech_to_text` | `file_path` (required), `language_code`, `model_id` (optional) | The transcription payload, including its text. |
| `isolate_audio` | `file_path` (required) | Audio artifact summary for the isolated voice track. |
| `list_voices` | — | All voices: id, name, and category per voice. |
| `get_voice` | `voice_id` (required) | The full voice record. |
| `search_voices` | `search` (required), `category`, `page_size` (optional) | Matching voices in the same summary shape. |
| `text_to_voice` | `prompt` (required), `text` (optional) | Voice design previews, including generated voice ids. |
| `create_voice_from_preview` | `generated_voice_id`, `voice_name` (required), `voice_description` (optional) | The saved voice record. |
| `add_voice` | `name` (required), `description` (optional) | The added voice record. |
| `delete_voice` | `voice_id` (required) | The API's deletion response. |
| `list_models` | — | All models: id, name, and description per model. |
| `check_subscription` | — | The account's subscription record. |
| `get_user_info` | — | The API key owner's user record. |

Calls go to `https://api.elevenlabs.io/v1` with JSON bodies.
`speech_to_text` and `add_voice` are multipart uploads upstream;
this rebuild shapes them as JSON bodies naming the file / voice, a
simplification recorded in the build report.

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # node test runner over test/*.test.ts, no network (fake fetch fixtures)
npm run dev     # run the CLI from source via tsx
```

## License

MIT — see `LICENSE`.

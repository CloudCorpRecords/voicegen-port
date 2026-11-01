# voicegen-port — Build Report

MCP Rebuild 100, Tier B. Clean-room rebuild of the official
ElevenLabs MCP server (elevenlabs-mcp), built from the public tool
spec captured in `harness/fixtures/elevenlabs-tools-original.json`
only. The fixture was created for this build: it is docs-derived
from the official server's published tool list (elevenlabs-mcp on
PyPI) and the ElevenLabs API v1 docs, marked `"_source":
core-subset, docs-derived ... not hand-probed`. **This build
implements the documented core subset of 14 tools** (see Gaps for
the omitted tools, also listed in the fixture's `_source`). Local
build only — nothing pushed or published, and no live network call
was made or claimed at any point.

Identity: repo `voicegen-port`, npm `@reneturcios/voicegen-port`,
MCP name `io.github.CloudCorpRecords/voicegen-port`, version `0.1.0`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `voicegen-port: dist/cli.js`, `mcpName` set,
  scripts build=`tsc` / dev=`tsx src/cli.ts` / test=`tsx --test test/*.test.ts`
- `server.json` — description "Generate speech, voices, and
  transcripts through the ElevenLabs API." = **68 chars** (≤100 ✓);
  npm entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/voicegen-port:0.1.0` carries **no**
  `version` field (verified programmatically)
- `Dockerfile` — node:20-alpine two-stage, ENTRYPOINT
  `node /app/dist/cli.js`, CMD `mcp`, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/voicegen-port"`
- `tsconfig.json` (identical to the fleet template), `.gitignore`,
  `LICENSE` (MIT, Copyright (c) 2026 Rene Turcios), `README.md`
  (fresh text), `CHANGELOG.md` (single 0.1.0 entry, 2026-10-26)
- `src/index.ts`, `src/cli.ts` (`tts`, `sfx`, `stt`, `isolate`,
  `voices`, `voice`, `search-voices`, `design`,
  `create-from-preview`, `add-voice`, `delete-voice`, `models`,
  `subscription`, `user`, `mcp`, `--version`; exit 2 usage / 1 API
  error), `src/mcp.ts`, `src/types.ts`, `src/voice.ts` (core logic,
  `VERSION = "0.1.0"`)
- `test/voice.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (from the fleet template; image name and smoke-test server name
  changed to voicegen-port)

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with explicit
  inputSchema literals, per the standing fleet rule: `McpServer`'s
  zod-to-JSON-Schema conversion injects `$schema` /
  `additionalProperties` keys that are absent from the public spec
  and break exact schema parity. Zod still validates every
  `tools/call`.
- The 14 tools map to ElevenLabs API v1 endpoints under
  `https://api.elevenlabs.io/v1` with the key from
  `ELEVENLABS_API_KEY` sent as the `xi-api-key` header and JSON
  bodies: `POST /text-to-speech/<voice_id>` (the documented default
  voice applies when `voice_id` is omitted, `output_format` as a
  query parameter), `POST /sound-generation`,
  `POST /speech-to-text`, `POST /audio-isolation`, `GET /voices`,
  `GET /voices/<id>`, `GET /voices?search=...`,
  `POST /voice-generation/generate-voice`,
  `POST /voice-generation/create-voice`, `POST /voices/add`,
  `DELETE /voices/<id>`, `GET /models`, `GET /user/subscription`,
  `GET /user`.
- **Binary handling, honestly:** text_to_speech,
  text_to_sound_effects, and isolate_audio return binary audio
  upstream. The core reads the bytes through the injected FetchFn
  (`arrayBuffer()`) and returns an artifact summary — byte count,
  base64 length, content type — and `formatResult` states plainly
  that raw audio is not embedded in text output. No audio bytes are
  ever placed in MCP text content.
- A missing key throws before any request, with an error naming
  `ELEVENLABS_API_KEY`; over MCP this surfaces as an `isError`
  result (verified live over stdio, see below).
- All HTTP flows through an injectable `FetchFn` (types.ts). The
  test suite uses a fake fetch returning hand-written
  ElevenLabs-shaped fixtures — **no live call was performed during
  this build** (see Gaps).

## Verification (exact outputs)

### 1. Build
```
$ ./node_modules/.bin/tsc ; echo exit=$?
tsc exit=0
```
`dist/` produced, including `dist/cli.js` with the
`#!/usr/bin/env node` shebang.

### 2. Tests
```
$ ./node_modules/.bin/tsx --test test/*.test.ts
ℹ tests 13
ℹ pass 13
ℹ fail 0
```
Covers: missing/blank key error naming ELEVENLABS_API_KEY (and no
request made without a key), TTS endpoint + JSON body + `xi-api-key`
header + audio artifact summary (bytes / base64 length / content
type), the documented default voice and `output_format` query
parameter, empty-text rejection, sound-generation body shaping,
audio-isolation shaping, speech-to-text body with the `scribe_v1`
default, voice list parsing (records without an id skipped), voice
get / search query params, voice add (POST body) and delete (DELETE
method), voice design + create-from-preview bodies and endpoints,
model list parsing, subscription and user endpoints, HTTP-403
propagation, and tolerant parsing of payloads without lists.

### 3. CLI / MCP smoke
`--version` → `0.1.0`; unknown command exits 2 with Usage. MCP
`initialize` over stdio → `serverInfo: {"name":"voicegen-port",
"version":"0.1.0"}`. `tools/call` for `list_voices` and for
`text_to_speech` with `ELEVENLABS_API_KEY` unset each returned
`isError: true` with text "ELEVENLABS_API_KEY environment variable
is required: set ELEVENLABS_API_KEY to an ElevenLabs API key and
retry". CLI calls against the live API were **not** run (offline
build rule for this wave).

### 4. Parity (harness, from ~/workspace/mcp-rebuild-100/harness/)
```
$ python3 parity.py --original fixtures/elevenlabs-tools-original.json \
    --rebuild "stdio:node /home/hatch/workspace/mcp-rebuild-100/builds/voicegen-port/dist/cli.js mcp" \
    --out .../builds/voicegen-port/parity-out
verdict=PASS parity_pct=100.0 original_tools=14 rebuild_tools=14 missing=[] extra=[] schema_diffs=[]
(exit 0)
```
Parity is against the labelled 14-tool core-subset fixture (see
Gaps), not the full documented upstream surface. Original side is
tools-file mode, so `fixture_results` records
`SKIPPED-TOOLS-FILE-MODE` — expected harness semantics, not an error.

## Lockfile status

`package-lock.json` was copied from searchport's and edited with
the file edit tool: top-level `name`, root package `name`, and root
package `bin` key changed searchport -> voicegen-port (dependency
ranges are identical, so the tree is unchanged; a grep confirms no
`searchport` string remains). **Clean lockfile regen required
before publish** (regenerate with no `node_modules` present); do
not publish from this lockfile as-is. `node_modules` here is a
`cp -a` copy of searchport's (ownership-preservation warnings during
the copy were cosmetic; `.bin/tsc` / `.bin/tsx` verified working).

## Gaps / honest notes

- **Core subset, not the full surface:** the official server's
  documented list also includes `voice_clone`, `speech_to_speech`,
  and `play_audio`, plus the conversational-AI / telephony tools
  `create_agent`, `list_agents`, `get_agent`, `delete_agent`,
  `add_knowledge_base_to_agent`, `make_outbound_call`, and
  `list_phone_numbers`. Those 10 tools are **not implemented**;
  they are listed in the fixture's `_source` so the subset is
  labelled, never folded into the count. Parity claimed is
  14/14 against the subset fixture.
- **Multipart simplifications:** `speech_to_text` and `add_voice`
  are multipart file uploads upstream (audio file parts). This
  rebuild shapes them as JSON bodies naming the file / voice
  (`file_path`, `name`, `description`) behind the FetchFn seam;
  a publish-wave pass must switch them to real multipart encoding
  before live use. `add_voice` likewise carries no audio sample
  files, so a live add would be rejected upstream as shaped.
- No live ElevenLabs API call was made (VM egress is blocked and no
  key is available in this environment). Request construction and
  response parsing are written against the documented endpoint
  paths and payload shapes as captured in the hand-written test
  fixtures; live payload drift is unverified until the publish
  wave. The voice-search route in particular is shaped as
  `GET /voices?search=...` from the documented list endpoint's
  search parameter and is a first check at live smoke.
- Audio artifact summaries report the byte count of the response
  body as returned; no audio is decoded, validated, or written to
  disk by this build.
- Container build not exercised locally; the publish-container
  workflow smoke-tests the image at publish time.

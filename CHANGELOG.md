# Changelog

## 0.1.0 (2026-10-26)

- Initial release.
- CLI: `tts`, `sfx`, `stt`, `isolate`, `voices`, `voice`,
  `search-voices`, `design`, `create-from-preview`, `add-voice`,
  `delete-voice`, `models`, `subscription`, and `user`, with
  `--json`; the ElevenLabs key is read from `ELEVENLABS_API_KEY`.
- MCP server (`voicegen-port mcp`, stdio) with the documented core
  subset of 14 tools: `text_to_speech`, `text_to_sound_effects`,
  `speech_to_text`, `isolate_audio`, `list_voices`, `get_voice`,
  `search_voices`, `text_to_voice`, `create_voice_from_preview`,
  `add_voice`, `delete_voice`, `list_models`, `check_subscription`,
  and `get_user_info`.
- Calls go to `https://api.elevenlabs.io/v1` with the key sent as
  the `xi-api-key` header and JSON bodies; audio-producing calls
  return an artifact summary (bytes, base64 length, content type),
  never raw audio in text output.
- A missing `ELEVENLABS_API_KEY` fails honestly with an error naming
  the variable, before any request is made.
- All HTTP goes through an injectable fetch function, so the test
  suite runs entirely on hand-written fixtures with no network access.

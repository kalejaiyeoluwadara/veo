# Voice Companion

Voice Companion is a high-performance, real-time interactive voice application built with Next.js. It integrates advanced speech recognition and text-to-speech synthesis to enable seamless, low-latency vocal conversations with an AI agent.

## Core Features

- **Real-Time Voice Streaming**: Renders text-to-speech output incrementally, sentence by sentence, while the response is still generating. This minimizes perceived latency and creates a natural conversation flow.
- **Robust Speech-to-Text**: Utilizes ElevenLabs Scribe for high-precision speech-to-text transcription directly from recorded browser microphone feeds.
- **Dynamic Emotion Engine**: Automatically detects emotional cues in the textual response (laughter, punctuation, soft expressions) and dynamically adjusts synthesis settings (speed, stability, style) to fit the context.
- **Resilient Fallback Routing**: Includes a model router that automatically falls back to secondary models via OpenRouter or DeepSeek when the primary model experiences rate limits or service interruptions.
- **Progressive Web App Support**: Configured with a web manifest and service worker to allow standalone installation and asset caching.

## Tech Stack

- **Framework**: Next.js (App Router)
- **Programming Language**: TypeScript
- **Styling**: Tailwind CSS and custom design system variables
- **Primary AI Engine**: Gemini 2.5 Flash
- **Speech Engine**: ElevenLabs (Scribe and Text-to-Speech API)
- **Fallback Completions**: OpenRouter / DeepSeek API

## Project Directory Structure

- `app/api/chat/route.ts` - Interactive streaming endpoint that manages Gemini integration and handles OpenRouter/DeepSeek fallback retries.
- `app/api/stt/route.ts` - Secure endpoint for transcribing audio recording uploads using ElevenLabs Scribe.
- `app/api/tts/route.ts` - Streamed audio compiler that takes sentence chunks, detects emotional tone, and fetches corresponding ElevenLabs speech bytes.
- `app/components/` - Interactive chat view components, text input controls, and custom audio visualizers.
- `app/hooks/use-chat.ts` - Core client state orchestrator managing audio generation tokens, playback queues, and text stream buffers.
- `app/hooks/use-speech-recognition.ts` - Media recorder driver wrapping mic input and managing transmission states.
- `app/lib/persona.ts` - Definitions for the system instructions, opening prompts, and generation configurations.
- `app/lib/voice.ts` - Semantic parser mapping textual attributes to target stability, style, and speed configurations.
- `public/manifest.json` & `public/sw.js` - Progressive Web App metadata and service worker configurations.

## Installation and Setup

### Prerequisites

Ensure you have Node.js (version 18 or later) installed on your system.

### Install Dependencies

```bash
npm install
```

### Environment Configuration

Create a `.env.local` file in the root directory. Refer to `.env.example` for the required configuration keys:

```env
# Google Gemini API key for primary chat completions
GEMINI_API_KEY=your_gemini_api_key

# ElevenLabs configuration for voice synthesis and transcription
ELEVENLABS_API_KEY=your_elevenlabs_key
ELEVENLABS_VOICE_ID=your_voice_id

# Optional OpenRouter key for service fallback
OPENROUTER_API_KEY=your_openrouter_api_key
```

### Development Execution

Start the local server using Turbopack:

```bash
npm run dev
```

The application will be accessible at [http://localhost:3000](http://localhost:3000).

### Build for Production

Compile and optimize the build:

```bash
npm run build
npm start
```

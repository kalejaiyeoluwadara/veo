/**
 * Voice delivery helpers for Audrey's text-to-speech.
 *
 * The model's reply is spoken aloud one sentence at a time. To make her sound
 * alive rather than flat, we read the *emotional tone* of each chunk from cheap
 * textual cues (punctuation, laughter, soft trailing, pet names) and translate
 * that into ElevenLabs voice settings — looser + more stylized when she's
 * playful, steadier + gentler when she's tender. No extra model calls.
 */

export type Emotion =
  | "playful"
  | "excited"
  | "flirty"
  | "tender"
  | "sad"
  | "neutral";

export interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
  speed: number;
}

const EMOJI_REGEX =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}]/gu;

/** Strip emojis so they aren't read aloud as "smiling face". */
export function stripForSpeech(text: string): string {
  return text.replace(EMOJI_REGEX, "").replace(/\s{2,}/g, " ").trim();
}

const LAUGHTER = /\b(haha+|hehe+|lmao+|lol|rofl)\b|😂|🤣/i;
const EXCLAIM = /!/g;
const SOFT_WORDS =
  /\b(sorry|miss you|i'?m here|here for you|it'?s okay|it'?ll be okay|proud of you|take care|rest|breathe|hug)\b/i;
const SAD_WORDS = /\b(sad|cry|crying|tired|exhausted|hurt|lonely|stressed|down)\b|🥺|💔/i;
const FLIRTY_WORDS = /\b(babe|baby|love|darling|cutie|handsome|kiss|mwah)\b|😘|😉|💕|❤️|😍/i;

/** Infer the emotional tone of a spoken chunk from textual cues. */
export function detectEmotion(text: string): Emotion {
  const exclaims = (text.match(EXCLAIM) || []).length;
  const trailing = text.includes("...") || /…/.test(text);

  if (SAD_WORDS.test(text)) return "sad";
  if (SOFT_WORDS.test(text) || (trailing && !LAUGHTER.test(text))) return "tender";
  if (LAUGHTER.test(text)) return "playful";
  if (exclaims >= 2) return "excited";
  if (FLIRTY_WORDS.test(text)) return "flirty";
  if (exclaims >= 1) return "playful";
  return "neutral";
}

/**
 * Map an emotion to ElevenLabs voice settings. Centered on her established
 * voice (the previous static settings ≈ "neutral") and nudged from there so
 * shifts between sentences stay believable rather than jarring.
 */
const VOICE_SETTINGS: Record<Emotion, VoiceSettings> = {
  playful: { stability: 0.36, similarity_boost: 0.78, style: 0.45, use_speaker_boost: true, speed: 0.96 },
  excited: { stability: 0.3, similarity_boost: 0.78, style: 0.55, use_speaker_boost: true, speed: 1.0 },
  flirty: { stability: 0.44, similarity_boost: 0.8, style: 0.48, use_speaker_boost: true, speed: 0.92 },
  tender: { stability: 0.62, similarity_boost: 0.8, style: 0.18, use_speaker_boost: true, speed: 0.9 },
  sad: { stability: 0.7, similarity_boost: 0.8, style: 0.12, use_speaker_boost: true, speed: 0.88 },
  neutral: { stability: 0.45, similarity_boost: 0.78, style: 0.2, use_speaker_boost: true, speed: 0.92 },
};

export function voiceSettingsFor(emotion: Emotion): VoiceSettings {
  return VOICE_SETTINGS[emotion];
}

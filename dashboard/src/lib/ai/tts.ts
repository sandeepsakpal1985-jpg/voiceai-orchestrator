import type { TTSConfig, TTSProvider } from "./types";

const defaultConfig: TTSConfig = {
  provider: "browser",
  voiceId: "en-US-Wavenet-D",
  language: "en-US",
  speakingRate: 1.0,
  pitch: 0,
};

let currentConfig: TTSConfig = { ...defaultConfig };

export function configureTTS(config: Partial<TTSConfig>) {
  currentConfig = { ...currentConfig, ...config };
}

export function getTTSConfig(): TTSConfig {
  return { ...currentConfig };
}

export function isBrowserTTSSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

let utteranceQueue: SpeechSynthesisUtterance[] = [];
let isSpeaking = false;

export function speak(
  text: string,
  config?: Partial<TTSConfig>,
  onStart?: () => void,
  onEnd?: () => void,
  onError?: (error: string) => void
): () => void {
  const mergedConfig = { ...currentConfig, ...config };

  if (!isBrowserTTSSupported()) {
    onError?.("Browser TTS is not supported in this browser");
    return () => {};
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = mergedConfig.language;
  utterance.rate = mergedConfig.speakingRate;
  utterance.pitch = mergedConfig.pitch + 1;
  utterance.volume = 1;

  utterance.onstart = () => {
    isSpeaking = true;
    onStart?.();
  };

  utterance.onend = () => {
    isSpeaking = false;
    utteranceQueue.shift();
    if (utteranceQueue.length > 0) {
      window.speechSynthesis.speak(utteranceQueue[0]);
    }
    onEnd?.();
  };

  utterance.onerror = (event) => {
    isSpeaking = false;
    onError?.(event.error);
  };

  utteranceQueue.push(utterance);
  if (!isSpeaking) {
    window.speechSynthesis.speak(utterance);
  }

  return () => {
    const idx = utteranceQueue.indexOf(utterance);
    if (idx > -1) utteranceQueue.splice(idx, 1);
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      isSpeaking = false;
    }
  };
}

export function stopSpeaking() {
  if (isBrowserTTSSupported()) {
    window.speechSynthesis.cancel();
  }
  utteranceQueue = [];
  isSpeaking = false;
}

export function isCurrentlySpeaking(): boolean {
  return isSpeaking;
}

export async function synthesizeSpeech(
  text: string,
  _config?: Partial<TTSConfig>
): Promise<ArrayBuffer> {
  const mergedConfig = { ...currentConfig, ..._config };

  const apiKey = mergedConfig.apiKey || process.env[`${mergedConfig.provider.toUpperCase()}_API_KEY`];
  if (!apiKey) {
    throw new Error(`No API key configured for ${mergedConfig.provider} TTS`);
  }

  const providers: Record<TTSProvider, { url: string; buildBody: (text: string, config: TTSConfig) => Record<string, unknown> }> = {
    browser: { url: "", buildBody: () => ({}) },
    google: {
      url: `https://texttospeech.googleapis.com/v1/text:synthesize`,
      buildBody: (text, config) => ({
        input: { text },
        voice: {
          languageCode: config.language,
          name: config.voiceId,
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: config.speakingRate,
          pitch: config.pitch,
        },
      }),
    },
    azure: {
      url: "https://eastus.tts.speech.microsoft.com/cognitiveservices/v1",
      buildBody: (text) => ({ text }),
    },
    elevenlabs: {
      url: `https://api.elevenlabs.io/v1/text-to-speech/${mergedConfig.voiceId}`,
      buildBody: (text) => ({
        text,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    },
  };

  const provider = providers[mergedConfig.provider];
  if (!provider) {
    throw new Error(`Unsupported TTS provider: ${mergedConfig.provider}`);
  }

  const headers: Record<string, string> = {};

  if (mergedConfig.provider === "google") {
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["Content-Type"] = "application/json";
  } else if (mergedConfig.provider === "azure") {
    headers["Ocp-Apim-Subscription-Key"] = apiKey;
    headers["Content-Type"] = "application/ssml+xml";
  } else if (mergedConfig.provider === "elevenlabs") {
    headers["xi-api-key"] = apiKey;
    headers["Content-Type"] = "application/json";
  }

  try {
    const response = await fetch(provider.url, {
      method: "POST",
      headers,
      body: JSON.stringify(provider.buildBody(text, mergedConfig)),
    });

    if (!response.ok) {
      throw new Error(`TTS API error: ${response.status}`);
    }

    return await response.arrayBuffer();
  } catch (error) {
    console.error("TTS synthesis failed:", error);
    throw error;
  }
}

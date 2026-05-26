import type { STTConfig, STTProvider } from "./types";

// Web Speech API type declarations (not in TypeScript lib by default)
declare class SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare class SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

declare class SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

declare class SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

declare class SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

declare class SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

type TranscriptCallback = (text: string, isFinal: boolean) => void;
type ErrorCallback = (error: string) => void;

const defaultConfig: STTConfig = {
  provider: "browser",
  language: "en-US",
};

let currentConfig: STTConfig = { ...defaultConfig };

export function configureSTT(config: Partial<STTConfig>) {
  currentConfig = { ...currentConfig, ...config };
}

export function getSTTConfig(): STTConfig {
  return { ...currentConfig };
}

export function isBrowserSTTSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
  );
}

let recognitionInstance: unknown = null;

export function startBrowserSTT(
  onTranscript: TranscriptCallback,
  onError: ErrorCallback,
  language?: string
): () => void {
  if (!isBrowserSTTSupported()) {
    onError("Browser speech recognition is not supported in this browser");
    return () => {};
  }

  const SpeechRecognitionCtor =
    (window as unknown as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition
    || (window as unknown as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;

  if (!SpeechRecognitionCtor) {
    onError("Browser speech recognition is not available");
    return () => {};
  }

  const recognition = new SpeechRecognitionCtor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = language ?? currentConfig.language;

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      onTranscript(result[0].transcript, result.isFinal);
    }
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    onError(event.error);
  };

  recognition.start();
  recognitionInstance = recognition;

  return () => {
    recognition.stop();
    recognitionInstance = null;
  };
}

export function stopBrowserSTT() {
  if (recognitionInstance) {
    (recognitionInstance as SpeechRecognition).stop();
    recognitionInstance = null;
  }
}

export async function transcribeAudio(
  audioBlob: Blob,
  config?: Partial<STTConfig>
): Promise<string> {
  const mergedConfig = { ...currentConfig, ...config };

  if (mergedConfig.provider === "browser") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve("Audio received for processing");
      reader.onerror = () => reject(new Error("Failed to read audio"));
      reader.readAsDataURL(audioBlob);
    });
  }

  const apiKey = mergedConfig.apiKey || process.env[`${mergedConfig.provider.toUpperCase()}_API_KEY`];
  if (!apiKey) {
    throw new Error(`No API key configured for ${mergedConfig.provider} STT`);
  }

  const providers: Record<STTProvider, string> = {
    browser: "",
    google: "https://speech.googleapis.com/v1/speech:recognize",
    azure: "https://eastus.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1",
    deepgram: "https://api.deepgram.com/v1/listen",
  };

  const providerUrl = providers[mergedConfig.provider];
  if (!providerUrl) {
    throw new Error(`Unsupported STT provider: ${mergedConfig.provider}`);
  }

  const headers: Record<string, string> = {
    "Content-Type": "audio/webm",
  };

  if (mergedConfig.provider === "google") {
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else if (mergedConfig.provider === "azure") {
    headers["Ocp-Apim-Subscription-Key"] = apiKey;
  } else if (mergedConfig.provider === "deepgram") {
    headers["Authorization"] = `Token ${apiKey}`;
  }

  try {
    const response = await fetch(providerUrl, {
      method: "POST",
      headers,
      body: audioBlob,
    });

    if (!response.ok) {
      throw new Error(`STT API error: ${response.status}`);
    }

    const data = await response.json();
    return data.results?.[0]?.alternatives?.[0]?.transcript ?? "";
  } catch (error) {
    console.error("STT transcription failed:", error);
    throw error;
  }
}

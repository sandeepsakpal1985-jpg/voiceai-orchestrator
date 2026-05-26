"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  Loader2,
  Bot,
  User,
  Radio,
  Wifi,
} from "lucide-react";

export type TransportMode = "websocket" | "livekit";

type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

interface ChatMessage {
  role: "user" | "agent";
  content: string;
  timestamp: number;
}

interface VoiceChatWidgetProps {
  /** Transport mode: 'websocket' (direct) or 'livekit' (via LiveKit runtime) */
  transport?: TransportMode;
  /** WebSocket URL for the voice bridge (default: ws://localhost:8000/ws/voice) */
  wsUrl?: string;
  /** LiveKit server URL (default: ws://localhost:7880) */
  livekitUrl?: string;
  /** System prompt to send to the LLM */
  systemPrompt?: string;
  /** Voice ID for TTS */
  voiceId?: string;
  /** Callback when a message is received */
  onMessage?: (message: ChatMessage) => void;
  /** Callback when connection status changes */
  onStatusChange?: (status: ConnectionStatus) => void;
}

export function VoiceChatWidget({    // Default to LiveKit transport — the primary realtime voice runtime.
    // Use "websocket" mode only for legacy/testing against the orchestrator's /ws/voice bridge.
    transport = "livekit",
  wsUrl = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL
    ? `ws://${new URL(process.env.NEXT_PUBLIC_ORCHESTRATOR_URL).host}/ws/voice`
    : "ws://localhost:8000/ws/voice",
  livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || "ws://localhost:7880",
  systemPrompt,
  voiceId,
  onMessage,
  onStatusChange,
}: VoiceChatWidgetProps) {
  // ── State ──
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [agentResponse, setAgentResponse] = useState("");
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sentiment, setSentiment] = useState<{ label: string; score: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [livekitToken, setLivekitToken] = useState<string | null>(null);
  const [livekitRoomName, setLivekitRoomName] = useState<string | null>(null);

  // ── Refs ──
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioLevelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // LiveKit refs
  const livekitRoomRef = useRef<any>(null);
  const livekitAudioRef = useRef<HTMLAudioElement | null>(null);

  // ── Helpers ──
  const updateStatus = useCallback((newStatus: ConnectionStatus) => {
    setStatus(newStatus);
    onStatusChange?.(newStatus);
  }, [onStatusChange]);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
    onMessage?.(msg);
  }, [onMessage]);

  // ── Audio Level Monitoring ──
  const startAudioLevelMonitor = useCallback((stream: MediaStream) => {
    const audioCtx = new AudioContext();
    audioContextRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    audioLevelIntervalRef.current = setInterval(() => {
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      setAudioLevel(Math.min(avg / 128, 1));
    }, 100);
  }, []);

  const stopAudioLevelMonitor = useCallback(() => {
    if (audioLevelIntervalRef.current) {
      clearInterval(audioLevelIntervalRef.current);
      audioLevelIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  // ── LiveKit: play remote audio track ──
  const playRemoteTrack = useCallback((track: any) => {
    // Create an audio element and attach the remote track
    const audioEl = new Audio();
    audioEl.autoplay = true;
    const mediaStream = new MediaStream([track.mediaStreamTrack]);
    audioEl.srcObject = mediaStream;

    audioEl.onplay = () => setIsAgentSpeaking(true);
    audioEl.onended = () => setIsAgentSpeaking(false);
    audioEl.onerror = () => setIsAgentSpeaking(false);

    livekitAudioRef.current = audioEl;
    audioEl.play().catch((e) => {
      console.warn("LiveKit audio playback failed:", e);
      setIsAgentSpeaking(false);
    });
  }, []);

  // ── Connect (mic + transport) ──
  const startCall = useCallback(async () => {
    setError(null);
    setMessages([]);
    setTranscription("");
    setAgentResponse("");
    setSentiment(null);
    setLivekitToken(null);
    setLivekitRoomName(null);
    updateStatus("connecting");

    try {
      // Request mic access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      // Start audio level monitoring
      startAudioLevelMonitor(stream);

      if (transport === "livekit") {
        // ── LiveKit Transport ──
        // Get a LiveKit access token from the orchestrator
        const httpUrl = wsUrl.replace(/^ws:/, 'http:').replace(/\/ws\/voice.*$/, '');
        const livekitTokenRes = await fetch(
          `${httpUrl}/voice/livekit-token?room_name=voiceai-${Date.now()}`
        );

        if (!livekitTokenRes.ok) {
          throw new Error("Failed to get LiveKit token. Is the orchestrator running?");
        }

        const tokenData = await livekitTokenRes.json();
        const token = tokenData.token;
        const roomName = tokenData.room_name;
        const serverUrl = tokenData.url || livekitUrl;

        setLivekitToken(token);
        setLivekitRoomName(roomName);

        // Connect to LiveKit room using livekit-client SDK
        let RoomClass: any;
        try {
          const lk = await import("livekit-client");
          RoomClass = lk.Room;
        } catch {
          throw new Error(
            "livekit-client SDK not available. Run: npm install livekit-client"
          );
        }

        const room = new RoomClass({
          adaptiveStream: true,
          dynacast: true,
        });
        livekitRoomRef.current = room;

        // Handle remote tracks (agent audio)
        room.on("trackSubscribed", (_track: any, _publication: any, _participant: any) => {
          if (_track.kind === "audio") {
            playRemoteTrack(_track);
          }
        });

        room.on("trackUnsubscribed", (_track: any) => {
          if (_track.kind === "audio") {
            setIsAgentSpeaking(false);
            if (livekitAudioRef.current) {
              livekitAudioRef.current.pause();
              livekitAudioRef.current = null;
            }
          }
        });

        room.on("disconnected", () => {
          updateStatus("disconnected");
          cleanupConnection();
        });

        room.on("connectionStateChanged", (state: any) => {
          if (state === "connected") {
            updateStatus("connected");
          } else if (state === "reconnecting") {
            updateStatus("connecting");
          } else if (state === "disconnected") {
            updateStatus("disconnected");
          }
        });

        // Connect to the LiveKit server
        await room.connect(serverUrl, token);

        // Pass system prompt and voice config as room metadata
        const metadata = JSON.stringify({
          system_prompt: systemPrompt || "",
          voice_id: voiceId || "local-default",
        });
        await room.localParticipant.setMetadata(metadata);

        // Publish local audio track to the room
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          await room.localParticipant.publishTrack(audioTrack, {
            source: 1, // SourceEnum.MICROPHONE
          });
        }

        setConversationId(`livekit-${roomName}`);
        addMessage({
          role: "agent",
          content: `Connected via LiveKit (room: ${roomName}). Speak to start the conversation.`,
          timestamp: Date.now(),
        });

      } else {
        // ── WebSocket Transport ──
        const wsUrlWithParams = new URL(wsUrl);
        if (systemPrompt) wsUrlWithParams.searchParams.set("system_prompt", systemPrompt);
        if (voiceId) wsUrlWithParams.searchParams.set("voice_id", voiceId);

        const ws = new WebSocket(wsUrlWithParams.toString());
        wsRef.current = ws;

        ws.onopen = () => {
          updateStatus("connected");

          // Start recording audio from mic
          const mediaRecorder = new MediaRecorder(stream, {
            mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
              ? "audio/webm;codecs=opus"
              : "audio/webm",
          });
          mediaRecorderRef.current = mediaRecorder;

          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
              event.data.arrayBuffer().then((buffer) => {
                ws.send(new Uint8Array(buffer));
              });
            }
          };

          mediaRecorder.start(500);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            switch (data.type) {
              case "connected":
                setConversationId(data.conversation_id);
                break;

              case "transcription":
                setTranscription(data.text);
                addMessage({
                  role: "user",
                  content: data.text,
                  timestamp: Date.now(),
                });
                break;

              case "response":
                if (data.is_streaming) {
                  setAgentResponse((prev) => prev + data.text);
                }
                break;

              case "response_done":
                setAgentResponse((prev) => {
                  if (prev.trim()) {
                    addMessage({
                      role: "agent",
                      content: prev,
                      timestamp: Date.now(),
                    });
                  }
                  return "";
                });
                break;

              case "audio":
                try {
                  const audioBlob = base64ToBlob(data.base64, "audio/wav");
                  const audioUrl = URL.createObjectURL(audioBlob);
                  const audio = new Audio(audioUrl);
                  audioPlayerRef.current = audio;

                  audio.onplay = () => setIsAgentSpeaking(true);
                  audio.onended = () => {
                    setIsAgentSpeaking(false);
                    URL.revokeObjectURL(audioUrl);
                  };
                  audio.onerror = () => setIsAgentSpeaking(false);

                  audio.play().catch((e) => {
                    console.warn("Audio playback failed:", e);
                    setIsAgentSpeaking(false);
                  });
                } catch (e) {
                  console.warn("TTS audio playback error:", e);
                  setIsAgentSpeaking(false);
                }
                break;

              case "sentiment":
                setSentiment({ label: data.label, score: data.score });
                break;

              case "error":
                setError(data.message);
                break;

              case "call_ended":
                setConversationId(null);
                break;

              case "pong":
                break;

              default:
                console.debug("Unknown WS message type:", data.type);
            }
          } catch (e) {
            console.warn("Failed to parse WS message:", e);
          }
        };

        ws.onclose = () => {
          updateStatus("disconnected");
          stopMediaRecorder();
          stopAudioLevelMonitor();
        };

        ws.onerror = () => {
          updateStatus("error");
          setError("WebSocket connection failed. Is the orchestrator running on port 8000?");
        };
      }
    } catch (err) {
      const message = err instanceof DOMException && err.name === "NotAllowedError"
        ? "Microphone access denied. Please allow microphone permissions."
        : `Failed to start call: ${err instanceof Error ? err.message : "Unknown error"}`;
      setError(message);
      updateStatus("error");
    }
  }, [wsUrl, livekitUrl, transport, systemPrompt, voiceId, updateStatus, startAudioLevelMonitor, addMessage, stopAudioLevelMonitor, playRemoteTrack]);

  // ── End Call ──
  const endCall = useCallback(() => {
    if (transport === "livekit") {
      // Disconnect LiveKit room
      if (livekitRoomRef.current) {
        livekitRoomRef.current.disconnect();
        livekitRoomRef.current = null;
      }
      if (livekitAudioRef.current) {
        livekitAudioRef.current.pause();
        livekitAudioRef.current = null;
      }
    } else {
      if (wsRef.current?.readyState === WebSocket.OPEN && conversationId) {
        wsRef.current.send(JSON.stringify({ type: "end_call" }));
      }
    }
    cleanupConnection();
  }, [conversationId, transport]);

  const cleanupConnection = useCallback(() => {
    stopMediaRecorder();
    stopAudioLevelMonitor();
    stopMediaStream();
    closeWebSocket();
    // Clean up LiveKit refs
    if (livekitAudioRef.current) {
      livekitAudioRef.current.pause();
      livekitAudioRef.current = null;
    }
    updateStatus("idle");
  }, [stopAudioLevelMonitor, updateStatus]);

  const stopMediaRecorder = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
  };

  const stopMediaStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const closeWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  // ── Toggle Mute ──
  const toggleMute = useCallback(() => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted;
        setIsMuted(!isMuted);
      }
    }
  }, [isMuted]);

  // ── Scroll to bottom on new messages ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      cleanupConnection();
      if (livekitRoomRef.current) {
        livekitRoomRef.current.disconnect();
        livekitRoomRef.current = null;
      }
    };
  }, [cleanupConnection]);

  // ── Sentiment color ──
  const sentimentColor = sentiment
    ? sentiment.label === "very_positive" || sentiment.label === "positive"
      ? "bg-emerald-500"
      : sentiment.label === "negative" || sentiment.label === "very_negative"
      ? "bg-red-500"
      : "bg-zinc-400"
    : "bg-zinc-300";

  return (
    <div className="flex flex-col h-full">
      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <div
            className={`h-2.5 w-2.5 rounded-full ${
              status === "connected"
                ? "bg-emerald-500 animate-pulse"
                : status === "connecting"
                ? "bg-amber-500 animate-pulse"
                : status === "error"
                ? "bg-red-500"
                : "bg-zinc-400"
            }`}
          />
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {status === "idle"
              ? "Ready to call"
              : status === "connecting"
              ? "Connecting..."
              : status === "connected"
              ? "Connected"
              : status === "error"
              ? "Connection Error"
              : "Disconnected"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {livekitRoomName && (
            <Badge variant="outline" className="text-xs font-mono">
              <Radio className="h-3 w-3 mr-1" />
              {livekitRoomName}
            </Badge>
          )}

          {sentiment && (
            <Badge variant="outline" className="text-xs gap-1.5">
              <div className={`h-2 w-2 rounded-full ${sentimentColor}`} />
              {(sentiment.score * 100).toFixed(0)}% {sentiment.label.replace("_", " ")}
            </Badge>
          )}

          {conversationId && (
            <span className="text-xs text-zinc-400 font-mono">
              {conversationId.slice(0, 8)}...
            </span>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 && status === "idle" && (
          <div className="flex flex-col items-center justify-center h-full text-center text-zinc-400">
            <Phone className="h-12 w-12 mb-3 text-zinc-300 dark:text-zinc-600" />
            <p className="text-sm font-medium">Click &ldquo;Start Call&rdquo; to begin</p>
            <p className="text-xs mt-1">Your browser will request microphone access</p>
          </div>
        )}

        {messages.length === 0 && status === "connected" && (
          <div className="flex flex-col items-center justify-center h-full text-center text-zinc-400">
            <Loader2 className="h-8 w-8 animate-spin mb-3" />
            <p className="text-sm">Listening... speak to start the conversation</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "agent" && (
              <div className="h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center flex-shrink-0">
                <Bot className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white rounded-br-md"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-bl-md"
              }`}
            >
              {msg.content}
            </div>
            {msg.role === "user" && (
              <div className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0">
                <User className="h-4 w-4 text-zinc-500" />
              </div>
            )}
          </div>
        ))}

        {/* Live transcription */}
        {transcription && (
          <div className="flex gap-3 justify-end opacity-70">
            <div className="max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm bg-indigo-100 dark:bg-indigo-900/30 text-zinc-600 dark:text-zinc-400 italic">
              {transcription}
            </div>
          </div>
        )}

        {/* Live agent response streaming */}
        {agentResponse && (
          <div className="flex gap-3">
            <div className="h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center flex-shrink-0">
              <Bot className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-2.5 text-sm bg-indigo-50 dark:bg-indigo-950/30 text-zinc-900 dark:text-zinc-100 border border-indigo-200 dark:border-indigo-800">
              {agentResponse}
              <span className="inline-block w-1.5 h-4 bg-indigo-500 ml-0.5 animate-pulse" />
            </div>
          </div>
        )}

        {/* Speaking indicator */}
        {isAgentSpeaking && !agentResponse && (
          <div className="flex gap-3 items-center text-sm text-zinc-400">
            <Volume2 className="h-4 w-4 animate-pulse" />
            <span>Agent is speaking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Audio Level Indicator */}
      {status === "connected" && (
        <div className="px-4 py-1">
          <div className="h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all duration-100 rounded-full"
              style={{ width: `${Math.max(audioLevel * 100, 4)}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 p-4 border-t border-zinc-200 dark:border-zinc-800">
        {status === "idle" || status === "disconnected" || status === "error" ? (
          <Button
            onClick={startCall}
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full h-12 w-12"
            disabled={false}
          >
            <Phone className="h-5 w-5" />
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              size="icon"
              onClick={toggleMute}
              className={`rounded-full h-10 w-10 ${
                isMuted ? "bg-red-100 dark:bg-red-900/30 border-red-300" : ""
              }`}
            >
              {isMuted ? (
                <MicOff className="h-4 w-4 text-red-500" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>

            <Button
              onClick={endCall}
              variant="destructive"
              className="rounded-full h-12 w-12"
            >
              <PhoneOff className="h-5 w-5" />
            </Button>

            <div className="text-xs text-zinc-400 font-mono">
              {audioLevel > 0.05 ? (
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Speaking
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-zinc-400" />
                  Listening
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Utility: base64 to Blob ──
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteChars = atob(base64);
  const byteArrays: Uint8Array[] = [];
  const sliceSize = 512;

  for (let offset = 0; offset < byteChars.length; offset += sliceSize) {
    const slice = byteChars.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);

    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }

    byteArrays.push(new Uint8Array(byteNumbers));
  }

  return new Blob(byteArrays as BlobPart[], { type: mimeType });
}

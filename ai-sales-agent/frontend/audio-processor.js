// audio-processor.js
// AudioWorkletProcessor: PCM Capture + Int16 conversion + RMS analysis
// Replaces deprecated ScriptProcessorNode
// Runs on a dedicated audio thread (not main thread)

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._bufferLength = 0;
    this._targetFrames = 4096; // Match old ScriptProcessor buffer size
    this._sampleRate = 16000;

    this.port.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === 'configure') {
        if (msg.targetFrames) this._targetFrames = msg.targetFrames;
      } else if (msg.type === 'reset') {
        this._buffer = [];
        this._bufferLength = 0;
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    if (!input || !input.length || !input[0] || !input[0].length) {
      return true; // Keep alive, no input yet
    }

    const channelData = input[0]; // Float32Array, 128 frames per call

    // Store samples
    this._buffer.push(channelData);
    this._bufferLength += channelData.length;

    // When buffer is full, convert and send to main thread
    if (this._bufferLength >= this._targetFrames) {
      // Exact trim to targetFrames (avoid overflow from accumulated surplus)
      const totalFrames = this._targetFrames;
      const combined = new Float32Array(totalFrames);
      let offset = 0;
      for (const chunk of this._buffer) {
        const remaining = totalFrames - offset;
        if (remaining <= 0) break;
        const copyLen = Math.min(chunk.length, remaining);
        for (let i = 0; i < copyLen; i++) {
          combined[offset + i] = chunk[i];
        }
        offset += copyLen;
      }

      // Convert Float32 → Int16 PCM
      const pcm = new Int16Array(totalFrames);
      let sumSq = 0;
      for (let i = 0; i < totalFrames; i++) {
        const s = Math.max(-1, Math.min(1, combined[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        sumSq += s * s;
      }

      const rms = Math.sqrt(sumSq / totalFrames);

      // Send to main thread with transferable buffer (zero-copy)
      this.port.postMessage(
        {
          type: 'pcm',
          pcm: pcm.buffer,
          rms: rms,
          frames: totalFrames,
        },
        [pcm.buffer]
      );

      // Reset buffer — keep any leftover samples for next cycle
      this._buffer = [];
      this._bufferLength = 0;

      // If we accumulated more than targetFrames, the excess is lost.
      // That's acceptable — we match the same behavior as ScriptProcessor(4096).
    }

    return true; // Keep processor alive
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);

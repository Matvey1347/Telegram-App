import { afterEach, expect, it, vi } from "vitest";
import { recordingToPcmWav } from "./ai-posting-chat-voice";

afterEach(() => vi.unstubAllGlobals());

it("writes mono PCM16 WAV with resampling for a higher input sample rate", async () => {
  const close = vi.fn().mockResolvedValue(undefined);
  const channel = new Float32Array([1, -1, 0.5, -0.5]);
  vi.stubGlobal(
    "AudioContext",
    class {
      close = close;
      decodeAudioData = vi
        .fn()
        .mockResolvedValue({
          length: 4,
          sampleRate: 96000,
          numberOfChannels: 1,
          getChannelData: () => channel,
        });
    },
  );
  const wav = await recordingToPcmWav({
    arrayBuffer: async () => new ArrayBuffer(0),
  } as Blob);
  expect(wav.type).toBe("audio/wav");
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(wav);
  });
  const data = new DataView(bytes);
  expect(String.fromCharCode(...new Uint8Array(bytes, 0, 4))).toBe("RIFF");
  expect(data.getUint16(20, true)).toBe(1);
  expect(data.getUint16(22, true)).toBe(1);
  expect(data.getUint32(24, true)).toBe(48000);
  expect(data.getUint16(34, true)).toBe(16);
  expect(data.getUint32(40, true)).toBe(4);
  expect(data.getInt16(44, true)).toBe(32767);
  expect(data.getInt16(46, true)).toBe(16383);
  expect(close).toHaveBeenCalled();
});

it("rejects uploaded audio longer than 60 seconds without silently truncating", async () => {
  const close = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("AudioContext", class {
    close = close;
    decodeAudioData = vi.fn().mockResolvedValue({ length: 48000 * 61, sampleRate: 48000 });
  });
  await expect(recordingToPcmWav({ arrayBuffer: async () => new ArrayBuffer(0) } as Blob, { rejectLong: true })).rejects.toThrow("AUDIO_TOO_LONG");
  expect(close).toHaveBeenCalled();
});

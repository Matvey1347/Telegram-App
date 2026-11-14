/** Convert the browser recording to the PCM format accepted by transcription. */
export async function recordingToPcmWav(blob: Blob, options?: { rejectLong?: boolean }): Promise<File> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    if (options?.rejectLong && decoded.length / decoded.sampleRate > 60)
      throw new Error("AUDIO_TOO_LONG");
    const sampleRate = Math.max(16000, Math.min(48000, decoded.sampleRate));
    const samples = Math.floor(
      Math.min(decoded.length / decoded.sampleRate, 60) * sampleRate,
    );
    if (!samples) throw new Error("EMPTY_RECORDING");
    const bytes = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(bytes);
    const write = (offset: number, text: string) => {
      for (let i = 0; i < text.length; i++)
        view.setUint8(offset + i, text.charCodeAt(i));
    };
    write(0, "RIFF");
    view.setUint32(4, 36 + samples * 2, true);
    write(8, "WAVE");
    write(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, "data");
    view.setUint32(40, samples * 2, true);
    const channels = Array.from(
      { length: decoded.numberOfChannels },
      (_, index) => decoded.getChannelData(index),
    );
    for (let i = 0; i < samples; i++) {
      const sourceIndex = (i * decoded.sampleRate) / sampleRate;
      const left = Math.floor(sourceIndex);
      const right = Math.min(left + 1, decoded.length - 1);
      const fraction = sourceIndex - left;
      const sample =
        channels.reduce(
          (sum, channel) =>
            sum + channel[left] * (1 - fraction) + channel[right] * fraction,
          0,
        ) / channels.length;
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(
        44 + i * 2,
        clamped < 0 ? clamped * 32768 : clamped * 32767,
        true,
      );
    }
    return new File([bytes], "voice.wav", { type: "audio/wav" });
  } finally {
    await context.close();
  }
}

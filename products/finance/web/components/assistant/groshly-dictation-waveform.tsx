import { useEffect, useRef } from "react";

const BAR_COUNT = 18;
const BAR_INTERVAL_MS = 60;

export function GroshlyDictationWaveform() {
  const waveform = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!window.AudioContext || !navigator.mediaDevices?.getUserMedia) return;
    const bars = Array.from(waveform.current?.querySelectorAll("rect") ?? []);
    let active = true;
    let frame = 0;
    let context: AudioContext | undefined;
    let stream: MediaStream | undefined;

    async function start() {
      try {
        const audio = new AudioContext();
        context = audio;
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        await audio.resume();
        if (!active) return;
        const analyser = audio.createAnalyser();
        analyser.fftSize = 512;
        audio.createMediaStreamSource(stream).connect(analyser);
        const samples = new Uint8Array(analyser.fftSize);
        const levels: number[] = [];
        let lastSample = -Infinity;

        function draw(now: number) {
          if (now - lastSample >= BAR_INTERVAL_MS) {
            lastSample = now;
            analyser.getByteTimeDomainData(samples);
            const rms = Math.sqrt(samples.reduce((sum, byte) =>
              sum + ((byte - 128) / 128) ** 2, 0) / samples.length);
            levels.push(Math.min(1, Math.max(0, rms - 0.012) * 8));
            if (levels.length > BAR_COUNT) levels.shift();
            bars.forEach((bar, index) => {
              const height = 3 + 21 * (levels[index - BAR_COUNT + levels.length] ?? 0);
              bar.setAttribute("y", String((28 - height) / 2));
              bar.setAttribute("height", String(height));
            });
          }
          frame = window.requestAnimationFrame(draw);
        }

        frame = window.requestAnimationFrame(draw);
      } catch {
        // The browser's recognition session can still provide a transcript.
        stream?.getTracks().forEach((track) => track.stop());
        if (context && context.state !== "closed") void context.close().catch(() => undefined);
      }
    }

    void start();
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      if (context && context.state !== "closed") void context.close().catch(() => undefined);
    };
  }, []);

  return (
    <svg ref={waveform} viewBox="0 0 108 28" className="groshly-dictation-waveform" aria-hidden="true">
      {Array.from({ length: BAR_COUNT }, (_, index) => (
        <rect key={index} x={index * 6 + 2} y={12.5} width={2} height={3} rx={1} fill="currentColor" />
      ))}
    </svg>
  );
}

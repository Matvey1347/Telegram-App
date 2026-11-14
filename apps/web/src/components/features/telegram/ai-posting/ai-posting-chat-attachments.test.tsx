import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AiPostingChatAttachments } from "./ai-posting-chat-attachments";

const encode = vi.hoisted(() => vi.fn());
vi.mock("./ai-posting-chat-voice", () => ({ recordingToPcmWav: encode }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("records a voice note, encodes it to WAV and releases the microphone", async () => {
  const stopTrack = vi.fn();
  const media = {
    getUserMedia: vi
      .fn()
      .mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }),
  };
  Object.defineProperty(navigator, "mediaDevices", {
    value: media,
    configurable: true,
  });
  class Recorder {
    static isTypeSupported() {
      return true;
    }
    state = "inactive";
    mimeType = "audio/webm";
    ondataavailable?: (event: { data: Blob }) => void;
    onstop?: () => void;
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({
        data: new Blob(["test"], { type: "audio/webm" }),
      });
      this.onstop?.();
    }
  }
  vi.stubGlobal("MediaRecorder", Recorder);
  const result = new File(["wave"], "voice.wav", { type: "audio/wav" });
  encode.mockResolvedValueOnce(result);
  const onChange = vi.fn();
  render(<AiPostingChatAttachments file={null} onChange={onChange} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Записать голосовое сообщение" }),
  );
  const stop = await screen.findByRole("button", { name: "Остановить запись" });
  fireEvent.click(stop);
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(result));
  expect(stopTrack).toHaveBeenCalled();
  expect(encode).toHaveBeenCalledOnce();
});

it("explains microphone permission failure without creating a file", async () => {
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: vi.fn().mockRejectedValue(new Error("denied")) },
    configurable: true,
  });
  vi.stubGlobal("MediaRecorder", class {});
  const onChange = vi.fn();
  render(<AiPostingChatAttachments file={null} onChange={onChange} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Записать голосовое сообщение" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Не удалось получить доступ к микрофону",
  );
  expect(onChange).not.toHaveBeenCalled();
});

it("converts a selected MP3 to canonical WAV before attaching", async () => {
  const wav = new File(["canonical"], "voice.wav", { type: "audio/wav" });
  encode.mockResolvedValueOnce(wav);
  const onChange = vi.fn();
  const onRecordingChange = vi.fn();
  render(<AiPostingChatAttachments file={null} onChange={onChange} onRecordingChange={onRecordingChange} />);
  const input = screen.getByLabelText("Выбрать изображение или аудио");
  const mp3 = new File(["bytes"], "note.mp3", { type: "audio/mpeg" });
  fireEvent.change(input, { target: { files: [mp3] } });
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(wav));
  expect(encode).toHaveBeenCalledWith(mp3, { rejectLong: true });
  expect(onRecordingChange).toHaveBeenCalledWith(true);
});

it("rejects long or undecodable audio without discarding the existing attachment", async () => {
  encode.mockRejectedValueOnce(new Error("AUDIO_TOO_LONG"));
  const onChange = vi.fn();
  render(<AiPostingChatAttachments file={null} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText("Выбрать изображение или аудио"), { target: { files: [new File(["x"], "long.ogg", { type: "audio/ogg" })] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("не длиннее 60 секунд");
  expect(onChange).not.toHaveBeenCalled();
});

it("does not attach a result after the component was unmounted", async () => {
  let finish!: (value: File) => void;
  encode.mockImplementationOnce(() => new Promise<File>((resolve) => { finish = resolve; }));
  const onChange = vi.fn();
  const view = render(<AiPostingChatAttachments file={null} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText("Выбрать изображение или аудио"), { target: { files: [new File(["x"], "note.webm", { type: "audio/webm" })] } });
  view.unmount();
  finish(new File(["x"], "voice.wav", { type: "audio/wav" }));
  await Promise.resolve();
  expect(onChange).not.toHaveBeenCalled();
});

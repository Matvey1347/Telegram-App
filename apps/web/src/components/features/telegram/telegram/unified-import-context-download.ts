import { TELEGRAM_UNIFIED_IMPORT_INSTRUCTION } from "@telegram-system/shared";

const UNIFIED_IMPORT_CONTEXT_SEPARATOR =
  "\n\nПОЛНЫЙ КОНТЕКСТ КАНАЛА\n\n";

async function readBlobText(blob: Blob) {
  if (typeof blob.text === "function") return blob.text();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsText(blob);
  });
}

export async function withCurrentUnifiedImportInstruction(blob: Blob) {
  const downloadedText = await readBlobText(blob);
  if (downloadedText.startsWith(TELEGRAM_UNIFIED_IMPORT_INSTRUCTION)) {
    return blob;
  }
  const separatorIndex = downloadedText.indexOf(
    UNIFIED_IMPORT_CONTEXT_SEPARATOR,
  );
  const contextText =
    separatorIndex >= 0
      ? downloadedText.slice(
          separatorIndex + UNIFIED_IMPORT_CONTEXT_SEPARATOR.length,
        )
      : downloadedText;
  return new Blob(
    [
      TELEGRAM_UNIFIED_IMPORT_INSTRUCTION,
      UNIFIED_IMPORT_CONTEXT_SEPARATOR,
      contextText,
    ],
    { type: "text/plain;charset=utf-8" },
  );
}

export function safeTelegramChannelExportName(value: string) {
  return (
    value
      .trim()
      .replace(/^@/, "")
      .replace(/[^a-zA-Z0-9а-яА-ЯёЁ._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "telegram-channel"
  );
}

export function downloadTelegramChannelExport(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

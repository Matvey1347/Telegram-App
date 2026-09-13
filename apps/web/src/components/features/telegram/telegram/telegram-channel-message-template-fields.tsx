"use client";

const fields = [
  ["Emoji", "{{emoji}}"],
  ["Channel title", "{{title}}"],
  ["Username", "{{username}}"],
  ["Invite link", "{{invite_link}}"],
  ["TgStat URL", "{{tgstat_url}}"],
  ["Product name", "{{product_name}}"],
  ["Product price", "{{product_price}}"],
  ["Currency", "{{product_currency}}"],
] as const;

const buttonClass =
  "rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-300 hover:border-blue-600 hover:text-white";

export function TelegramChannelMessageTemplateFields({
  onInsert,
}: {
  onInsert: (value: string) => void;
}) {
  return (
    <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Template fields">
      {fields.map(([label, token]) => (
        <button
          key={token}
          type="button"
          className={buttonClass}
          title={`Insert ${token}`}
          onClick={() => onInsert(token)}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        className={buttonClass}
        onClick={() =>
          onInsert("\n{{#channels}}\nChannel content\n\n{{/channels}}")
        }
      >
        Channel loop
      </button>
      <button
        type="button"
        className={buttonClass}
        onClick={() =>
          onInsert(
            "\n{{#products}}\n{{product_name}} — **{{product_price}} {{product_currency}}**\n{{/products}}",
          )
        }
      >
        Product loop
      </button>
    </div>
  );
}

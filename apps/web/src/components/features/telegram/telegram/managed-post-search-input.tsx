
import { Search } from "lucide-react";
import { Input } from "@/components/ui/primitives";
import { useI18n } from "@/providers/i18n-provider";

export function ManagedPostSearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <label className="relative mb-3 block">
      <span className="sr-only">{t("telegram.posts.search.label")}</span>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
        size={16}
      />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("telegram.posts.search.placeholder")}
        className="pl-9"
      />
    </label>
  );
}

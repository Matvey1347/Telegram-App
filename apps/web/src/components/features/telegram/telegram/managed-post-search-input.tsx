import { Search } from "lucide-react";
import { Input } from "@/components/ui/primitives";

export function ManagedPostSearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative mb-3 block">
      <span className="sr-only">Search posts</span>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
        size={16}
      />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search title, text, group or member"
        className="pl-9"
      />
    </label>
  );
}

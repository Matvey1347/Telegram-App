import { FormField, Input } from "@/components/ui/primitives";
import type { AiPostingSphere } from "./ai-posting-content-model";

export function AiPostingSphereWeights({ spheres, weights, onChange }: {
  spheres: AiPostingSphere[];
  weights: Record<string, number>;
  onChange: (weights: Record<string, number>) => void;
}) {
  const roots = spheres.filter((sphere) => !sphere.parentId && sphere.name.trim());
  if (roots.length < 2) return null;
  return <details className="rounded-lg border border-neutral-800 p-3">
    <summary className="cursor-pointer text-sm font-medium">Соотношение сфер</summary>
    <p className="py-2 text-xs text-neutral-400">
      Вес задаёт относительную частоту. Веса 60 и 30 дают соотношение 2 к 1. При активных весах пустое поле означает 1, а 0 исключает сферу. Без положительных весов действует стандартное чередование.
    </p>
    <div className="grid gap-2 sm:grid-cols-2">
      {roots.map(({ id, name }) => <FormField key={id} label={name}>
        <Input type="number" min={0} max={100} step={1} value={weights[id] ?? ""}
          onChange={(event) => {
            const next = { ...weights };
            const value = event.currentTarget.valueAsNumber;
            if (event.currentTarget.value === "") delete next[id];
            else if (Number.isInteger(value) && value >= 0 && value <= 100) next[id] = value;
            else return;
            onChange(next);
          }}
        />
      </FormField>)}
    </div>
  </details>;
}

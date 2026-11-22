export function FormSectionNumber({ children }: { children: string }) {
  return (
    <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-blue-950/60 text-sm font-semibold text-blue-300">
      {children}
    </span>
  );
}

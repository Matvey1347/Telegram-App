import Link from "next/link";
import type { ReactNode } from "react";
import { SystemBrandLogo } from "@/components/layout/system-brand-logo";
import { SYSTEM_BRAND } from "@/lib/app-brand";

export function AuthShell({ title, description, children, footer }: { title: string; description: string; children: ReactNode; footer: ReactNode }) {
  return (
    <main className="grid min-h-screen bg-neutral-950 text-neutral-100 lg:grid-cols-[minmax(340px,0.85fr)_minmax(480px,1.15fr)]">
      <section className="relative hidden overflow-hidden border-r border-neutral-800 bg-neutral-900/55 p-10 lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden="true" className="absolute -left-32 top-1/3 size-96 rounded-full bg-blue-600/10 blur-3xl" />
        <Link href="/" className="relative z-10 inline-flex w-fit">
          <SystemBrandLogo />
        </Link>
        <div className="relative z-10 max-w-md">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">{SYSTEM_BRAND.tagline}</p>
          <h2 className="mt-4 text-3xl font-semibold leading-tight text-white">One workspace for Telegram operations.</h2>
          <p className="mt-4 max-w-sm text-sm leading-6 text-neutral-400">Channels, advertising, finance and team workflows under the Nexeloq brand.</p>
        </div>
        <p className="relative z-10 text-xs text-neutral-600">© Nexeloq</p>
      </section>
      <section className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-8"><div className="w-full max-w-md">
        <Link href="/" className="mb-8 inline-flex lg:hidden"><SystemBrandLogo /></Link>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-5 shadow-2xl shadow-black/20 sm:p-7"><h1 className="text-2xl font-semibold text-white">{title}</h1><p className="mt-2 text-sm leading-6 text-neutral-400">{description}</p><div className="mt-6">{children}</div><div className="mt-6 border-t border-neutral-800 pt-5 text-sm text-neutral-400">{footer}</div></div>
      </div></section>
    </main>
  );
}

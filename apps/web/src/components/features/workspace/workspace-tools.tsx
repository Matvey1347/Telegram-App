import Link from "next/link";
import { ArrowUpRight, CalendarClock, ShieldCheck, Trash2 } from "lucide-react";
import type { EffectiveWorkspaceAccess } from "@telegram-system/shared";

type WorkspaceToolsProps = {
  role?: "owner" | "admin" | "MEDIA_BUYER" | "member";
  access?: EffectiveWorkspaceAccess;
};

const tools = [
  {
    key: "roles",
    href: "/roles",
    title: "Roles & access",
    description: "Manage workspace roles, permissions and access levels.",
    icon: ShieldCheck,
  },
  {
    key: "scheduled",
    href: "/scheduled-tasks",
    title: "Scheduled tasks",
    description: "Review and configure workspace automation schedules.",
    icon: CalendarClock,
  },
  {
    key: "trash",
    href: "/trash",
    title: "Trash",
    description: "Restore recently deleted workspace records.",
    icon: Trash2,
  },
] as const;

export function WorkspaceTools({ role, access }: WorkspaceToolsProps) {
  const legacyAdmin = role === "owner" || role === "admin";
  const isOwner = access?.isOwner ?? role === "owner";
  const permissions = new Set(access?.permissionKeys ?? []);
  const features = new Set(access?.featureIds ?? []);
  const canUseOperations = access ? features.has("operations") : legacyAdmin;
  const visibleTools = tools.filter((tool) => {
    if (tool.key === "roles") {
      return isOwner || permissions.has("members.assignRoles") || legacyAdmin;
    }
    if (tool.key === "trash") {
      return canUseOperations && (isOwner || permissions.has("operations.restoreTrash") || legacyAdmin);
    }
    return canUseOperations;
  });

  if (!visibleTools.length) return null;
  return (
    <section aria-labelledby="workspace-tools-title">
      <div className="mb-3">
        <h2 id="workspace-tools-title" className="text-lg font-semibold text-white">
          Workspace tools
        </h2>
        <p className="mt-1 text-sm text-neutral-400">
          Administration, automation and recovery are collected here.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {visibleTools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.key}
              href={tool.href}
              className="group flex min-h-32 flex-col rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4 transition hover:border-blue-700/70 hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="rounded-xl border border-neutral-700 bg-neutral-950 p-2 text-blue-300">
                  <Icon size={19} aria-hidden="true" />
                </span>
                <ArrowUpRight
                  size={17}
                  aria-hidden="true"
                  className="text-neutral-500 transition group-hover:text-blue-300"
                />
              </div>
              <strong className="mt-4 text-sm text-white">{tool.title}</strong>
              <span className="mt-1 text-xs leading-5 text-neutral-400">
                {tool.description}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

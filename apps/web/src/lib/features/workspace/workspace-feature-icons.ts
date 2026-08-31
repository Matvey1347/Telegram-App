import {
  Bot,
  BriefcaseBusiness,
  Clock3,
  Gauge,
  Landmark,
  Megaphone,
  RadioTower,
  Send,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export const workspaceFeatureIcons: Record<string, LucideIcon> = {
  dashboard: Gauge,
  channels: RadioTower,
  posts: Send,
  bots: Bot,
  systemBots: Bot,
  "adSales.sales": BriefcaseBusiness,
  "adSales.crm": BriefcaseBusiness,
  advertising: Megaphone,
  finance: Landmark,
  members: ShieldCheck,
  workspace: Settings,
  operations: Clock3,
};

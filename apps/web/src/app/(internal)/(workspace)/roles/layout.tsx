import type { Metadata } from "next";

export const metadata: Metadata = { title: "Roles & access · Nexeloq" };

export default function RolesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

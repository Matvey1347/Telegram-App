"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { PublicationSchedulesModal } from "./publication-schedules-modal";

export function PublicationSchedulesAction() {
  const [open, setOpen] = useState(false);
  return <>
    <Button type="button" variant="secondary" onClick={() => setOpen(true)} className="inline-flex items-center gap-2">
      <CalendarClock size={16} /> Schedules
    </Button>
    {open ? <PublicationSchedulesModal onClose={() => setOpen(false)} /> : null}
  </>;
}

"use client";

import { createContext } from "react";

/** A native top-layer host supplies its actual node after commit, without DOM polling. */
export const OverlayPortalContext = createContext<HTMLElement | null>(null);

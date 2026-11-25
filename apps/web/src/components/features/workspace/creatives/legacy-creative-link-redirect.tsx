"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  creativeLibraryPath,
  parseCreativeLinkHash,
} from "@/lib/features/workspace/creative-link";

export function LegacyCreativeLinkRedirect() {
  const router = useRouter();

  useEffect(() => {
    const redirect = () => {
      const { hash } = window.location;
      if (parseCreativeLinkHash(hash))
        router.replace(`${creativeLibraryPath}${hash}`);
    };
    redirect();
    window.addEventListener("hashchange", redirect);
    return () => window.removeEventListener("hashchange", redirect);
  }, [router]);

  return null;
}

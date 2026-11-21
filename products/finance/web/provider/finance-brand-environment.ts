"use client";

import { createContext, useContext } from "react";

export const FinanceBrandEnvironment = createContext(false);

export function useFinanceBrandDevelopment() {
  return useContext(FinanceBrandEnvironment);
}

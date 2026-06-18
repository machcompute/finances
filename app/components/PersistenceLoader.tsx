"use client";

import { useEffect } from "react";
import { hydratePersistedState } from "../lib/transactions";

export function PersistenceLoader() {
  useEffect(() => {
    hydratePersistedState();
  }, []);
  return null;
}

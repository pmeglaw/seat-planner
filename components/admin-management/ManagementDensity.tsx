"use client";

import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";

const COMPACT_QUERY = "(min-width: 1056px) and (pointer: fine)";
const RowHeightContext = createContext(32);

/** Fixed compact layout, with larger targets on narrow or touch screens.
 * Keep virtualized row estimates synchronized with the CSS media query. */
export function ManagementDensityProvider({ children }: { children: ReactNode }) {
  const [rowHeight, setRowHeight] = useState(32);
  useLayoutEffect(() => {
    const query = window.matchMedia(COMPACT_QUERY);
    const sync = () => setRowHeight(query.matches ? 32 : 48);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return (
    <RowHeightContext.Provider value={rowHeight}>
      <div className="sp-management-density flex min-h-0 min-w-0 flex-1 flex-col">
        {children}
      </div>
    </RowHeightContext.Provider>
  );
}

export const useManagementRowHeight = () => useContext(RowHeightContext);

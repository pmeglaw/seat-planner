"use client";

import { createContext, useContext, useId, useLayoutEffect, useState, type ReactNode } from "react";

export type ManagementDensity = "normal" | "compact";
const COMPACT_QUERY = "(min-width: 1056px) and (pointer: fine)";
const DensityContext = createContext<{ density: ManagementDensity; compactAvailable: boolean; setDensity: (density: ManagementDensity) => void }>({
  density: "normal" as ManagementDensity,
  compactAvailable: false,
  setDensity: () => {}
});

/** A display preference only. The cookie lets streaming/loading use the same
 * geometry as the table before hydration; it contains no office records. */
export function ManagementDensityProvider({ initialDensity = "normal", children }: {
  initialDensity?: ManagementDensity;
  children: ReactNode;
}) {
  const [preferred, setPreferred] = useState(initialDensity);
  const [compactAvailable, setCompactAvailable] = useState(false);
  useLayoutEffect(() => {
    const query = window.matchMedia(COMPACT_QUERY);
    const sync = () => setCompactAvailable(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  function setDensity(value: ManagementDensity) {
    setPreferred(value);
    try {
      document.cookie = `sp-management-density=${value}; Path=/admin/management; Max-Age=31536000; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
    } catch { /* A blocked preference never blocks the directory. */ }
  }
  return (
    <DensityContext.Provider value={{ density: compactAvailable ? preferred : "normal", compactAvailable, setDensity }}>
      <div className="sp-management-density flex min-h-0 min-w-0 flex-1 flex-col" data-density={preferred}>
        {children}
      </div>
    </DensityContext.Provider>
  );
}

export const useManagementDensity = () => useContext(DensityContext);

export function ManagementDensityControl() {
  const { density, compactAvailable, setDensity } = useManagementDensity();
  const id = useId();
  return (
    <fieldset className="sp-density" aria-describedby={!compactAvailable ? `${id}-help` : undefined}>
      <legend>Density</legend>
      <div className="sp-density-options">
        {(["normal", "compact"] as const).map(value => (
          <label key={value} className="sp-density-choice">
            <input type="radio" name={id} value={value} checked={density === value}
              disabled={value === "compact" && !compactAvailable} onChange={() => setDensity(value)} />
            <span className="sp-density-content">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true" focusable="false">
                {value === "normal"
                  ? <path d="M2 3.5h12v3H2zM2 9.5h12v3H2z" />
                  : <path d="M2 3h12M2 6.5h12M2 10h12M2 13.5h12" />}
              </svg>
              {value === "normal" ? "Normal" : "Compact"}
            </span>
          </label>
        ))}
      </div>
      {!compactAvailable && <span id={`${id}-help`} className="sp-density-help">Compact is available on larger screens with a mouse or trackpad.</span>}
    </fieldset>
  );
}

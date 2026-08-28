import { FloorSelector } from "seat-planner";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

// APG menu-button floor switcher. "canvas" is the light floating card on the
// map stage; "chrome" restyles it for the dark AppTopBar center slot. The
// open state is internal, so the menu cells click the trigger on mount to
// photograph the menu (Floor 3 checked, Floor 2 tagged SOON).

const noop = () => {};

const AutoOpen = ({ children }: { children: ReactNode }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button[aria-haspopup='menu']")?.click();
  }, []);
  return <div ref={ref}>{children}</div>;
};

const CanvasCell = ({ label, minHeight = 72, children }: { label: string; minHeight?: number; children: ReactNode }) => (
  <div style={{ display: "grid", gap: 4 }}>
    <div
      className="admin-theme"
      style={{
        display: "flex",
        alignItems: "flex-start",
        width: 320,
        minHeight,
        background: "var(--sp-background)",
        border: "1px solid #E7E1D8",
        padding: 16
      }}
    >
      {children}
    </div>
    <span style={{ fontSize: 11, color: "#6b6257", fontFamily: "var(--font-mono)" }}>{label}</span>
  </div>
);

// Chrome cells sit the trigger in a 40px dark top-bar strip like AppTopBar's
// center slot; the tall variant leaves canvas room below for the menu. 400px
// wide, not 320: the menu is `absolute left-0` off a centre-slot trigger and
// min-w-[230px], so a 320px strip pushed it out past the cell border.
const ChromeCell = ({ label, menuRoom = 0, children }: { label: string; menuRoom?: number; children: ReactNode }) => (
  <div style={{ display: "grid", gap: 4 }}>
    <div className="admin-theme" style={{ width: 400, border: "1px solid #E7E1D8", background: "var(--sp-background)", paddingBottom: menuRoom }}>
      <div
        className="sp-zone-chrome"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 40,
          background: "var(--sp-background)",
          padding: "0 12px"
        }}
      >
        {children}
      </div>
    </div>
    <span style={{ fontSize: 11, color: "#6b6257", fontFamily: "var(--font-mono)" }}>{label}</span>
  </div>
);

export const CanvasTrigger = () => (
  <CanvasCell label="canvas trigger — full floor label">
    <FloorSelector floor="3" onChange={noop} />
  </CanvasCell>
);

export const CanvasMenuOpen = () => (
  <CanvasCell label="canvas menu — Floor 3 checked, Floor 2 SOON" minHeight={210}>
    <AutoOpen>
      <FloorSelector floor="3" onChange={noop} />
    </AutoOpen>
  </CanvasCell>
);

export const ChromeTrigger = () => (
  <ChromeCell label="chrome trigger — short label in dark top bar">
    <FloorSelector floor="3" onChange={noop} variant="chrome" />
  </ChromeCell>
);

export const ChromeMenuOpen = () => (
  <ChromeCell label="chrome menu — dark elevated surface" menuRoom={130}>
    <AutoOpen>
      <FloorSelector floor="3" onChange={noop} variant="chrome" />
    </AutoOpen>
  </ChromeCell>
);

import { SeatSheetNotice } from "seat-planner";

// The sheet-voiced empty states of /my-seat: same drawing frame and title
// block, a notice where the plan detail would be. Copy mirrors the two real
// cases the page handles — signed in but not in the published directory, and
// in the directory with no seat on the published map.

// Same reason as the SeatSheet preview: the sheet animates itself in, and
// headless capture freezes CSS animations on their first frame (opacity 0).
// These are the component's own reduced-motion rules, applied unconditionally.
const SETTLED_CSS = `
.mss-sheet svg .mss-draw,
.mss-sheet svg .mss-settle,
.mss-sheet .mss-info > *,
.mss-sheet .mss-notice > *,
.mss-sheet .mss-title-block {
  animation: none !important;
  stroke-dashoffset: 0 !important;
  opacity: 1 !important;
  transform: none !important;
}`;

export const NoDirectoryMatch = () => (
  <>
    <style>{SETTLED_CSS}</style>
    <SeatSheetNotice
      heading="No seat on file for this account"
      detail="We could not match your sign-in address to anyone in the published directory. Ask an administrator to add you, then reload this sheet."
      issuedFor="ani.sarkisian@megeredchianlaw.com"
    />
  </>
);

export const NotYetSeated = () => (
  <>
    <style>{SETTLED_CSS}</style>
    <SeatSheetNotice
      heading="You are in the directory, but not yet seated"
      detail="Your record exists on the published map with no desk assigned. The sheet fills in as soon as an administrator assigns you a seat and publishes."
      issuedFor="Ani Sarkisian"
    />
  </>
);

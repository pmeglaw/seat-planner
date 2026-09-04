// One bundle for the in-shell viewer test: AppShell and ViewerSeatFinder must
// share the SAME module instance of AppShell's contexts, so both are exported
// from one entry instead of bundled twice (two bundles = two context objects
// = the viewer's registration silently no-ops).
export { AppShell } from "@/components/ui/AppShell";
export { ViewerSeatFinder } from "@/components/seat-map/ViewerSeatFinder";

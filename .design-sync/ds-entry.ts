// design-sync bundle entry — the deliberate Shell DS surface for
// claude.ai/design (window.SeatPlanner.*). Explicit so the canonical Button
// (design-system.tsx) wins over the admin-surface Button in ui/Button.tsx —
// a star-export of both files would silently drop the name (ES conflict rule).

// Primitives
export { Button, IconButton, StatusBadge, cx, focusRingClass } from "../components/ui/design-system";
export { CloseIcon } from "../components/ui/CloseIcon";

// App chrome
export { AppShell } from "../components/ui/AppShell";
export { AppRail } from "../components/ui/AppRail";
export { AppTopBar } from "../components/ui/AppTopBar";
export { AccountMenu } from "../components/ui/AccountMenu";

// Auth
export { LoginForm } from "../components/auth/LoginForm";
export { UpdatePasswordForm } from "../components/auth/UpdatePasswordForm";

// Seat map
export { SeatMap } from "../components/seat-map/SeatMap";
export { SeatMarker } from "../components/seat-map/SeatMarker";
export { SeatInspector } from "../components/seat-map/SeatInspector";
export { FilterPanel } from "../components/seat-map/FilterPanel";
export { ResultsPanel } from "../components/seat-map/ResultsPanel";
export { FloorSelector } from "../components/seat-map/FloorSelector";
export { MapStatusBand } from "../components/seat-map/MapStatusBand";
export { NamesVisibilityToggle } from "../components/seat-map/NamesVisibilityToggle";
export { SeatSheet, SeatSheetNotice } from "../components/seat-map/SeatSheet";
export { MapWashLayer } from "../components/seat-map/MapWashLayer";
export { MapZoomControl } from "../components/seat-map/MapZoomControl";
export { DeptChipRow } from "../components/seat-map/DeptChipRow";
export { AiHighlightChip } from "../components/seat-map/AiHighlightChip";
export { DraftTrailOverlay } from "../components/seat-map/DraftTrailOverlay";
export { AskPlannerDrawer } from "../components/seat-map/AskPlannerDrawer";
export { ViewerFindPalette } from "../components/seat-map/ViewerFindPalette";
export { ViewerSeatFinder } from "../components/seat-map/ViewerSeatFinder";
export {
  VacateConfirmDialog,
  DeleteSeatConfirmDialog,
  PublishReviewDialog,
  DiscardDraftDialog,
  InspectorGuardDialog,
  SwapConfirmDialog,
  MoveEmployeeConfirmDialog
} from "../components/seat-map/SeatMapDialogs";

// Reception
export { ReceptionScreen } from "../components/reception/ReceptionScreen";
export { ThemeToggle } from "../components/reception/ThemeToggle";

// Admin
export { AdminManagementPanel } from "../components/admin-management/AdminManagementPanel";
export { DataUtilitiesPanel } from "../components/admin-settings/DataUtilitiesPanel";

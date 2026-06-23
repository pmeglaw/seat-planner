export type ColorToken = {
  name: string;
  value: string;
  usage: string;
  contrast: string;
};

export type TypeSpec = {
  name: string;
  sample: string;
  className: string;
  usage: string;
};

export type MarkerState = {
  name: string;
  label: string;
  sublabel?: string;
  className: string;
  note: string;
  aria: string;
};

export type SearchState = {
  state: string;
  title: string;
  meta: string;
  label: string;
  tone: string;
};

export type PanelState = {
  title: string;
  subtitle: string;
  footer: string;
  tone: string;
};

export const colorGroups: { title: string; note: string; colors: ColorToken[] }[] = [
  {
    title: "Megeredchian Orange System",
    note: "No approved Megeredchian Law logo asset exists in the repo, so this board keeps the existing app-orange accent as a fallback and uses a deeper accessible orange for primary actions.",
    colors: [
      { name: "brand ivory", value: "#FFF7ED", usage: "Warm selected and brand-tinted surfaces", contrast: "Use with graphite text." },
      { name: "brand paper", value: "#F6E7D8", usage: "Primary hover field and quiet brand background", contrast: "Use with charcoal text." },
      { name: "brand copper", value: "#D46A24", usage: "Accent line, focus halo, small visual emphasis", contrast: "Use dark text on soft fills." },
      { name: "orange 500 accent", value: "#F97316", usage: "Existing app accent token only; not the default normal-size white-text button fill.", contrast: "Pair with charcoal 950 text when used behind text." },
      { name: "accessible primary orange", value: "#C2410C", usage: "Default primary-action fill.", contrast: "Meets normal-size button contrast with white text." },
      { name: "pressed burnt orange", value: "#9A3412", usage: "Pressed primary action and high-emphasis brand text", contrast: "White text." },
      { name: "deep clay orange", value: "#6F2C13", usage: "High-emphasis text on pale orange surfaces", contrast: "Use sparingly." }
    ]
  },
  {
    title: "Graphite And Charcoal",
    note: "Graphite keeps the app precise and professional without defaulting to generic navy.",
    colors: [
      { name: "graphite 50", value: "#F7F6F2", usage: "Soft panel fill", contrast: "Dark text required." },
      { name: "stone 100", value: "#E7E1D8", usage: "Dividers and disabled fills", contrast: "Use with graphite text." },
      { name: "stone 300", value: "#B8AEA2", usage: "Muted metadata", contrast: "Not for small body on white." },
      { name: "graphite 500", value: "#696159", usage: "Body and helper text", contrast: "Safe on warm white." },
      { name: "graphite 700", value: "#353532", usage: "Panel titles and strong text", contrast: "Safe on light surfaces." },
      { name: "charcoal 850", value: "#171A1D", usage: "Workspace chrome and primary text", contrast: "Use light text." },
      { name: "charcoal 950", value: "#070A0D", usage: "Deep app frame", contrast: "Use white or ivory." }
    ]
  },
  {
    title: "Warm Neutral Surfaces",
    note: "Warm ivory, paper, and stone create Apple-like clarity without cold enterprise gray.",
    colors: [
      { name: "ivory canvas", value: "#F8F3EA", usage: "Page canvas", contrast: "Charcoal 850 text." },
      { name: "paper surface", value: "#FFFDF8", usage: "Panels and controls", contrast: "Charcoal 850 text." },
      { name: "stone workspace", value: "#ECE7DE", usage: "Map-adjacent workspace", contrast: "Charcoal 850 text." },
      { name: "raised paper", value: "#FFFFFF", usage: "Sheets and high-priority panels", contrast: "Charcoal 850 text." },
      { name: "warm border", value: "#DED6CA", usage: "Default border", contrast: "Structural only." },
      { name: "strong stone border", value: "#BEB4A8", usage: "Selected and raised boundary", contrast: "Structural only." }
    ]
  },
  {
    title: "Muted Semantic States",
    note: "Semantic color is architectural and paired with labels, icons, copy, and shape. Orange remains the brand accent, not every state.",
    colors: [
      { name: "selected / brand", value: "#C2410C", usage: "Current task, selected result, primary action", contrast: "White text on the solid fill." },
      { name: "published / success", value: "#3F6F59", usage: "Published, saved, complete", contrast: "Use forest text on eucalyptus fill." },
      { name: "draft / warning", value: "#9A6418", usage: "Draft status, caution", contrast: "Use ochre text on warm straw fill." },
      { name: "destructive / danger", value: "#963D2F", usage: "Delete, vacate risk, failed publish", contrast: "Use white text on brick fill." },
      { name: "informational", value: "#3E6F72", usage: "Viewer impact, neutral guidance", contrast: "Use slate-teal text on pale teal fill." },
      { name: "search result", value: "#2F6668", usage: "Mapped search target", contrast: "Use slate-teal text on pale teal fill." },
      { name: "planner support", value: "#6E655A", usage: "Ask Planner support and assistant highlight", contrast: "Use graphite text on soft stone fill." },
      { name: "disabled", value: "#C9C0B4", usage: "Unavailable controls", contrast: "Pair with graphite 500 text." }
    ]
  }
];

export const typeScale: TypeSpec[] = [
  { name: "Product title", sample: "Office Seat Planner", className: "text-3xl font-extrabold leading-tight", usage: "Product shell identity, never oversized hero treatment." },
  { name: "Page title", sample: "Component State Board", className: "text-2xl font-bold leading-tight", usage: "Top-level route headings." },
  { name: "Section title", sample: "Seat Marker System", className: "text-xl font-bold leading-snug", usage: "Major board sections and workflow groups." },
  { name: "Panel title", sample: "Planning inspector", className: "text-base font-semibold leading-snug", usage: "Inspector, sheet, and drawer headers." },
  { name: "Seat label", sample: "W09", className: "text-sm font-semibold leading-none", usage: "Compact marker labels and seat identities." },
  { name: "Person name", sample: "PAM", className: "text-sm font-semibold leading-tight", usage: "Directory, search result, assigned seat identity." },
  { name: "Body", sample: "Publishing copies the saved draft map to viewers.", className: "text-sm font-normal leading-6", usage: "Operational explanation and panel body text." },
  { name: "Metadata", sample: "West Pod - Assigned", className: "text-xs font-medium leading-5 text-[#696159]", usage: "Supporting details, list metadata, row descriptors." },
  { name: "Helper / safety copy", sample: "Save or discard edits before publishing.", className: "text-xs font-medium leading-5 text-[#6D4712]", usage: "Risk, safety, and guardrail explanation." },
  { name: "Button label", sample: "Review & publish", className: "text-sm font-semibold leading-none", usage: "Specific action labels, not generic confirmations." },
  { name: "Table/list label", sample: "Department", className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-[#696159]", usage: "Dense list headers and field labels." }
];

export const spacingTokens = [
  { name: "4", value: "4px", usage: "Inner marker spacing and tiny gaps" },
  { name: "8", value: "8px", usage: "Compact control gaps" },
  { name: "12", value: "12px", usage: "Field and row padding" },
  { name: "16", value: "16px", usage: "Panel padding" },
  { name: "24", value: "24px", usage: "Section rhythm" },
  { name: "32", value: "32px", usage: "Workflow grouping" },
  { name: "48", value: "48px", usage: "Major section separation" }
];

export const radiusTokens = [
  { name: "6", usage: "Seat chip and dense controls" },
  { name: "8", usage: "Cards, rows, and buttons" },
  { name: "10", usage: "Search rows and filter chips" },
  { name: "12", usage: "Panels and drawers" },
  { name: "16", usage: "Sheets and modals" },
  { name: "full", usage: "Badges, pills, and circular icon controls" }
];

export const elevationTokens = [
  { name: "canvas", value: "No shadow", usage: "Map and page canvas" },
  { name: "raised panel", value: "0 10px 32px rgba(15,23,42,0.08)", usage: "Inspector and result panels" },
  { name: "floating control", value: "0 8px 20px rgba(15,23,42,0.12)", usage: "Map controls and compact overlays" },
  { name: "sheet", value: "0 -18px 44px rgba(15,23,42,0.18)", usage: "Mobile bottom sheets" },
  { name: "modal", value: "0 26px 80px rgba(15,23,42,0.28)", usage: "Publish and destructive confirmations" }
];

export const motionTokens = [
  { name: "fast", value: "120-150ms", usage: "Button press, marker response" },
  { name: "standard", value: "180-220ms", usage: "Panel reveal, hover, focus" },
  { name: "deliberate", value: "240-300ms", usage: "Sheet and modal entrance" },
  { name: "reduced motion", value: "No transform travel", usage: "Fade or instant state change when reduced motion is preferred" }
];

export const markerStates: MarkerState[] = [
  { name: "Available seat", label: "W12", className: "border-[#BEB4A8] bg-white text-[#070A0D]", note: "Quiet, legible, not competing with results.", aria: "Available published seat W12 in West Pod." },
  { name: "Assigned, names hidden", label: "W09", className: "border-[#8E8276] bg-white text-[#070A0D]", note: "Seat identity remains primary when names are hidden.", aria: "Assigned seat W09." },
  { name: "Assigned, names shown", label: "W09", sublabel: "PAMELA-LONG", className: "border-[#696159] bg-white text-[#070A0D]", note: "Name ellipsizes under the seat label.", aria: "Assigned seat W09, Pamela." },
  { name: "Selected", label: "W09", sublabel: "PAM", className: "border-[#C2410C] bg-[#171A1D] text-white ring-4 ring-[#D46A24]/35", note: "Selection wins over passive labels.", aria: "Selected published seat W09, PAM." },
  { name: "Search result", label: "W09", sublabel: "PAM", className: "border-[#2F6668] bg-[#DCEDEA] text-[#1F4749] ring-4 ring-[#A9CFCC]", note: "Mapped search result is obvious without flooding the map.", aria: "Highlighted search result, seat W09." },
  { name: "Hovered", label: "W10", className: "border-[#D46A24] bg-[#F6E7D8] text-[#6F2C13] shadow-md", note: "Subtle lift and warm border.", aria: "Seat W10, hover preview." },
  { name: "Keyboard focused", label: "C02", className: "border-[#070A0D] bg-white text-[#070A0D] ring-4 ring-[#D46A24]/45", note: "Visible focus is independent of color.", aria: "Focused seat C02." },
  { name: "Draft modified", label: "E04", className: "border-[#9A6418] bg-[#F1E2C4] text-[#6D4712]", note: "Signals saved draft change before publish.", aria: "Draft modified seat E04." },
  { name: "Move origin", label: "C04", className: "border-[#6E655A] bg-[#EFE9DF] text-[#353532] ring-4 ring-[#D8D0C5]", note: "Origin stays visible while choosing a destination.", aria: "Move origin seat C04." },
  { name: "Valid destination", label: "C09", className: "border-[#3F6F59] bg-[#DDE9DF] text-[#284C3B] ring-4 ring-[#BFD4C4]", note: "Positive target, still precise.", aria: "Valid destination C09." },
  { name: "Invalid destination", label: "N04", className: "border-[#963D2F] bg-[#F3DAD2] text-[#7E2F24] ring-4 ring-[#D9A296]", note: "Paired with text in the mode banner.", aria: "Invalid destination N04." },
  { name: "Swap source", label: "W09", sublabel: "PAM", className: "border-[#3E6F72] bg-[#DCEDEA] text-[#244E50] ring-4 ring-[#A9CFCC]", note: "Source is held while target is chosen.", aria: "Swap source W09, PAM." },
  { name: "Swap target", label: "CW08", sublabel: "MIKE", className: "border-[#6E655A] bg-[#F1ECE4] text-[#353532] ring-4 ring-[#D8D0C5]", note: "Target is distinct from source and selection.", aria: "Swap target CW08, MIKE." },
  { name: "Protected original", label: "N01", className: "border-[#696159] bg-[#E7E1D8] text-[#353532]", note: "Protected state appears in inspector actions too.", aria: "Protected original seat N01." },
  { name: "Custom seat", label: "C09", className: "border-[#C2410C] bg-[#F6E7D8] text-[#6F2C13]", note: "Custom origin is visible without implying danger.", aria: "Custom draft seat C09." },
  { name: "Reserved", label: "NE04", className: "border-[#9A6418] bg-[#F1E2C4] text-[#6D4712]", note: "Unavailable for assignment until status changes.", aria: "Reserved seat NE04." },
  { name: "Unavailable", label: "SE03", className: "border-[#C9C0B4] bg-[#E7E1D8] text-[#696159]", note: "Lower contrast, still readable.", aria: "Unavailable seat SE03." },
  { name: "Ask Planner highlight", label: "W11", sublabel: "ALEX", className: "border-[#6E655A] bg-[#EFE9DF] text-[#353532] ring-4 ring-[#D8D0C5]", note: "Assistant support highlight stays distinct from viewer search.", aria: "Ask Planner highlighted draft seat W11." }
];

export const searchStates: SearchState[] = [
  { state: "Empty / idle", title: "Find a person, seat, department, or zone", meta: "Primary action, no fake results.", label: "Ready", tone: "neutral" },
  { state: "Focused no query", title: "Search published seating", meta: "Shows helpful scope, not a blank dropdown.", label: "Focus", tone: "info" },
  { state: "Loading", title: "Searching published map", meta: "Keep map visible while results load.", label: "Loading", tone: "info" },
  { state: "Person results", title: "PAM", meta: "W09 - West Pod - Sr. Intake Specialist", label: "Person", tone: "selected" },
  { state: "Seat results", title: "W09", meta: "Assigned - PAM - West Pod", label: "Seat", tone: "selected" },
  { state: "Department results", title: "Accounting", meta: "1 person - 1 published seat", label: "Department", tone: "info" },
  { state: "Zone results", title: "West Pod", meta: "12 seats - 3 assigned", label: "Zone", tone: "info" },
  { state: "No results", title: "No published seating found", meta: "Suggest a different person, seat, department, or zone.", label: "Empty", tone: "warning" },
  { state: "One-result auto-selection", title: "W12 selected", meta: "Show on map - Clear search", label: "Auto", tone: "selected" },
  { state: "Multi-result list", title: "2 results for Pam", meta: "Person and seat rows stay distinct.", label: "List", tone: "neutral" }
];

export const statusStates = [
  { label: "Published", detail: "Viewer data is live.", tone: "success" },
  { label: "Draft matches published", detail: "No saved draft changes.", tone: "success" },
  { label: "Draft has unpublished changes", detail: "Review before viewers see it.", tone: "warning" },
  { label: "Saving", detail: "Draft update in progress.", tone: "info" },
  { label: "Saved", detail: "Draft change stored.", tone: "success" },
  { label: "Error", detail: "Action did not complete.", tone: "danger" },
  { label: "Warning", detail: "Check the impact first.", tone: "warning" },
  { label: "Success", detail: "Action completed safely.", tone: "success" },
  { label: "Read-only", detail: "No editing controls available.", tone: "neutral" },
  { label: "Blocked", detail: "Save or discard edits first.", tone: "danger" },
  { label: "Pending", detail: "Keep the user oriented while waiting.", tone: "info" }
];

export const panelStates: PanelState[] = [
  { title: "Viewer detail panel", subtitle: "Read-only selected seat and person detail.", footer: "Back to map", tone: "info" },
  { title: "Filter panel", subtitle: "Department, zone, status, and clear filter controls.", footer: "Clear filters", tone: "neutral" },
  { title: "Map Tools", subtitle: "Common actions first, advanced utilities separated.", footer: "Close tools", tone: "warning" },
  { title: "Ask Planner drawer", subtitle: "Read-only support and highlights, no mutation promise.", footer: "Ask follow-up", tone: "planner" },
  { title: "Management detail panel", subtitle: "List-led people, departments, zones, and history.", footer: "Save record", tone: "neutral" },
  { title: "Confirmation dialog", subtitle: "Consequences, cancel, and one specific action.", footer: "Move person", tone: "warning" },
  { title: "Destructive confirmation", subtitle: "Draft-only impact and guarded custom-seat deletion.", footer: "Delete custom seat", tone: "danger" },
  { title: "Mobile bottom sheet", subtitle: "One active task owns the mobile layer.", footer: "Save draft", tone: "selected" }
];

export const preferItems = [
  "strong hierarchy",
  "purposeful brand color",
  "restrained depth",
  "clear task flows",
  "visible focus",
  "integrated map markers",
  "specific action labels",
  "expressive but controlled motion"
];

export const avoidItems = [
  "dull gray enterprise screens",
  "generic KPI dashboard layouts",
  "excessive floating cards",
  "giant marketing headings",
  "decorative gradients without purpose",
  "every component using orange",
  "overlapping controls",
  "desktop panels simply stacked on mobile",
  "ambiguous state language"
];

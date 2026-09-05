import type { CSSProperties, ReactNode } from "react";
import localFont from "next/font/local";
import {
  Button as DesignSystemButton,
  IconButton,
  StatusBadge,
  focusRingClass,
  type ButtonVariant,
  type IconButtonVariant,
  type StatusBadgeTone
} from "@/components/ui/design-system";
import { markerStateClassRecipes } from "./markerStateClassRecipes";
import {
  avoidItems,
  colorGroups,
  elevationTokens,
  markerStates,
  motionTokens,
  panelStates,
  preferItems,
  radiusTokens,
  searchStates,
  spacingTokens,
  statusStates,
  typeScale,
  type MarkerState,
  type SearchState
} from "./componentStateBoardData";

// Vendored beside this prototype rather than fetched from Google at build time
// (see ./fonts/README.md). A prototype page is still compiled on every build, so
// a next/font/google import here would keep the whole build depending on a live
// fonts.gstatic.com fetch — the dependency app/layout.tsx was pinned to remove.
// Both are variable fonts, so one file covers the weight range this board uses
// — but ONLY if the range is declared. Without `weight`, next/font/local emits
// an @font-face with no font-weight descriptor, which CSS treats as 400: the
// wght axis is never exercised and every font-semibold/bold/extrabold here
// renders as synthetic bold over the 400 instance. The ranges below are the
// axes the two files actually carry.
const inter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-component-board-ui",
  display: "swap"
});

const manrope = localFont({
  src: "./fonts/manrope-latin-wght-normal.woff2",
  weight: "200 800",
  style: "normal",
  variable: "--font-component-board-display",
  display: "swap"
});

const uiFontStyle: CSSProperties = { fontFamily: "var(--font-component-board-ui)" };
const displayFontStyle: CSSProperties = { fontFamily: "var(--font-component-board-display)" };

const sections = [
  { id: "cover", label: "Direction", current: true },
  { id: "foundations", label: "Color" },
  { id: "typography", label: "Type" },
  { id: "spacing", label: "Rhythm" },
  { id: "controls", label: "Controls" },
  { id: "feedback", label: "Feedback" },
  { id: "markers", label: "Markers" },
  { id: "search", label: "Search" },
  { id: "inspector", label: "Inspector" },
  { id: "publish", label: "Publish" },
  { id: "panels", label: "Panels" },
  { id: "responsive", label: "Responsive" },
  { id: "prefer-avoid", label: "Prefer / avoid" }
];

const toneClasses: Record<string, { chip: string; card: string; text: string; border: string }> = {
  danger: {
    chip: "bg-[#F3DAD2] text-[#7E2F24] ring-[#D9A296]",
    card: "border-[#D9A296] bg-[#F3DAD2]",
    text: "text-[#7E2F24]",
    border: "border-[#963D2F]"
  },
  info: {
    chip: "bg-[#DCEDEA] text-[#244E50] ring-[#A9CFCC]",
    card: "border-[#A9CFCC] bg-[#DCEDEA]",
    text: "text-[#244E50]",
    border: "border-[#3E6F72]"
  },
  neutral: {
    chip: "bg-[#F7F6F2] text-[#353532] ring-[#DED6CA]",
    card: "border-[#DED6CA] bg-[#FFFDF8]",
    text: "text-[#353532]",
    border: "border-[#BEB4A8]"
  },
  planner: {
    chip: "bg-[#EFE9DF] text-[#353532] ring-[#D8D0C5]",
    card: "border-[#D8D0C5] bg-[#EFE9DF]",
    text: "text-[#353532]",
    border: "border-[#6E655A]"
  },
  selected: {
    chip: "bg-[#F6E7D8] text-[#6F2C13] ring-[#E2BDA0]",
    card: "border-[#E2BDA0] bg-[#F6E7D8]",
    text: "text-[#6F2C13]",
    border: "border-[#C2410C]"
  },
  success: {
    chip: "bg-[#DDE9DF] text-[#284C3B] ring-[#BFD4C4]",
    card: "border-[#BFD4C4] bg-[#DDE9DF]",
    text: "text-[#284C3B]",
    border: "border-[#3F6F59]"
  },
  warning: {
    chip: "bg-[#F1E2C4] text-[#6D4712] ring-[#D7B26C]",
    card: "border-[#D7B26C] bg-[#F1E2C4]",
    text: "text-[#6D4712]",
    border: "border-[#9A6418]"
  }
};

const focusSurfaceExamples: {
  label: string;
  description: string;
  containerClass: string;
  buttonClass: string;
  style?: CSSProperties;
}[] = [
  {
    label: "Raised paper",
    description: "Default offset color follows the raised paper surface.",
    containerClass: "border-[#DED6CA] bg-white text-[#171A1D]",
    buttonClass: "border-[#BEB4A8] bg-white text-[#171A1D]"
  },
  {
    label: "Warm paper",
    description: "Tinted containers override the semantic offset locally.",
    containerClass: "border-[#E2BDA0] bg-[#F6E7D8] text-[#6F2C13]",
    buttonClass: "border-[#D46A24] bg-[#FFFDF8] text-[#6F2C13]",
    style: { "--sp-focus-offset-color": "var(--sp-brand-subtle)" } as CSSProperties
  },
  {
    label: "Dark graphite",
    description: "Dark surfaces keep the copper ring without a white outline.",
    containerClass: "border-[#353532] bg-[#171A1D] text-white",
    buttonClass: "border-white/20 bg-white/10 text-white",
    style: {
      "--sp-focus": "color-mix(in srgb, var(--sp-button-primary) 72%, transparent)",
      /* was var(--sp-color-workspace) — that token retired with the chrome
         zone (PASS1 §3.2); this board simulates the dark chrome, so it pins
         the same #161616 the zone paints. */
      "--sp-focus-offset-color": "#161616"
    } as CSSProperties
  }
];

export function ComponentStateBoard() {
  return (
    <main
      className={`${inter.variable} ${manrope.variable} min-h-screen overflow-x-hidden bg-[#F8F3EA] text-[#070A0D]`}
      style={uiFontStyle}
    >
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[#070A0D] focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to component board
      </a>

      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-4 sm:px-6 lg:flex-row lg:py-6">
        <aside className="lg:sticky lg:top-6 lg:h-[calc(100vh-48px)] lg:w-64 lg:shrink-0">
          <div className="rounded-2xl border border-[#DED6CA] bg-white/90 p-3 shadow-[0_12px_40px_rgba(23,26,29,0.08)] backdrop-blur">
            <div className="flex items-center gap-3 rounded-xl bg-[#171A1D] p-3 text-white">
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-[#FFF7ED] px-2 text-center text-[10px] font-semibold leading-tight text-[#6F2C13]">
                <span aria-hidden="true">No logo</span>
                <span className="sr-only">Logo asset not found</span>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F6E7D8]">Prototype only</p>
                <p className="text-sm font-semibold leading-tight">Seat Planner states</p>
              </div>
            </div>
            <nav aria-label="Component board sections" className="mt-3 grid grid-cols-2 gap-1 lg:grid-cols-1">
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  aria-current={section.current ? "page" : undefined}
                  className={`flex min-h-11 items-center rounded-lg px-3 py-2 text-xs font-semibold outline-none transition hover:bg-[#F6E7D8] hover:text-[#6F2C13] focus-visible:bg-[#F6E7D8] focus-visible:text-[#6F2C13] focus-visible:ring-4 focus-visible:ring-[#D46A24]/40 ${
                    section.current
                      ? "border border-[#E2BDA0] bg-[#F6E7D8] text-[#6F2C13] shadow-sm"
                      : "text-[#696159]"
                  }`}
                >
                  {section.label}
                </a>
              ))}
            </nav>
            <p className="mt-3 rounded-xl border border-[#D7B26C] bg-[#F1E2C4] p-3 text-xs font-medium leading-5 text-[#6D4712]">
              Local concept route. Mock data only. No Supabase, auth, server actions, publish calls, or production navigation.
            </p>
          </div>
        </aside>

        <div id="content" className="min-w-0 flex-1 space-y-6">
          <CoverSection />
          <ColorSection />
          <TypographySection />
          <RhythmSection />
          <ControlsSection />
          <FeedbackSection />
          <MarkerSection />
          <SearchSection />
          <InspectorSection />
          <PublishSection />
          <PanelsSection />
          <ResponsiveSection />
          <PreferAvoidSection />
        </div>
      </div>
    </main>
  );
}

function Section({
  id,
  eyebrow,
  title,
  children
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 rounded-[24px] border border-white/80 bg-white/80 p-4 shadow-[0_16px_50px_rgba(23,26,29,0.08)] sm:p-6">
      <div className="mb-5 flex flex-col gap-2 border-b border-[#DED6CA] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#C2410C]">{eyebrow}</p>
          <h2 className="mt-1 text-2xl font-bold leading-tight text-[#070A0D]" style={displayFontStyle}>{title}</h2>
        </div>
        <a
          href="#cover"
          className="inline-flex min-h-11 items-center rounded-full border border-[#DED6CA] bg-white px-4 text-xs font-semibold text-[#696159] outline-none transition hover:border-[#E2BDA0] hover:bg-[#F6E7D8] hover:text-[#6F2C13] focus-visible:ring-4 focus-visible:ring-[#D46A24]/40"
        >
          Back to top
        </a>
      </div>
      {children}
    </section>
  );
}

function CoverSection() {
  return (
    <section id="cover" className="scroll-mt-6 overflow-hidden rounded-[28px] border border-[#DED6CA] bg-[#171A1D] text-white shadow-[0_18px_60px_rgba(23,26,29,0.18)]">
      <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="p-4 sm:p-8">
          <div className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 p-2">
            <div className="grid h-12 w-24 place-items-center rounded-xl border border-white/15 bg-[#FFF7ED] px-2 text-center text-[10px] font-semibold leading-tight text-[#6F2C13]">Temporary brand placeholder</div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#F6E7D8]">Megeredchian Law</p>
              <p className="text-lg font-bold" style={displayFontStyle}>Office Seat Planner</p>
            </div>
          </div>
          <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#D46A24] sm:mt-8">Component State Board v1</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-extrabold leading-[1.04] sm:text-5xl" style={displayFontStyle}>
            Apple-like clarity with youthful operational energy
          </h1>
          <p className="mt-4 max-w-2xl text-base font-normal leading-7 text-[#D8D0C5]">
            A source-only design-system prototype for Seat Planner states, patterns, and workflow language. It is precise enough for production conversations and isolated enough to delete cleanly.
          </p>
          <div className="mt-6 grid gap-2 sm:grid-cols-5">
            {[
              ["Viewer", "Search"],
              ["Planning", "Workflow"],
              ["Publish", "Review"],
              ["Management", "Lists"],
              ["Map", "Spatial Truth"]
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/10 p-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#B8AEA2]">{label}</p>
                <p className="mt-2 text-lg font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="relative min-h-[340px] overflow-hidden bg-[#ECE7DE]">
          <MapSurface />
          <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/80 bg-white/90 p-4 text-[#070A0D] shadow-[0_18px_50px_rgba(23,26,29,0.16)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#C2410C]">Prototype route guard</p>
            <p className="mt-1 text-sm font-semibold">Development only unless `SEAT_PLANNER_ENABLE_PROTOTYPES=true`.</p>
            <p className="mt-1 text-xs font-medium leading-5 text-[#696159]">No approved Megeredchian Law logo asset was found in the repo; this board labels the brand mark as temporary.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ColorSection() {
  return (
    <Section id="foundations" eyebrow="02 foundations" title="Color Foundations">
      <div className="grid gap-4">
        {colorGroups.map((group) => (
          <div key={group.title} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold">{group.title}</h3>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{group.note}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {group.colors.map((color) => (
                <article key={color.name} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="h-20 border-b border-slate-200" style={{ background: color.value }} />
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold">{color.name}</h4>
                      <code className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">{color.value}</code>
                    </div>
                    <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{color.usage}</p>
                    <p className="mt-2 text-xs font-bold leading-5 text-slate-500">Contrast: {color.contrast}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function TypographySection() {
  return (
    <Section id="typography" eyebrow="03 typography" title="Restrained Operational Type">
      <div className="grid gap-3">
        {typeScale.map((type) => (
          <article key={type.name} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[220px_1fr] md:items-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{type.name}</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{type.usage}</p>
            </div>
            <p className={type.className}>{type.sample}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}

function RhythmSection() {
  return (
    <Section id="spacing" eyebrow="04 rhythm" title="Spacing, Radius, Elevation, Motion">
      <div className="grid gap-4 xl:grid-cols-2">
        <TokenPanel title="Spacing">
          {spacingTokens.map((token) => (
            <div key={token.name} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="h-8 rounded-md bg-[#C2410C]" style={{ width: token.value }} />
              <div>
                <p className="text-sm font-semibold">{token.name} / {token.value}</p>
                <p className="text-xs font-semibold text-slate-500">{token.usage}</p>
              </div>
            </div>
          ))}
        </TokenPanel>
        <TokenPanel title="Radii">
          <div className="grid grid-cols-2 gap-3">
            {radiusTokens.map((token) => (
              <div key={token.name} className="border border-slate-200 bg-white p-3" style={{ borderRadius: token.name === "full" ? "999px" : `${token.name}px` }}>
                <p className="text-sm font-semibold">Radius {token.name}</p>
                <p className="text-xs font-semibold text-slate-500">{token.usage}</p>
              </div>
            ))}
          </div>
        </TokenPanel>
        <TokenPanel title="Elevation">
          {elevationTokens.map((token) => (
            <div key={token.name} className="rounded-xl border border-slate-200 bg-white p-4" style={{ boxShadow: token.value === "No shadow" ? "none" : token.value }}>
              <p className="text-sm font-semibold">{token.name}</p>
              <p className="text-xs font-semibold text-slate-500">{token.usage}</p>
            </div>
          ))}
        </TokenPanel>
        <TokenPanel title="Motion">
          {motionTokens.map((token) => (
            <div key={token.name} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold">{token.name} <span className="text-slate-400">{token.value}</span></p>
              <p className="text-xs font-semibold text-slate-500">{token.usage}</p>
            </div>
          ))}
        </TokenPanel>
      </div>
    </Section>
  );
}

function ControlsSection() {
  const buttonRows: ButtonKind[] = [
    {
      label: "Primary",
      variant: "primary",
      action: "Review & publish",
      loadingLabel: "Publishing..."
    },
    {
      label: "Secondary",
      variant: "secondary",
      action: "Assign to W12",
      loadingLabel: "Assigning..."
    },
    {
      label: "Quiet",
      variant: "quiet",
      action: "Clear filters",
      loadingLabel: "Clearing..."
    },
    {
      label: "Destructive",
      variant: "destructive",
      action: "Delete custom seat",
      loadingLabel: "Deleting..."
    },
    {
      label: "Icon button",
      iconVariant: "neutral",
      action: "Search",
      loadingLabel: "Searching...",
      iconName: "search",
      iconOnly: true
    }
  ];

  return (
    <Section id="controls" eyebrow="05 controls" title="Buttons and Controls">
      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-2xl border border-[#DED6CA] bg-white p-4">
          <h3 className="text-lg font-bold">Actual button state examples</h3>
          <p className="mt-1 text-sm font-normal leading-6 text-[#696159]">
            Primary uses accessible burnt orange with white text. Loading states show progress and disable repeat activation.
          </p>
          <div className="mt-4 grid gap-3">
            {buttonRows.map((row) => (
              <ButtonStateDemo key={row.label} button={row} />
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-[#DED6CA] bg-[#171A1D] p-4 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F6E7D8]">Mobile action pair</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <DesignSystemButton variant="secondary" className="border-white/20 bg-white/10 text-white hover:bg-white/15">Cancel</DesignSystemButton>
              <DesignSystemButton variant="primary">Publish draft</DesignSystemButton>
            </div>
          </div>
          <div id="focus-treatment" className="mt-4 rounded-2xl border border-[#DED6CA] bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#C2410C]">Focus treatment</p>
            <p className="mt-1 text-sm font-normal leading-6 text-[#696159]">
              Shared focus uses the approved warm copper halo, a 4px ring, a 2px offset, and a surface-aware offset color.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {focusSurfaceExamples.map((surface) => (
                <div
                  key={surface.label}
                  className={`rounded-xl border p-3 ${surface.containerClass}`}
                  style={surface.style}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">{surface.label}</p>
                  <button
                    type="button"
                    className={`mt-3 min-h-11 rounded-xl border px-4 text-sm font-semibold ${focusRingClass} ${surface.buttonClass}`}
                  >
                    Focus preview
                  </button>
                  <p className="mt-3 text-xs font-medium leading-5 opacity-80">{surface.description}</p>
                </div>
              ))}
            </div>
            <code className="mt-3 block rounded-xl bg-[#F7F6F2] p-3 text-xs font-semibold leading-5 text-[#353532]">
              {focusRingClass}
            </code>
          </div>
        </div>

        <div className="rounded-2xl border border-[#DED6CA] bg-white p-4">
          <h3 className="text-lg font-bold">Inputs and selection controls</h3>
          <div className="mt-4 grid gap-3">
            <Field label="Search" value="Pam, W09, Accounting, West Pod" helper="Search is the obvious primary action for viewers." />
            <Field label="Input" value="PAM" helper="Use concrete labels and validation." />
            <div className="grid gap-3 sm:grid-cols-2">
              <ControlShell label="Select"><span>West Pod</span></ControlShell>
              <ControlShell label="Combobox"><span>Assign to W12</span></ControlShell>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="min-h-11 rounded-full bg-[#171A1D] px-4 text-sm font-semibold text-white">Show names</button>
              <button type="button" className="min-h-11 rounded-full border border-[#BEB4A8] bg-white px-4 text-sm font-semibold text-[#353532]">Available</button>
              <button type="button" className="min-h-11 rounded-full border border-[#E2BDA0] bg-[#F6E7D8] px-4 text-sm font-semibold text-[#6F2C13]">West Pod</button>
              <button type="button" className="min-h-11 rounded-full border border-[#DED6CA] bg-[#F7F6F2] px-4 text-sm font-semibold text-[#8E8276]" disabled>Unavailable</button>
            </div>
            <div className="grid grid-cols-3 rounded-xl border border-[#DED6CA] bg-[#F7F6F2] p-1">
              {["Viewer", "Planning", "Publish"].map((tab, index) => (
                <button key={tab} type="button" className={`min-h-11 rounded-lg text-sm font-semibold ${index === 1 ? "bg-white text-[#070A0D] shadow-sm" : "text-[#696159]"}`}>
                  {tab}
                </button>
              ))}
            </div>
            <div className="rounded-xl border border-[#D9A296] bg-[#F3DAD2] p-3 text-sm font-medium text-[#7E2F24]">Seat label is required before saving draft metadata.</div>
            <div className="rounded-xl border border-[#DED6CA] bg-[#F7F6F2] p-3 text-sm font-medium text-[#696159]">No departments match this filter.</div>
          </div>
        </div>
      </div>
    </Section>
  );
}

type ButtonKind = {
  label: string;
  action: string;
  loadingLabel: string;
  variant?: ButtonVariant;
  iconVariant?: IconButtonVariant;
  iconName?: IconName;
  iconOnly?: boolean;
};

const buttonStateExamples = [
  { label: "Default", key: "defaultClass", disabled: false, busy: false },
  { label: "Hover", key: "hoverClass", disabled: false, busy: false },
  { label: "Pressed", key: "pressedClass", disabled: false, busy: false },
  { label: "Keyboard focus", key: "focusClass", disabled: false, busy: false },
  { label: "Disabled", key: "disabledClass", disabled: true, busy: false },
  { label: "Loading", key: "loadingClass", disabled: true, busy: true }
] as const;

const buttonStatePreviewClasses: Record<ButtonVariant, Record<(typeof buttonStateExamples)[number]["key"], string>> = {
  primary: {
    defaultClass: "",
    hoverClass: "border-[var(--sp-button-primary-hover)] bg-[var(--sp-button-primary-hover)]",
    pressedClass: "border-[var(--sp-button-primary-active)] bg-[var(--sp-button-primary-active)] translate-y-px",
    focusClass: "ring-4 ring-[color:var(--sp-focus)] ring-offset-2 ring-offset-[color:var(--sp-focus-offset-color)]",
    disabledClass: "border-[var(--sp-border-subtle)] bg-[var(--sp-surface-disabled)] text-[var(--sp-text-helper)]",
    loadingClass: ""
  },
  secondary: {
    defaultClass: "",
    hoverClass: "border-[var(--sp-button-primary)] bg-[var(--sp-brand-subtle)] text-[var(--sp-brand-deep)]",
    pressedClass: "border-[var(--sp-button-primary)] bg-[#F3D1B9] text-[var(--sp-brand-deep)] translate-y-px",
    focusClass: "ring-4 ring-[color:var(--sp-focus)] ring-offset-2 ring-offset-[color:var(--sp-focus-offset-color)]",
    disabledClass: "border-[var(--sp-border-subtle)] bg-[var(--sp-layer-accent)] text-[var(--sp-text-disabled)]",
    loadingClass: ""
  },
  quiet: {
    defaultClass: "",
    hoverClass: "bg-[var(--sp-layer-accent)] text-[var(--sp-text-secondary)]",
    pressedClass: "bg-[var(--sp-neutral-strong)] text-[var(--sp-text-secondary)] translate-y-px",
    focusClass: "ring-4 ring-[color:var(--sp-focus)] ring-offset-2 ring-offset-[color:var(--sp-focus-offset-color)]",
    disabledClass: "bg-transparent text-[var(--sp-neutral-muted)]",
    loadingClass: ""
  },
  destructive: {
    defaultClass: "",
    hoverClass: "border-[#7E2F24] bg-[#7E2F24]",
    pressedClass: "border-[#6B271F] bg-[#6B271F] translate-y-px",
    focusClass: "ring-4 ring-[color:var(--sp-status-danger-border)] ring-offset-2 ring-offset-[color:var(--sp-focus-offset-color)]",
    disabledClass: "border-[var(--sp-status-danger-border)] bg-[var(--sp-status-danger-border)] text-[#7E2F24]",
    loadingClass: ""
  }
};

const iconButtonStatePreviewClasses: Record<(typeof buttonStateExamples)[number]["key"], string> = {
  defaultClass: "",
  hoverClass: "border-[var(--sp-button-primary)] bg-[var(--sp-brand-subtle)] text-[var(--sp-brand-deep)]",
  pressedClass: "border-[var(--sp-button-primary)] bg-[#F3D1B9] text-[var(--sp-brand-deep)] translate-y-px",
  focusClass: "ring-4 ring-[color:var(--sp-focus)] ring-offset-2 ring-offset-[color:var(--sp-focus-offset-color)]",
  disabledClass: "border-[var(--sp-border-subtle)] bg-[var(--sp-layer-accent)] text-[var(--sp-text-disabled)]",
  loadingClass: ""
};

function ButtonStateDemo({ button }: { button: ButtonKind }) {
  return (
    <article className="rounded-2xl border border-[#DED6CA] bg-[#F7F6F2] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#696159]">{button.label}</p>
          {button.iconOnly ? (
            <p className="mt-1 text-xs font-normal leading-5 text-[#696159]">
              Accessible label example: Icon button example: search seat map
            </p>
          ) : null}
        </div>
        {button.iconOnly ? <IconButtonSamples /> : null}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {buttonStateExamples.map((state) => (
          <div key={state.label} className="rounded-xl border border-white/80 bg-white/80 p-2">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[#8E8276]">{state.label}</p>
            {button.iconOnly && button.iconName ? (
              <IconButton
                icon={<IconGlyph name={button.iconName} />}
                label={`Icon button example: ${button.action.toLowerCase()} seat map`}
                variant={button.iconVariant ?? "neutral"}
                loading={state.busy}
                disabled={state.disabled}
                className={iconButtonStatePreviewClasses[state.key]}
              />
            ) : (
              <DesignSystemButton
                variant={button.variant ?? "secondary"}
                loading={state.busy}
                disabled={state.disabled}
                className={buttonStatePreviewClasses[button.variant ?? "secondary"][state.key]}
              >
                {state.busy ? button.loadingLabel : button.action}
              </DesignSystemButton>
            )}
          </div>
        ))}
      </div>
    </article>
  );
}

type IconName = "search" | "filter" | "more" | "close" | "eye";

const iconButtonExamples: { label: string; icon: IconName; ariaLabel: string }[] = [
  { label: "Search", icon: "search", ariaLabel: "Search seat map" },
  { label: "Filter", icon: "filter", ariaLabel: "Open filters" },
  { label: "More", icon: "more", ariaLabel: "Open more options" },
  { label: "Close", icon: "close", ariaLabel: "Close panel" },
  { label: "Eye", icon: "eye", ariaLabel: "Show names" }
];

function IconButtonSamples() {
  return (
    <div className="grid gap-1.5" aria-label="Icon button examples">
      <div className="flex flex-wrap gap-1.5">
        {iconButtonExamples.map((example) => (
          <IconButton
            key={example.label}
            label={`Icon button example: ${example.ariaLabel}`}
            icon={<IconGlyph name={example.icon} />}
          />
        ))}
      </div>
      <div className="grid gap-1 text-[10px] font-medium leading-4 text-[#696159]">
        {iconButtonExamples.map((example) => (
          <span key={example.label}>{example.label}: {example.ariaLabel}</span>
        ))}
      </div>
    </div>
  );
}

function IconGlyph({ name }: { name: IconName }) {
  const common = {
    className: "h-4 w-4",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": "true" as const
  };

  if (name === "search") {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    );
  }

  if (name === "filter") {
    return (
      <svg {...common}>
        <path d="M4 6h16" />
        <path d="M7 12h10" />
        <path d="M10 18h4" />
      </svg>
    );
  }

  if (name === "more") {
    return (
      <svg {...common}>
        <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (name === "close") {
    return (
      <svg {...common}>
        <path d="M6 6l12 12" />
        <path d="M18 6 6 18" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

const statusToneMap: Record<string, StatusBadgeTone> = {
  danger: "danger",
  info: "info",
  neutral: "neutral",
  planner: "readonly",
  selected: "draft",
  success: "success",
  warning: "warning"
};

const statusBadgeToneExamples: { label: string; tone: StatusBadgeTone; detail: string }[] = [
  { label: "Neutral", tone: "neutral", detail: "Default informational state." },
  { label: "Published", tone: "published", detail: "Viewer-visible data is live." },
  { label: "Draft", tone: "draft", detail: "Saved admin work is not yet published." },
  { label: "Success", tone: "success", detail: "Action completed safely." },
  { label: "Warning", tone: "warning", detail: "Review before continuing." },
  { label: "Danger", tone: "danger", detail: "Destructive or failed state." },
  { label: "Info", tone: "info", detail: "Guidance, search, and viewer impact." },
  { label: "Read-only", tone: "readonly", detail: "No editing controls available." },
  { label: "Blocked", tone: "blocked", detail: "Resolve the guard first." },
  { label: "Pending", tone: "pending", detail: "Action is in progress." }
];

function StatusGlyph() {
  return (
    <span className="block h-2 w-2 rounded-full bg-current" aria-hidden="true" />
  );
}

type StatusIconKind = "alert" | "check" | "error" | "lock" | "progress";

function getStatusIconKind(label: string): StatusIconKind {
  const normalizedLabel = label.toLowerCase();

  if (
    normalizedLabel === "published" ||
    normalizedLabel === "draft matches published" ||
    normalizedLabel === "saved" ||
    normalizedLabel === "success"
  ) {
    return "check";
  }

  if (normalizedLabel === "saving" || normalizedLabel === "pending") {
    return "progress";
  }

  if (normalizedLabel === "error" || normalizedLabel === "blocked") {
    return "error";
  }

  if (normalizedLabel === "read-only") {
    return "lock";
  }

  if (normalizedLabel === "draft has unpublished changes" || normalizedLabel === "warning") {
    return "alert";
  }

  return "alert";
}

function StatusStateIcon({ label, tone }: { label: string; tone: string }) {
  const iconKind = getStatusIconKind(label);
  const common = {
    className: "h-5 w-5",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": "true" as const
  };

  let icon = (
    <svg {...common}>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  );

  if (iconKind === "check") {
    icon = (
      <svg {...common}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  } else if (iconKind === "progress") {
    icon = (
      <svg {...common}>
        <path d="M21 12a9 9 0 0 1-9 9" />
        <path d="M3 12a9 9 0 0 1 9-9" />
        <path d="m18 15 3-3 3 3" />
        <path d="m6 9-3 3-3-3" />
      </svg>
    );
  } else if (iconKind === "error") {
    icon = (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M15 9 9 15" />
        <path d="m9 9 6 6" />
      </svg>
    );
  } else if (iconKind === "lock") {
    icon = (
      <svg {...common}>
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </svg>
    );
  }

  return (
    <span
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/70 bg-white/65 ${toneClasses[tone].text}`}
      aria-hidden="true"
    >
      {icon}
    </span>
  );
}

function FeedbackSection() {
  return (
    <Section id="feedback" eyebrow="06 feedback" title="Status and Feedback">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {statusStates.map((status) => (
          <article key={status.label} className={`rounded-2xl border p-4 ${toneClasses[status.tone].card}`}>
            <div className="flex items-center justify-between gap-3">
              <StatusBadge tone={statusToneMap[status.tone]} icon={<StatusGlyph />}>
                {status.label}
              </StatusBadge>
              <StatusStateIcon label={status.label} tone={status.tone} />
            </div>
            <p className={`mt-3 text-sm font-bold leading-6 ${toneClasses[status.tone].text}`}>{status.detail}</p>
          </article>
        ))}
      </div>
      <div className="mt-4 rounded-2xl border border-[#DED6CA] bg-white p-4">
        <h3 className="text-lg font-semibold">Shared StatusBadge tones</h3>
        <p className="mt-1 text-sm font-normal leading-6 text-[#696159]">
          Every tone pairs color with a visible label and optional icon; state meaning never depends on color alone.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {statusBadgeToneExamples.map((status) => (
            <div key={status.tone} className="rounded-xl border border-[#DED6CA] bg-[#FFFDF8] p-3">
              <StatusBadge tone={status.tone} icon={<StatusGlyph />}>
                {status.label}
              </StatusBadge>
              <p className="mt-2 text-xs font-medium leading-5 text-[#696159]">{status.detail}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        <MessageBlock title="Inline message" body="W09 selected on the published map." tone="info" />
        <MessageBlock title="Banner" body="Draft has unpublished changes. Review before publishing." tone="warning" />
        <MessageBlock title="Toast / quiet success" body="Saved draft seat W12." tone="success" />
        <MessageBlock title="Dialog error" body="Publish did not complete. Retry when ready." tone="danger" />
      </div>
    </Section>
  );
}

function MarkerSection() {
  return (
    <Section id="markers" eyebrow="07 map system" title="Seat Marker System">
      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Integrated markers</h3>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
                Markers anchor to spatial truth while selected and search states visually win. Long names ellipsize inside the chip.
              </p>
            </div>
            <StatusBadge tone="draft" icon={<StatusGlyph />}>High priority</StatusBadge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {markerStates.map((marker) => (
              <MarkerSpec key={marker.name} marker={marker} />
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-[#eef2f7] p-4">
          <h3 className="text-lg font-semibold">Density, anchor, and stacking</h3>
          <div className="mt-4 overflow-hidden rounded-2xl border border-white bg-white shadow-[0_16px_44px_rgba(15,23,42,0.1)]">
            <MapSurface />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <MessageBlock title="Compact density" body="Use seat label only in dense areas." tone="neutral" />
            <MessageBlock title="Standard density" body="Show label and name when space allows." tone="info" />
            <MessageBlock title="Stacking priority" body="Selected, search, focus, active mode, passive." tone="warning" />
          </div>
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-xs font-bold leading-5 text-slate-600">
            Accessible label example: &quot;Selected published seat W09, PAM, West Pod. Press Enter for read-only details.&quot;
          </div>
          <div className="mt-4 rounded-2xl border border-[#DED6CA] bg-white p-4">
            <h3 className="text-base font-semibold">Marker semantic recipes</h3>
            <p className="mt-1 text-sm font-normal leading-6 text-[#696159]">
              Prototype vocabulary (warm palette). The production SeatMarker now carries the full 17-state taxonomy in charcoal values via the --sp-legend-*/--sp-marker-* tokens; these warm recipes stay for concept comparison only.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {Object.keys(markerStateClassRecipes).map((state) => (
                <code key={state} className="rounded-lg border border-[#DED6CA] bg-[#F7F6F2] px-3 py-2 text-xs font-semibold text-[#353532]">
                  {state}
                </code>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

function SearchSection() {
  return (
    <Section id="search" eyebrow="08 search" title="Search and Result Rows">
      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-lg font-semibold">Search states</h3>
          <div className="mt-4 grid gap-3">
            {searchStates.map((state) => (
              <SearchRow key={state.state} state={state} />
            ))}
          </div>
        </div>
        <div className="grid gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-lg font-semibold">Desktop tray anatomy</h3>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <Field label="Search published seating" value="Pam" helper="2 results - 1 mapped" />
              <div className="mt-3 grid gap-2">
                <SearchRow state={searchStates[3]} />
                <SearchRow state={searchStates[4]} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="min-h-11 rounded-xl bg-[#171A1D] px-4 text-sm font-semibold text-white">Show on map</button>
                <button type="button" className="min-h-11 rounded-xl border border-[#BEB4A8] bg-white px-4 text-sm font-semibold">Clear search</button>
              </div>
            </div>
          </div>
          <div className="rounded-[24px] border border-[#DED6CA] bg-[#171A1D] p-3 text-white">
            <div className="rounded-[20px] bg-white p-3 text-[#070A0D]">
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#C2410C]">Mobile bottom sheet</p>
              <h3 className="mt-1 text-base font-semibold">2 results for Pam</h3>
              <div className="mt-3 grid gap-2">
                <SearchRow state={searchStates[3]} />
                <SearchRow state={searchStates[4]} />
              </div>
              <button type="button" className="mt-3 min-h-11 w-full rounded-xl bg-[#C2410C] text-sm font-semibold text-white">Show on map</button>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

function InspectorSection() {
  return (
    <Section id="inspector" eyebrow="09 planning" title="Planning Inspector">
      <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
        <InspectorCard state="Assigned seat" status="Clean" person="PAM" primaryAction="Save draft" />
        <div className="grid gap-4">
          <InspectorCard state="Available seat" status="Dirty" person="Unassigned" primaryAction="Assign to W12" compact />
          <InspectorCard state="Protected seat" status="Blocked" person="ALEX" primaryAction="Move person" compact danger />
          <InspectorCard state="Custom seat" status="Saved" person="Unassigned" primaryAction="Delete custom seat" compact warning />
        </div>
      </div>
    </Section>
  );
}

function PublishSection() {
  const examples: PublishExample[] = [
    {
      state: "Ready",
      heading: "Ready to publish reviewed changes",
      description: "Publishing copies the saved draft map to the read-only viewer. Until publish completes, viewers keep seeing the currently published map.",
      action: "Publish reviewed changes",
      tone: "warning",
      counts: [1, 2, 1, 1],
      total: 5
    },
    {
      state: "No changes",
      heading: "Draft matches published",
      description: "The saved draft already matches the published viewer map. No publish action is needed.",
      action: "No changes to publish",
      tone: "success",
      counts: [0, 0, 0, 0],
      total: 0,
      compact: true
    },
    {
      state: "Blocked",
      heading: "Save or discard seat edits first",
      description: "Save or discard the open seat edits before reviewing the saved draft. Viewers continue seeing the published map.",
      action: "Keep editing",
      tone: "danger",
      counts: [1, 1, 0, 1],
      total: 3,
      compact: true
    },
    {
      state: "Publishing",
      heading: "Publishing reviewed changes",
      description: "Publishing the reviewed draft now. Viewers continue seeing the current published map until this completes.",
      action: "Publishing...",
      tone: "info",
      counts: [1, 2, 1, 1],
      total: 5,
      compact: true,
      busy: true
    },
    {
      state: "Error",
      heading: "Publish did not complete",
      description: "The publish did not complete. The viewer map remains unchanged. Review the error and retry.",
      action: "Retry publish",
      tone: "danger",
      counts: [1, 2, 1, 1],
      total: 5,
      compact: true
    },
    {
      state: "Success concept",
      heading: "Published map updated",
      description: "The published map was updated successfully. Viewers now see the reviewed version.",
      action: "View published map",
      secondaryAction: "Close",
      tone: "success",
      counts: [1, 2, 1, 1],
      total: 5,
      compact: true
    }
  ];

  return (
    <Section id="publish" eyebrow="10 review-led" title="Publish Review">
      <div className="grid gap-4 xl:grid-cols-[1fr_0.82fr]">
        <PublishDialog example={examples[0]} />
        <div className="grid gap-4">
          {examples.slice(1).map((example) => (
            <PublishDialog key={example.state} example={example} />
          ))}
        </div>
      </div>
      <p className="mt-4 rounded-2xl border border-[#DED6CA] bg-[#FFFDF8] p-4 text-sm font-normal leading-6 text-[#696159]">
        Browser-simulated concept states only. This board never executes a real publish action.
      </p>
    </Section>
  );
}

function PanelsSection() {
  return (
    <Section id="panels" eyebrow="11 layers" title="Panels, Drawers, and Sheets">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {panelStates.map((panel) => (
          <article key={panel.title} className={`flex min-h-[220px] flex-col rounded-2xl border p-4 ${toneClasses[panel.tone].card}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">{panel.title}</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{panel.subtitle}</p>
              </div>
              <button type="button" className="grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-white text-sm font-semibold" aria-label={`Close ${panel.title}`}>x</button>
            </div>
            <div className="mt-4 rounded-xl border border-white/80 bg-white/80 p-3 text-xs font-bold leading-5 text-slate-600">
              Header, body, safety copy, sticky footer, and a clear close behavior. On mobile this layer owns the interaction surface.
            </div>
            <button type="button" className="mt-auto min-h-11 rounded-xl bg-[#171A1D] px-4 text-sm font-semibold text-white">{panel.footer}</button>
          </article>
        ))}
      </div>
    </Section>
  );
}

function ResponsiveSection() {
  return (
    <Section id="responsive" eyebrow="12 responsive" title="Responsive Examples">
      <div className="grid gap-4">
        <div className="grid gap-4 xl:grid-cols-4">
          <Composition title="Desktop viewer" subtitle="Search-led finder with map confirmation." />
          <Composition title="Admin planning" subtitle="Workflow-led canvas with inspector support." />
          <Composition title="Publish review" subtitle="Review-led dialog before viewer changes." />
          <Composition title="Management" subtitle="List/detail pattern for operational data." />
        </div>
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-lg font-semibold">Tablet</h3>
            <p className="mt-1 text-sm font-semibold text-slate-600">Map with overlay inspector and touch-friendly controls.</p>
            <div className="mt-4 rounded-2xl bg-slate-100 p-3">
              <MapSurface compact />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <MobileFrame title="Viewer map + result sheet" action="Show on map" />
            <MobileFrame title="Planning map + inspector sheet" action="Save draft" />
            <MobileFrame title="Publish review sheet" action="Publish changes" />
            <MobileFrame title="Management list + detail sheet" action="Save changes" />
          </div>
        </div>
        <div className="rounded-2xl border border-[#BFD4C4] bg-[#DDE9DF] p-4 text-sm font-medium leading-6 text-[#284C3B]">
          390px rule: no horizontal overflow, no clipped labels, comfortable touch targets, one active task at a time.
        </div>
      </div>
    </Section>
  );
}

function PreferAvoidSection() {
  return (
    <Section id="prefer-avoid" eyebrow="13 editorial" title="Prefer / Avoid">
      <div className="grid gap-4 lg:grid-cols-2">
        <ListPanel title="Prefer" items={preferItems} tone="success" />
        <ListPanel title="Avoid" items={avoidItems} tone="danger" />
      </div>
    </Section>
  );
}

function TokenPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="mb-4 text-lg font-semibold">{title}</h3>
      <div className="grid gap-3">{children}</div>
    </div>
  );
}

function Field({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <span className="mt-1 flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700">
        {value}
      </span>
      <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{helper}</span>
    </label>
  );
}

function ControlShell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <button type="button" className="mt-1 flex min-h-11 w-full items-center justify-between rounded-xl border border-[#BEB4A8] bg-white px-3 text-sm font-semibold outline-none transition hover:border-[#D46A24] focus-visible:ring-4 focus-visible:ring-[#D46A24]/35">
        {children}
        <span aria-hidden="true" className="text-slate-400">v</span>
      </button>
    </div>
  );
}

function MessageBlock({ title, body, tone }: { title: string; body: string; tone: string }) {
  return (
    <div className={`rounded-2xl border p-3 ${toneClasses[tone].card}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${toneClasses[tone].text}`}>{title}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">{body}</p>
    </div>
  );
}

function MarkerSpec({ marker }: { marker: MarkerState }) {
  return (
    <article className="rounded-2xl border border-[#DED6CA] bg-[#F7F6F2] p-3">
      <div className="flex items-start gap-3">
        <SeatMarker marker={marker} />
        <div className="min-w-0">
          <h4 className="text-sm font-semibold leading-snug">{marker.name}</h4>
          <p className="text-xs font-normal leading-5 text-[#696159]">{marker.note}</p>
        </div>
      </div>
      <p className="mt-3 rounded-xl bg-white p-2 text-xs font-medium leading-5 text-[#696159]">ARIA: {marker.aria}</p>
    </article>
  );
}

function SeatMarker({ marker }: { marker: MarkerState }) {
  return (
    <button
      type="button"
      aria-label={marker.aria}
      className={`flex h-12 min-w-16 max-w-24 flex-col items-center justify-center rounded-lg border px-2 text-center text-[11px] font-semibold leading-none outline-none transition focus-visible:ring-4 focus-visible:ring-[#D46A24]/45 ${marker.className}`}
    >
      <span>{marker.label}</span>
      {marker.sublabel ? <span className="mt-1 max-w-full truncate text-[10px] opacity-80">{marker.sublabel}</span> : null}
    </button>
  );
}

function MapSurface({ compact = false }: { compact?: boolean }) {
  const points = [
    { top: "31%", left: "26%", marker: markerStates[3] },
    { top: "28%", left: "46%", marker: markerStates[4] },
    { top: "51%", left: "62%", marker: markerStates[9] },
    { top: "62%", left: "34%", marker: markerStates[7] },
    { top: "45%", left: "78%", marker: markerStates[16] }
  ];
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-white ${compact ? "h-72" : "h-full min-h-[360px]"}`}>
      <div
        className="absolute inset-0 bg-cover bg-center opacity-95"
        style={{ backgroundImage: "url('/images/office-floor-plan.webp?v=map-v2-cool-2x-3822x1734')" }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-slate-950/10" aria-hidden="true" />
      {points.map((point) => (
        <div key={`${point.top}-${point.left}`} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ top: point.top, left: point.left }}>
          <SeatMarker marker={point.marker} />
        </div>
      ))}
      <div className="absolute left-3 top-3 rounded-full border border-white/80 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700">
        Spatial truth
      </div>
    </div>
  );
}

function SearchRow({ state }: { state: SearchState }) {
  const tone = toneClasses[state.tone];
  return (
    <button type="button" className={`grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border bg-white p-3 text-left outline-none transition hover:border-[#D46A24] hover:bg-[#F6E7D8]/60 focus-visible:ring-4 focus-visible:ring-[#D46A24]/35 ${tone.border}`}>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{state.state}</span>
        <span className="mt-1 block truncate text-sm font-semibold text-slate-950">{state.title}</span>
        <span className="mt-1 block truncate text-xs font-semibold text-slate-500">{state.meta}</span>
      </span>
      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ring-1 ${tone.chip}`}>{state.label}</span>
    </button>
  );
}

function InspectorCard({
  state,
  status,
  person,
  primaryAction,
  compact = false,
  danger = false,
  warning = false
}: {
  state: string;
  status: string;
  person: string;
  primaryAction: string;
  compact?: boolean;
  danger?: boolean;
  warning?: boolean;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_36px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#C2410C]">Planning inspector</p>
          <h3 className="mt-1 text-lg font-semibold">{state}</h3>
        </div>
        <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ring-1 ${danger ? toneClasses.danger.chip : warning ? toneClasses.warning.chip : toneClasses.success.chip}`}>
          {status}
        </span>
      </div>
      <div className={`mt-4 grid gap-3 ${compact ? "" : "md:grid-cols-2"}`}>
        <InfoBox label="Seat summary" value="W12 - West Pod" />
        <InfoBox label="Assignment" value={person} />
        <InfoBox label="Metadata" value="Available - Custom note ready" />
        <InfoBox label="Draft-only impact" value="Changes remain hidden until publish." />
        <InfoBox label="Rules / safety" value={danger ? "Protected original seat cannot be deleted." : "Custom deletion stays guarded."} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="min-h-11 rounded-xl bg-[#C2410C] px-4 text-sm font-semibold text-white">{primaryAction}</button>
        <button type="button" className="min-h-11 rounded-xl border border-[#BEB4A8] bg-white px-4 text-sm font-semibold">Cancel</button>
        <button type="button" className="min-h-11 rounded-xl border border-[#BEB4A8] bg-white px-4 text-sm font-semibold">Move</button>
        <button type="button" className="min-h-11 rounded-xl border border-[#BEB4A8] bg-white px-4 text-sm font-semibold">Swap</button>
        <button type="button" className="min-h-11 rounded-xl border border-[#D9A296] bg-[#F3DAD2] px-4 text-sm font-semibold text-[#7E2F24]">Vacate</button>
      </div>
    </article>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

type PublishExample = {
  state: string;
  heading: string;
  description: string;
  action: string;
  secondaryAction?: string;
  tone: string;
  counts: [number, number, number, number];
  total: number;
  compact?: boolean;
  busy?: boolean;
};

function pluralizeChange(count: number) {
  return `${count} ${count === 1 ? "change" : "changes"}`;
}

function PublishDialog({ example }: { example: PublishExample }) {
  const impactGroups = ["People impact", "Seat inventory", "Layout", "Metadata"] as const;
  const badgeTone = statusToneMap[example.tone];

  return (
    <article className="rounded-2xl border border-[#DED6CA] bg-white p-4 shadow-[0_16px_46px_rgba(23,26,29,0.1)]">
      <div className={`rounded-xl border p-3 ${toneClasses[example.tone].card}`}>
        <StatusBadge tone={badgeTone} icon={<StatusGlyph />}>{example.state}</StatusBadge>
        <h3 className="mt-3 text-base font-semibold">{example.heading}</h3>
        <p className="mt-2 text-sm font-normal leading-6 text-[#353532]">
          {example.description}
        </p>
      </div>
      {!example.compact ? (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            {impactGroups.map((label, index) => (
              <div key={label} className="rounded-xl border border-[#DED6CA] bg-[#F7F6F2] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#696159]">{label}</p>
                <p className="mt-2 text-2xl font-bold">{pluralizeChange(example.counts[index])}</p>
              </div>
            ))}
          </div>
          <div className="mt-2 rounded-xl border border-[#DED6CA] bg-white p-3 text-xs font-medium leading-5 text-[#696159]">
            Total publish changes: {pluralizeChange(example.total)}. Impact groups can overlap, so group counts are not additive. Total publish changes is the unique publish-summary total.
          </div>
        </>
      ) : null}
      <div className="sticky bottom-0 mt-4 grid grid-cols-2 gap-2 border-t border-[#DED6CA] bg-white pt-3">
        <DesignSystemButton variant="secondary">{example.secondaryAction ?? "Cancel"}</DesignSystemButton>
        <DesignSystemButton
          variant={example.tone === "danger" ? "destructive" : "primary"}
          disabled={example.busy || example.action.includes("No changes")}
          loading={example.busy}
        >
          {example.action}
        </DesignSystemButton>
      </div>
    </article>
  );
}

function Composition({ title, subtitle }: { title: string; subtitle: string }) {
  const isViewer = title.includes("viewer");
  const isPlanning = title.includes("planning");
  const isPublish = title.includes("Publish");

  return (
    <article className="rounded-2xl border border-[#DED6CA] bg-white p-4">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 min-h-12 text-sm font-normal leading-6 text-[#696159]">{subtitle}</p>
      <div className="mt-3 rounded-xl bg-[#F7F6F2] p-2">
        {isViewer ? (
          <>
            <div className="rounded-lg border border-[#DED6CA] bg-white p-2">
              <div className="h-8 rounded-lg border border-[#BEB4A8] bg-[#FFFDF8] px-3 pt-1.5 text-xs font-medium text-[#696159]">Search person, seat, department, zone</div>
            </div>
            <div className="mt-2 grid grid-cols-[1fr_94px] gap-2">
              <div className="rounded-lg border border-[#DED6CA] bg-[#ECE7DE] p-2">
                <div className="h-16 rounded-lg bg-white/70" />
                <div className="mt-2 flex gap-1">
                  <span className="h-7 w-10 rounded-md border border-[#2F6668] bg-[#DCEDEA]" />
                  <span className="h-7 w-10 rounded-md border border-[#C2410C] bg-[#171A1D]" />
                </div>
              </div>
              <div className="rounded-lg border border-[#DED6CA] bg-white p-2">
                <p className="text-[10px] font-semibold uppercase text-[#244E50]">Read-only</p>
                <div className="mt-2 h-3 rounded bg-[#DCEDEA]" />
                <div className="mt-1 h-3 rounded bg-[#F7F6F2]" />
              </div>
            </div>
          </>
        ) : null}
        {isPlanning ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full bg-[#F1E2C4] px-2 py-1 text-[10px] font-semibold text-[#6D4712]">Draft has changes</span>
              <span className="h-7 flex-1 rounded-lg border border-[#DED6CA] bg-white" />
            </div>
            <div className="mt-2 grid grid-cols-[1fr_92px] gap-2">
              <div className="rounded-lg bg-[#ECE7DE] p-2">
                <div className="h-20 rounded-lg bg-white/70" />
                <div className="mt-2 flex gap-1">
                  <span className="h-7 w-10 rounded-md border border-[#C2410C] bg-[#171A1D]" />
                  <span className="h-7 w-10 rounded-md border border-[#9A6418] bg-[#F1E2C4]" />
                </div>
              </div>
              <div className="rounded-lg border border-[#DED6CA] bg-white p-2">
                <p className="text-[10px] font-semibold uppercase text-[#C2410C]">Inspector</p>
                <div className="mt-2 h-3 rounded bg-[#F6E7D8]" />
                <div className="mt-1 h-8 rounded bg-[#F7F6F2]" />
              </div>
            </div>
          </>
        ) : null}
        {isPublish ? (
          <>
            <div className="rounded-lg border border-[#D7B26C] bg-[#F1E2C4] p-2">
              <p className="text-[10px] font-semibold uppercase text-[#6D4712]">Ready</p>
              <div className="mt-1 h-3 rounded bg-white/80" />
              <div className="mt-1 h-3 rounded bg-white/60" />
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1">
              {[1, 2, 1, 1].map((count, index) => (
                <div key={index} className="rounded-lg border border-[#DED6CA] bg-white p-1 text-center text-xs font-semibold">{count}</div>
              ))}
            </div>
            <div className="mt-2 h-9 rounded-lg bg-[#C2410C]" />
          </>
        ) : null}
        {!isViewer && !isPlanning && !isPublish ? (
          <>
            <div className="grid grid-cols-[96px_1fr] gap-2">
              <div className="rounded-lg border border-[#DED6CA] bg-white p-2">
                <div className="h-4 rounded bg-[#DDE9DF]" />
                <div className="mt-2 h-4 rounded bg-[#F7F6F2]" />
                <div className="mt-2 h-4 rounded bg-[#F7F6F2]" />
              </div>
              <div className="rounded-lg border border-[#DED6CA] bg-white p-2">
                <p className="text-[10px] font-semibold uppercase text-[#353532]">Record detail</p>
                <div className="mt-2 h-3 rounded bg-[#F7F6F2]" />
                <div className="mt-1 h-3 rounded bg-[#F7F6F2]" />
                <div className="mt-2 rounded-lg bg-[#DDE9DF] px-2 py-1 text-[10px] font-medium text-[#284C3B]">Impact-aware</div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </article>
  );
}

function MobileFrame({ title, action }: { title: string; action: string }) {
  return (
    <article className="rounded-[28px] border-4 border-[#171A1D] bg-[#171A1D] p-2">
      <div className="overflow-hidden rounded-[22px] bg-[#ECE7DE]">
        <div className="h-36 bg-white p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#C2410C]">390px</p>
          <h3 className="mt-1 text-base font-semibold">{title}</h3>
          <div className="mt-3 h-8 rounded-xl border border-[#DED6CA] bg-[#FFFDF8]" />
          <div className="mt-2 h-10 rounded-xl bg-[#ECE7DE]" />
        </div>
        <div className="rounded-t-[22px] border border-[#DED6CA] bg-white p-3 shadow-[0_-18px_44px_rgba(23,26,29,0.18)]">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[#BEB4A8]" />
          <p className="text-sm font-normal leading-6 text-[#696159]">One active task owns the mobile layer.</p>
          <button type="button" className="mt-3 min-h-11 w-full rounded-xl bg-[#C2410C] text-sm font-semibold text-white">{action}</button>
        </div>
      </div>
    </article>
  );
}

function ListPanel({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${toneClasses[tone].card}`}>
      <h3 className="text-lg font-semibold">{title}</h3>
      <ul className="mt-3 grid gap-2">
        {items.map((item) => (
          <li key={item} className="rounded-xl border border-white/80 bg-white/80 p-3 text-sm font-bold leading-6 text-slate-700">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

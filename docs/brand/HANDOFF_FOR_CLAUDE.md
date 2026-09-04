# MEGEREDCHIAN LAW - Claude Code Handoff
## Replace IBM Blue with Terracotta Brand System

**Date:** 2026-05-13
**Brand:** Megeredchian Law
**Task:** Replace IBM default colors (#0f62fe blue) with custom terracotta #B85C2E across Carbon v11/v12 app

---

### 1. CONTEXT
App was built using IBM Carbon default:
- IBM Blue: #0f62fe (interactive, buttons, links, AI border)
- Gray 10: #f4f4f4 canvas, Gray 100: #161616 header/rails
- Need to re-brand to law firm: terracotta #B85C2E (AA PASS 4.56:1) instead of IBM blue

Logo colors extracted from `image_B2C2B4BB-B467-4CBE-898B-626F017F9642.jpeg`:
- Logo Orange #EB7C35 (235,124,53) - LOGO MARK ONLY, 2.81:1 FAILS, do NOT use for UI
- Terracotta UI #B85C2E (184,92,46) - PRIMARY UI, 4.56:1 AA PASS, use for everything
- Hover #8F4521, Light #F5DDD1
- Charcoal #5D5C5B (93,92,91) - secondary text

---

### 2. FILES TO USE
- `megeredchian-law-tokens.css` - Drop-in CSS with full Carbon token overrides (g10 + g100)
- `megeredchian-law-tokens.json` - Design tokens JSON
- Logo: /mnt/data/image_B2C2B4BB-B467-4CBE-898B-626F017F9642.jpeg -> header should use custom M mark (charcoal back M #5D5C5B, terracotta front M #B85C2E) + text "MEGEREDCHIAN LAW" 13px uppercase tracking 1.5px

Reference builds (working previews):
- Terracotta Shell: megeredchian-law-terracotta_agentic_artifact_2_f40403e267ee.html
- Brand Sheet: megeredchian-brand-sheet_agentic_artifact_3_890cfd76be5e.html

---

### 3. IMPLEMENTATION STEPS FOR CLAUDE CODE

#### Step A: Install CSS (DO THIS FIRST)
1. Copy `megeredchian-law-tokens.css` to `src/styles/brand/` or `styles/`
2. Import in root: `import '@/styles/brand/megeredchian-law-tokens.css'` or in `_app.tsx` / `globals.css`
3. Ensure it loads AFTER @carbon/styles

#### Step B: Wrap themes
Ensure header, left rail, inspector use `data-carbon-theme="g100"` and canvas uses `data-carbon-theme="g10"`. The CSS relies on these attributes.

```tsx
<div data-carbon-theme="g100">
  <Header /> 
  <SideNav />
</div>
<div data-carbon-theme="g10">
  <MainContent />
</div>
<div data-carbon-theme="g100">
  <Inspector />
</div>
```

#### Step C: Find & Replace IBM Blue
Search codebase for:

| Find IBM | Replace With | Token |
|----------|--------------|-------|
| #0f62fe | #B85C2E | --cds-button-primary |
| #0353e9 / #002d9c | #8F4521 | --cds-button-primary-hover |
| #4589ff / #a6c8ff | #E8A07A (dark) / #F5DDD1 (light) | links dark |
| --cds-interactive: #0f62fe | #B85C2E | |
| --cds-border-interactive: #0f62fe | #B85C2E | |
| --cds-link-primary: #0f62fe | #8F4521 (g10) / #E8A07A (g100) | |
| --cds-focus: #0f62fe | #B85C2E | |
| --cds-ai-border-strong (blue) | #B85C2E | |
| --cds-ai-aura-start (blue rgba) | rgba(184,92,46,0.10) | |

Grep commands:
```
grep -r "0f62fe" src/
grep -r "#0F62FE" src/
grep -r "interactive.*#0" src/
grep -r "cds.*ai.*border" src/
```

#### Step D: Update Theme Objects (if using SCSS/JS themes)
If using `createTheme` or Carbon Theme provider:

```ts
// Before (IBM)
const g10 = { ...baseG10, interactive: '#0f62fe', buttonPrimary: '#0f62fe' }

// After (Meger edchian)
const g10Custom = {
  ...baseG10,
  buttonPrimary: '#B85C2E',
  buttonPrimaryHover: '#8F4521',
  borderInteractive: '#B85C2E',
  interactive: '#B85C2E',
  linkPrimary: '#8F4521',
  focus: '#B85C2E',
  backgroundBrand: '#B85C2E',
  aiBorderStrong: '#B85C2E',
  aiBorderStart: 'rgba(184,92,46,0.64)',
  aiBorderEnd: '#B85C2E',
  aiAuraStart: 'rgba(184,92,46,0.06)',
}
```

Same for g100 but linkPrimary = '#E8A07A'

#### Step E: Logo & Header
Replace IBM "Watson" header with:
- Custom M mark: two overlapping M shapes
  - Back M: #5D5C5B
  - Front M: #B85C2E
  - SVG or div with clip-path
- Text: "MEGEREDCHIAN LAW" - IBM Plex Sans Medium 13px, letter-spacing 1.5px, uppercase, #f4f4f4 on g100
- Keep hamburger animation

#### Step F: Verify
1. Primary buttons orange terracotta #B85C2E, hover #8F4521, white text
2. Active nav left border 3px solid #B85C2E, bg #393939
3. Links: g10 #8F4521, g100 #E8A07A
4. AI tiles: bottom border 1px solid #B85C2E, aura radial gradient rgba(184,92,46,0.06), inner shadow
5. Focus rings #B85C2E
6. No #0f62fe remaining (except maybe in node_modules)
7. Contrast check: #B85C2E on white = 4.56:1 PASS

---

### 4. TOKENS (copy-paste)

```css
:root {
  --brand-terracotta: #B85C2E;
  --brand-terracotta-hover: #8F4521;
  --brand-terracotta-light: #F5DDD1;
  --brand-charcoal: #5D5C5B;
}
[data-carbon-theme="g10"] {
  --cds-button-primary: #B85C2E;
  --cds-button-primary-hover: #8F4521;
  --cds-border-interactive: #B85C2E;
  --cds-interactive: #B85C2E;
  --cds-link-primary: #8F4521;
  --cds-focus: #B85C2E;
  --cds-ai-border-strong: #B85C2E;
}
[data-carbon-theme="g100"] {
  --cds-button-primary: #B85C2E;
  --cds-link-primary: #E8A07A;
  --cds-ai-border-strong: #B85C2E;
}
```

Full file in `megeredchian-law-tokens.css`

---

### 5. DO / DON'T
DO:
- Use #B85C2E for all interactive UI
- Keep g100 #161616 dark for header/rails (neutral)
- Keep g10 #f4f4f4 / white for canvas layers
- Use charcoal #5D5C5B for secondary text

DON'T:
- Don't use #EB7C35 bright orange for buttons/text (fails AA)
- Don't use IBM blue #0f62fe anywhere in src/
- Don't brand entire background orange
- Don't use rounded corners except AILabel 4px

---

### 6. TEST COMMANDS
```bash
# Check no IBM blue remains
grep -R "0f62fe" --include="*.tsx" --include="*.ts" --include="*.css" --include="*.scss" src/ | grep -v node_modules

# Build
npm run build

# Verify tokens loaded
# Open devtools, check computed style for button: background should be rgb(184,92,46)
```

---

Send this entire folder to Claude Code and tell it to implement Step A-F.


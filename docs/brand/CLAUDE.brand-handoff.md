# CLAUDE.md - Megeredchian Law

## Project: Megeredchian Law - Carbon v11/v12 Next App
This project was re-designed from IBM Carbon default to custom law firm brand.

### Brand System (LOCKED - Do not change without approval)

**Logo:** image_B2C2B4BB-B467-4CBE-898B-626F017F9642.jpeg
- Logo Orange #EB7C35 (235,124,53) - **MARK ONLY** - 2.81:1 FAILS WCAG - Do NOT use for UI buttons/text/links
- Charcoal #5D5C5B (93,92,91) - secondary text / back M

**Primary UI (Use for EVERYTHING):**
- Terracotta #B85C2E (184,92,46) - PRIMARY - 4.56:1 AA PASS on white, 3.97:1 on #161616
- Hover #8F4521
- Active #7A3A1C
- Light tint #F5DDD1 (AI aura bg)
- Lighter #FBE8DC

**Carbon Mapping - THIS IS THE SOURCE OF TRUTH:**
```css
[data-carbon-theme="g10"] {
  --cds-button-primary: #B85C2E;
  --cds-button-primary-hover: #8F4521;
  --cds-border-interactive: #B85C2E;
  --cds-interactive: #B85C2E;
  --cds-link-primary: #8F4521;
  --cds-focus: #B85C2E;
  --cds-background-brand: #B85C2E;
  --cds-ai-border-strong: #B85C2E;
  --cds-ai-border-start: rgba(184,92,46,0.64);
  --cds-ai-border-end: #B85C2E;
  --cds-ai-aura-start: rgba(184,92,46,0.06);
}

[data-carbon-theme="g100"] {
  --cds-button-primary: #B85C2E;
  --cds-button-primary-hover: #8F4521;
  --cds-border-interactive: #B85C2E;
  --cds-link-primary: #E8A07A; /* lighter for dark bg */
  --cds-focus: #B85C2E;
  --cds-ai-border-strong: #B85C2E;
  --cds-ai-aura-start: rgba(184,92,46,0.10);
}
```

**Files:**
- `src/styles/brand/megeredchian-law-tokens.css` - Must be imported AFTER @carbon/styles
- `src/styles/brand/megeredchian-law-tokens.json`
- Logo: `public/Logo-Megeredchian-Law.jpg`

**Layout:**
- Header, left rail, inspector = `data-carbon-theme="g100"` (#161616 bg)
- Canvas = `data-carbon-theme="g10"` (#f4f4f4 bg, white layers)
- Active nav: left border 3px solid #B85C2E, bg #393939
- Header M mark: back M #5D5C5B, front M #B85C2E (overlapping), text "MEGEREDCHIAN LAW" Plex Sans Medium 13px uppercase tracking 1.5px

### Rules for All Future Plans

1. NEVER use IBM blue #0f62fe, #0353e9, #4589ff, #a6c8ff in src/
   - Grep check: `grep -R "0f62fe" src/` should return nothing
2. NEVER use #EB7C35 bright orange for UI text/buttons/links (fails AA)
3. ALWAYS use #B85C2E for primary actions, borders, focus, AI
4. ALWAYS use #8F4521 for hover states
5. Verify contrast: #B85C2E on white = 4.56:1 PASS, #B85C2E on #161616 = 3.97:1 PASS
6. All future component plans must reference terracotta tokens, not IBM
7. If you need a new color, derive from terracotta scale, don't introduce blue

### Verification Checklist
- [ ] Primary buttons bg rgb(184,92,46) (#B85C2E)
- [ ] Hover bg #8F4521
- [ ] Focus rings #B85C2E
- [ ] Active nav left border 3px solid #B85C2E
- [ ] Links g10 #8F4521 / g100 #E8A07A
- [ ] AI tile bottom border 1px solid #B85C2E + aura rgba(184,92,46,0.06)
- [ ] No #0f62fe in src/
- [ ] Build passes

### History
- Original: IBM Carbon default blue #0f62fe
- 2026-05-13: Migrated to terracotta #B85C2E for WCAG AA + premium law aesthetic
- Bright orange #EB7C35 retained only in logo mark

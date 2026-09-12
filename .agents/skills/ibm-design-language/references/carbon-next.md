# Carbon Next / v12: verified guidance

Reviewed 2026-09-11. Context7 resolved `/carbon-design-system/carbon`; queries
covered v12 adoption, custom theming and spacing. Its returned version list
ended at v11.111.1, so that list is not proof of the latest npm release. It did
not resolve a separate IBM Design Language library. Official IBM/Carbon pages
supplement the indexed documentation. Recheck these live sources for migrations.

## Release and design direction

[Carbon Next](https://preview.carbondesignsystem.com/carbon-next), updated
2026-08-12, describes v12 as upcoming: progressive disclosure, clearer hierarchy,
motion connecting tasks, reusable layouts, AI tooling and more open theming.
Use this as direction, not permission to invent token values or change an
approved product design.

The [release page](https://carbondesignsystem.com/all-about-carbon/releases/)
still lists v11. Carbon packages have independent version numbers; Carbon v11
does not mean `@carbon/react@11`. Preview Storybook headings are not evidence
that a matching package is published. Inspect the project's manifest, lockfile
and installed exports before suggesting imports or upgrades.

## Preview flags and scope

The [v12 working guide](https://github.com/carbon-design-system/carbon/blob/main/docs/working-with-v12.md)
documents development inside v11. `enable-v12-release` defaults to false and
enables every `enable-v12-*` flag. React exposes `enableV12Release` on
`FeatureFlags`; Sass uses the feature-flags module configuration. Configure
the relevant runtime and compiled-style scopes together, once per Sass module.
Use individual flags to isolate a migration behavior. Ordinary `enable-*` flags
are not automatically included. The preview Storybooks are separate from the
default visual regression coverage.

Consult the [flag inventory](https://github.com/carbon-design-system/carbon/blob/main/docs/feature-flags.md)
for exact package support and codemods; do not assume every flag exists in React,
Sass and Web Components. It distinguishes committed `enable-v12-*` behavior from
other opt-in features. Examples include dynamic floating styles, OverflowMenu,
tile icons, StructuredList icons and Toggle spacing. Generic flags such as
`enable-dialog-element`, `enable-presence`, `enable-enhanced-file-uploader` and
`enable-treeview-controllable` have their own availability.

Components marked Migrated in the v12 Storybook are not exported by published
v11 `@carbon/react`; the release flag does not unlock them. Check the separate
IBM Products package and its installed version when those patterns are needed.
Do not add a dependency or run a writing codemod without the task's authorization.

## Concrete migration differences

The [consumer migration guide](https://github.com/carbon-design-system/carbon/blob/main/docs/migration/v12.md)
now specifies actual changes. Review only the affected package sections:

- OverflowMenu uses MenuItem and separate MenuItemDivider children; labels and
  danger styling props change. Recheck selectors and keyboard interaction.
- Floating surfaces change positioning; inspect scrolling, clipping and
  transformed ancestors. Fixed positioning alone does not add collision handling.
- Selection indicators and reserved space change for Tile and StructuredList;
  Toggle label spacing also changes.
- Menu uses `border-radius-08`, menu items `border-radius-04`. Tags use
  `border-radius-02` when small and `border-radius-04` when medium/large,
  including matching close-button focus shapes. The old all-square/pill-tag
  rule is not a v12 requirement.
- Preview Pagination/PageSelector APIs are removed in favor of stable Pagination.

These are upstream preview contracts, not changes already implemented in Seat
Planner. Its vendored CSS is not controlled by Carbon package feature flags.

## Tokens, branding and foundations

[DTCG theme data](https://github.com/carbon-design-system/carbon/blob/main/packages/themes/src/dtcg/white.json)
exists upstream with typed values and aliases. A JSON serialization format is
not a mandate to rename public CSS variables. Verify the released output and
migration guide; never promise zero consumer impact for an entire major release.

Carbon's [Sass theme documentation](https://github.com/carbon-design-system/carbon/blob/main/packages/styles/docs/sass.md)
supports custom themes and component-token overrides. Keep product semantics
separate from upstream names and cover every theme and interaction state.
IBM's default blue does not override an approved custom brand. In Seat Planner,
retain `--sp-*` aliases, brand overrides and the governed vendored stylesheets.

[IBM 2x Grid](https://www.ibm.com/design/language/2x-grid/) retains the 8px UI
mini unit. [Carbon spacing](https://carbondesignsystem.com/elements/spacing/overview/)
also includes 2, 4 and 12px increments for component details. Use the existing
type, spacing and motion references for the baseline; validate version-sensitive
rules against the selected component rather than treating this skill as a
complete current package specification.

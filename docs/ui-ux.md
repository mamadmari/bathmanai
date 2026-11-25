# UI/UX system (from ui-ux-pro-max)

The skill lives at `.claude/skills/ui-ux-pro-max` (git-ignored, 4 MB of searchable
data). Reinstall it on a fresh clone with:

```bash
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git /tmp/uipro
cd /tmp/uipro && git sparse-checkout set .claude/skills/ui-ux-pro-max
mkdir -p .claude/skills && cp -a /tmp/uipro/.claude/skills/ui-ux-pro-max .claude/skills/
```

Regenerate the design system used here:

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py \
  "trading dashboard fintech dark professional mobile rtl" --design-system -p "Trading Wolf" -f markdown
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "bottom nav safe area" --domain ux
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "responsive grid overflow" --domain ux
```

## What was applied

| File | Role |
|---|---|
| `src/styles/ui-pro.css` | semantic tokens (`--u-*`), OLED dark palette, light overrides, focus ring, 4/8 spacing, 44px targets, table/card/input normalisation, safe areas, reduced motion, mobile app mode |
| `src/components/wolf/MobileTabBar.tsx` | bottom tab bar (≤5 tabs, SVG icons, `aria-current`, 48px + inset) |
| `src/pages/AppHome.tsx` | renders the tab bar when `variant="mobile"`; the sidebar is now an off-canvas drawer in mobile mode (it used to be `display:none`, so the burger opened nothing) |
| `index.html` | `viewport-fit=cover`, `theme-color` (dark/light), iOS standalone metas |
| `public/manifest.webmanifest` | `start_url=/m`, standalone, portrait, shortcuts to `/m`, `/pc`, `/admin` |

## Tokens (dark / OLED)

| Role | Value |
|---|---|
| background | `#020617` |
| card | `#0e1223` · card-2 `#131a2e` |
| border | `#334155` (28% / 55% mixes) |
| foreground | `#f8fafc` |
| muted foreground | `#94a3b8` |
| accent (positive/CTA) | `#22c55e` |
| danger | `#ef4444` |
| ring | `#ffffff` |

Brand gold (`--w-gold #f0c25a`) stays as the identity accent; green is the
semantic "profit/positive" colour so numbers never read ambiguously.

## Routes

* `/m` — mobile app mode: sticky blurred app bar, bottom tab bar, drawer
  navigation, single-column grids, safe-area padding.
* `/pc` — desktop mode (wide layout, sidebar).
* `/app`, `/admin` — unchanged behaviour, but they inherit the same tokens,
  focus rings, table and card treatment.

## Pre-delivery checks (from `references/pro-rules.md`)

* Icons: SVG (lucide-react) only, no emoji as structural icons in the new UI.
* Touch targets ≥44px (coarse pointer) and 48px tabs; labels always visible.
* Focus-visible ring on every interactive element; `cursor: pointer` on clickables.
* `prefers-reduced-motion` kills all transitions/animations.
* No horizontal scroll: `overflow-x: clip` on `.w-root`, `min-width: 0` on grid children, wide tables scroll inside their own container.
* Both themes validated from the token table (dark 19:1, muted 7.4:1).

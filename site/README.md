# cogni-code site

Landing page + documentation site for Cogni-Code, built with [Astro](https://astro.build) + [Starlight](https://starlight.astro.build).

## Develop

```bash
cd site
npm install
npm run dev
```

Local server at `http://localhost:4321/`.

## Build

```bash
npm run build      # outputs to dist/
npm run preview    # serve the production build locally
```

## Structure

```
src/
  pages/index.astro          # Custom landing page (hero, comparison, pipeline, CTA)
  content/docs/*.md          # Starlight docs content collection
  layouts/LandingLayout.astro
  components/BrainMark.astro
  styles/                    # Brand tokens + Starlight theme overrides
astro.config.mjs             # Starlight config (sidebar, social, theme)
src/content.config.ts        # Wires docsLoader() + docsSchema()
public/                      # Logo, favicon, architecture diagrams
```

## Theme

Brand tokens are locked to the logo palette and applied to Starlight via CSS variables in `src/styles/global.css`:

| Token | Value | Use |
|-------|-------|-----|
| `--brand-ink` | `#232323` | Text / strokes |
| `--brand-cream` | `#F7F3ED` | Background |
| `--brand-slate` | `#526B8D` | Accent (links, buttons, Starlight `--sl-color-accent`) |

Serif headings (Georgia) tie back to the wordmark.

## Deploy

The site is static HTML — deploy `dist/` anywhere (Netlify, Vercel, Cloudflare Pages, GitHub Pages).

- **`site` in `astro.config.mjs`** is currently set to `https://cogni-code.dev`. Update it to your real domain for correct canonical URLs and sitemap.
- **GitHub Pages project site** (e.g. `user.github.io/cogni-code`): add `base: '/cogni-code'` to the Astro config.
- **Custom domain or apex**: leave `base` unset (default `/`).

Content is sourced from the repo's `README.md`, `docs/`, and `examples/`. Re-sync when those change.

# Extracting the blog editor into a standalone library

Context: the dev-only editor (`editor/`, mounted at `/__edit`) is currently welded to this
site. This doc sketches what a standalone `astro-live-editor` package would look like —
and, more immediately useful, which of our current design decisions the exercise says we
should revisit even if we never extract.

The pitch that makes it worth extracting at all: **the preview is your actual site,
saves are byte-faithful git-friendly writes, and publish is one click from draft to
deployed**. Keystatic / Decap / Front Matter each miss at least one of those.

## Design decisions worth revisiting (whether or not we extract)

Ranked by how much the library lens changes the verdict on choices we already shipped.

### 1. No localhost guard on the middleware — DONE (2026-07-15)
The editor trusts anyone who can reach the dev server, and since the publish button
exists, "anyone who can reach the dev server" means "anyone who can push to prod."
Fixed: `isLocalRequest` in `middleware.mjs` requires a loopback socket AND a
localhost Host header (the latter blocks DNS-rebinding pages that trick a local
browser into hitting the dev server). Previously the only protection was Vite's
default localhost bind — a discipline rule, not a guarantee.

### 2. Client served as Vite-transformed project files — fine now, first thing to change on extraction
`main.ts` is served through the dev server's transform pipeline, which is why we need
the `optimizeDeps.include` list in `integration.mjs` and why "the editor page must never
load `/@vite/client`" is an invariant we enforce by convention (no CSS imports, no
`import.meta.env` in client code). A prebuilt client bundle (esbuild, CodeMirror bundled)
served straight from disk would kill both hacks at once: no dep-optimization dance, and
the no-vite-client invariant becomes impossible to violate rather than something every
future change has to remember. Not urgent for us — but every QOL feature that adds a
CodeMirror package pays the optimizeDeps tax again.

### 3. Style-exact frontmatter emitter — replace with "preserve when unchanged"
`frontmatter.mjs` re-emits the YAML block on every save, byte-matching our exact house
style (key order, quoting, date format). It works, but the guarantee lives in the
emitter's faithfulness. Strictly better: if no frontmatter field changed, write the
original `yamlText` back verbatim and only re-emit when a field actually changed. For a
library this is the difference between "normalizes your files on first save" and "never
touches what you didn't edit"; for us it makes body-only edits trivially byte-identical
instead of relying on emitter correctness. ~30 lines.

### 4. Frontmatter form fields hardcoded — Zod introspection is the elegant endgame
The form hardcodes title/description/pubDate/tags/draft. But the schema already exists
as a live Zod object in `src/content/config.ts`, and in dev the integration can
`server.ssrLoadModule()` it and walk the shape: `z.string()` → text input,
`z.coerce.date()` → date picker, `z.array(z.string())` → tags, `z.boolean()` → checkbox,
`.optional()` → optional. Zero-config forms for any collection. Only matters when we add
a field or a second collection — but when that happens, introspect rather than extending
the hardcoding.

### 5. Site touchpoints scattered into user code — acceptable for us, the library shows the cleaner shape
Two edits live outside `editor/`: the dev-drafts filter in `blog/[...slug].astro` and the
edit link in `PostLayout.astro`. A library can't make those edits, and its answer — an
**Astro Dev Toolbar app** ("edit this page" on every dev page, zero template changes) —
is arguably nicer than our inline link. Not worth changing here unless we're extracting;
noted so we don't scatter more touchpoints.

### 6. Hardcoded strings that should be options the day anything changes
`blog` collection, `{base}blog/{slug}` preview route, branch `main`, remote `origin`,
GitHub-Actions-shaped deploy polling. All correct for this site; all become
`editor({ ... })` options in the package. Also the editor palette is a copy of the
site's zinc theme in `editor.css` — a library ships a neutral theme with variable
overrides.

## What the package would look like

```
astro-live-editor/
├── src/integration.ts        options in, hooks out (peerDep: astro ^5)
├── src/server/               middleware, posts, frontmatter, git  (ports nearly as-is)
├── src/client/               current TS + css → prebuilt dist/ bundle
└── tests/                    vitest unit (frontmatter round-trip, git argv) + fixture-site e2e
```

```js
editor({
  collection: 'blog',
  route: '/__edit',
  previewPath: (slug) => `/blog/${slug}`,
  publish: { branch: 'main', remote: 'origin', deployStatus: 'github-actions' },
})
```

Version-compat risk to own: the middleware leans on semi-internal Astro dev behaviors
(baseMiddleware stripping the base prefix, content-layer writes triggering HMR full
reloads, `refreshContent`). Stable-ish in practice, but a published `^5` range needs a
fixture site smoke-tested in CI across Astro minors.

## Effort + path

- **"Reusable for my next site"**: ~a day. Extract to a workspace package inside this
  repo (this site stays the test fixture), opinionated defaults, publish under a personal
  scope or just keep it a template repo. Most of the day is the client build pipeline.
- **"Real community library"**: a week-plus, then maintenance. Adds Zod introspection,
  serialization strategies, the toolbar app, docs, issue triage. The niche is genuinely
  open, and it'd make a good blog post either way ("my blog's CMS is a Vite middleware").

Sane sequence if we ever do it: workspace package first → generalize only what a second
consumer actually needs → publish. Don't gold-plate the YAML patching (format-preserving
in-place edits); "preserve when unchanged" covers the real cases.

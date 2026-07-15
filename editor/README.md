# Blog editor

A dev-only, in-browser editor for the posts in `src/content/blog/`. It exists only on
the local dev server — nothing here ships in a production build (verified: `dist/`
contains no editor artifacts, no `/__edit` routes, no draft posts).

## Using it

```sh
npm run dev
```

Then open **http://localhost:4321/personalSite/__edit** — or click the **edit** link
that appears next to the date on any rendered post in dev.

- **Left pane**: the raw Markdown in CodeMirror. **Right pane**: the real dev-server
  render of the post, live-reloading ~1s after you stop typing, preserving your scroll
  position.
- **Frontmatter** (title, description, dates, tags, draft) is edited as form fields and
  serialized back in the exact house style.
- **Autosave** fires 750ms after you stop typing; every save is written straight to the
  `.md` file, so `git diff` always shows exactly what changed. Body text is written
  byte-for-byte — a save with no edits is a zero-byte diff.
- **Conflicts**: saves are hash-guarded. If the file changed on disk (e.g. edited in
  PyCharm), a banner offers *reload from disk* or *overwrite disk* instead of silently
  clobbering.
- **New posts** scaffold as `draft: true`. Drafts render in dev (so the preview works)
  but are excluded from production builds and from the public post lists.

### Keyboard shortcuts

| Keys | Action |
|---|---|
| `Cmd+S` | save immediately |
| `Cmd+F` | search & replace |
| `Cmd+B` / `Cmd+I` | bold / italic |
| `Tab` / `Shift+Tab` | indent / dedent |
| `Enter` | continues lists and blockquotes |
| `Cmd+1` / `Cmd+2` / `Cmd+3` | editor-only / split / preview-only panes |
| `Esc` | close search panel / publish modal / new-post form |

Also: fold gutter (headings and multi-line HTML blocks like `<details>` fold — handy for
skipping past inline SVG), draggable divider between panes, collapsible outline sidebar,
word count + reading time in the topbar, post-switcher dropdown, tag autocomplete drawn
from existing posts' tags. Layout choices persist in `localStorage`.

### Publish

The **publish** button commits *only the current post's file* and pushes to `main`,
which triggers the GitHub Pages deploy. Before anything happens it runs a preflight:

- must be on `main`, with no merge/cherry-pick in progress;
- fetches origin — being behind **blocks** (pull first); being ahead warns and lists the
  unpushed commits that would ride along;
- shows a colored diff of exactly what will be committed, with an editable commit
  message.

Drafts get an extra step first: checkboxes to flip `draft: false` and set the publish
date to today. After pushing, the panel polls GitHub Actions (by commit sha) and reports
when the deploy completes. If the push fails after the commit, the commit survives
locally and the next preflight surfaces it via the ahead counter — publishing again
pushes it.

The rest of the working tree is never touched: commits are pathspec-scoped to the one
file, and other staged changes stay staged.

## Architecture

```
editor/
├── integration.mjs      Astro integration; hooks only act on `astro dev`
├── server/
│   ├── middleware.mjs   connect handler at /__edit: shell HTML + JSON API; localhost guard
│   ├── posts.mjs        fs layer: list/read/write/create, slug validation, sha256 hashing
│   ├── frontmatter.mjs  split/parse (js-yaml CORE_SCHEMA) + style-exact serializer
│   └── git.mjs          publish preflight + commit/push (fixed-argv execFile, no shell)
└── client/
    ├── main.ts          entry: post list or editor view by ?slug=
    ├── editor-view.ts   editor DOM/state: form, autosave, outline, panes, preview iframe
    ├── cm-setup.ts      all CodeMirror extensions incl. custom foldService for HTML blocks
    ├── publish.ts       publish modal + deploy polling
    ├── api.ts           typed fetch wrappers; dom.ts — element helper
    └── editor.css       all styles (served via <link>, never imported from TS)
```

The integration attaches middleware to the Vite dev server in `astro:server:setup` —
a hook that never runs for builds, which is what guarantees zero production footprint.
Astro's dev server strips the `/personalSite` base prefix before our middleware runs,
so it mounts at plain `/__edit`. Saving a file triggers Astro's content-layer watcher,
which HMR-reloads the preview iframe.

## Invariants — read before changing editor code

1. **Byte fidelity.** The body is written verbatim from the editor buffer; only the
   frontmatter block is re-serialized, in the exact existing style
   (`frontmatter.mjs`). A no-op save must produce an empty `git diff`. Posts contain
   hand-authored inline SVG that must never be reformatted.
2. **The editor page must never load `/@vite/client`.** Saves broadcast an HMR
   full-reload; the preview iframe reloading is the feature, the editor page reloading
   would destroy editor state mid-keystroke. Concretely: no CSS imports and no
   `import.meta.env` anywhere under `editor/client/` (either would pull the Vite
   client in). Check the network tab after changes.
3. **Localhost only.** `isLocalRequest` in `middleware.mjs` requires a loopback socket
   *and* a localhost Host header (DNS-rebinding defense) — publish makes this editor a
   path to production. Never run `astro dev --host`.
4. **Pathspec-scoped git.** `git.mjs` must never use `add -A`, `commit -a`, or
   directory pathspecs; the dirty working tree around the editor is user state.
5. New `@codemirror/*` packages must be added to `optimizeDeps.include` in
   `integration.mjs`, or the first editor load mid-session triggers a re-optimize
   reload.
6. Server files (`editor/server/*.mjs`, `integration.mjs`) load once at server start —
   restart `npm run dev` after changing them. Client files are transformed on request —
   a browser refresh picks them up.

## Related docs

- `ideas/editor-extraction.md` — what extracting this into a standalone Astro
  integration package would look like, and the design decisions that exercise flagged.

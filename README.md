# Personal Site

Astro static site with blog, dark mode, and GitHub Pages deployment.

## Development

```sh
npm install
npm run dev
```

## Build

```sh
npm run build
npm run preview
```

## Adding a blog post

Create a file in `src/content/blog/`:

```md
---
title: "Post Title"
description: "One sentence description."
pubDate: 2026-01-05
tags: ["tag1", "tag2"]
draft: false
---

Your content here.
```

Set `draft: true` to hide from production builds.

## Deployment

Push to `main` branch. GitHub Actions will build and deploy to GitHub Pages.

Before first deploy:
1. Create a GitHub repo
2. Push this code to `main`
3. Go to repo Settings > Pages > Source: GitHub Actions
4. Update `site` in `astro.config.mjs` to your GitHub Pages URL

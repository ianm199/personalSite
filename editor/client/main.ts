import { createApi } from './api';
import { el } from './dom';
import { mountEditor } from './editor-view';

interface EditorConfig {
  base: string;
}

function readConfig(): EditorConfig {
  const configEl = document.getElementById('editor-config');
  if (configEl === null) {
    throw new Error('editor config block missing from shell');
  }
  return JSON.parse(configEl.textContent!);
}

/**
 * Builds the '+ new post' control: a button that swaps itself for an
 * inline title input with create/cancel buttons. Enter submits, Escape
 * cancels, and API errors (e.g. a 409 duplicate slug) render as inline
 * text next to the input rather than a window.alert().
 */
function buildNewPostControl(
  api: ReturnType<typeof createApi>,
): HTMLElement {
  const wrap = el('div', 'new-post-control');
  const newButton = el('button', 'new-post-button', '+ new post');
  const form = el('div', 'new-post-form');
  form.hidden = true;
  const input = el('input', 'new-post-input');
  input.type = 'text';
  input.placeholder = 'post title';
  const createButton = el('button', 'new-post-create', 'create');
  const cancelButton = el('button', 'new-post-cancel', 'cancel');
  const row = el('div', 'new-post-row');
  row.append(input, createButton, cancelButton);
  const error = el('span', 'new-post-error');
  form.append(row, error);
  wrap.append(newButton, form);

  function showForm(): void {
    newButton.hidden = true;
    form.hidden = false;
    error.textContent = '';
    input.value = '';
    input.focus();
  }

  function hideForm(): void {
    form.hidden = true;
    newButton.hidden = false;
    error.textContent = '';
  }

  async function submit(): Promise<void> {
    const title = input.value.trim();
    if (title === '') {
      return;
    }
    createButton.disabled = true;
    error.textContent = '';
    try {
      const { slug } = await api.createPost(title);
      window.location.search = `?slug=${encodeURIComponent(slug)}`;
    } catch (err) {
      error.textContent = (err as Error).message;
      createButton.disabled = false;
    }
  }

  newButton.addEventListener('click', showForm);
  createButton.addEventListener('click', () => void submit());
  cancelButton.addEventListener('click', hideForm);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void submit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      hideForm();
    }
  });

  return wrap;
}

async function mountPostList(app: HTMLElement, base: string): Promise<void> {
  document.title = 'blog editor';
  const api = createApi(base);
  const { posts } = await api.listPosts();

  const page = el('div', 'list-page');
  const header = el('header', 'list-header');
  header.append(el('h1', 'list-title', 'blog editor'));
  header.append(buildNewPostControl(api));
  page.append(header);

  const list = el('ul', 'post-list');
  for (const post of posts) {
    const item = el('li', 'post-row');
    const main = el('div', 'post-row-main');
    const link = el('a', 'post-link', post.fields.title);
    link.href = `?slug=${encodeURIComponent(post.slug)}`;
    main.append(link);
    if (post.fields.tags.length > 0) {
      main.append(el('span', 'post-row-tags', post.fields.tags.join(', ')));
    }
    item.append(main);
    const meta = el('span', 'post-row-meta', post.fields.pubDate);
    if (post.fields.draft) {
      meta.append(el('span', 'draft-badge', 'draft'));
    }
    item.append(meta);
    list.append(item);
  }
  page.append(list);
  app.append(page);
}

async function main(): Promise<void> {
  const { base } = readConfig();
  const app = document.getElementById('app')!;
  const slug = new URLSearchParams(window.location.search).get('slug');
  if (slug === null) {
    await mountPostList(app, base);
  } else {
    await mountEditor(app, base, slug);
  }
}

main().catch((err) => {
  document.getElementById('app')!.textContent = `failed to load editor: ${err.message}`;
});

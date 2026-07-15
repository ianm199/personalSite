import { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import { createApi, ApiError, type PostFields, type PostSummary } from './api';
import { el } from './dom';
import { createPublishController, localToday } from './publish';
import { buildEditorExtensions, wrapSelection } from './cm-setup';

const AUTOSAVE_DELAY_MS = 750;
const WORDS_PER_MINUTE = 238;
const DESCRIPTION_WARN_LENGTH = 160;
const LAYOUT_STORAGE_KEY = 'blog-editor-layout';
const MIN_DIVIDER_RATIO = 0.25;
const MAX_DIVIDER_RATIO = 0.75;

type PaneMode = 'split' | 'editor' | 'preview';

interface EditorLayout {
  paneMode: PaneMode;
  outlineCollapsed: boolean;
  dividerRatio: number;
}

function defaultLayout(): EditorLayout {
  return { paneMode: 'split', outlineCollapsed: false, dividerRatio: 0.5 };
}

function isPaneMode(value: unknown): value is PaneMode {
  return value === 'split' || value === 'editor' || value === 'preview';
}

function isEditorLayout(value: unknown): value is EditorLayout {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    isPaneMode(candidate.paneMode) &&
    typeof candidate.outlineCollapsed === 'boolean' &&
    typeof candidate.dividerRatio === 'number' &&
    candidate.dividerRatio >= MIN_DIVIDER_RATIO &&
    candidate.dividerRatio <= MAX_DIVIDER_RATIO
  );
}

/**
 * Reads the persisted pane layout (mode, outline collapsed, divider ratio)
 * from localStorage. A missing key falls back to defaultLayout(); a parse
 * failure or a value that fails validation clears the key and falls back
 * too, so a corrupt entry can't wedge future loads.
 */
function loadLayout(): EditorLayout {
  const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
  if (raw === null) {
    return defaultLayout();
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isEditorLayout(parsed)) {
      return parsed;
    }
    window.localStorage.removeItem(LAYOUT_STORAGE_KEY);
    return defaultLayout();
  } catch {
    window.localStorage.removeItem(LAYOUT_STORAGE_KEY);
    return defaultLayout();
  }
}

function saveLayout(layout: EditorLayout): void {
  window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
}

function clampDividerRatio(ratio: number): number {
  return Math.min(MAX_DIVIDER_RATIO, Math.max(MIN_DIVIDER_RATIO, ratio));
}

/**
 * Builds the workspace grid's column track list for the current layout.
 * Split mode gives the editor and preview tracks flexible widths driven by
 * dividerRatio, with a fixed-width track for the drag handle between them.
 * The max modes collapse the hidden pane's track (and the divider) to 0 so
 * no empty space is reserved for content that's also set to display:none.
 */
function renderGridColumns(layout: EditorLayout): string {
  const outlineWidth = layout.outlineCollapsed ? '28px' : '180px';
  if (layout.paneMode === 'editor') {
    return `${outlineWidth} minmax(0, 1fr) 0px 0px`;
  }
  if (layout.paneMode === 'preview') {
    return `${outlineWidth} 0px 0px minmax(0, 1fr)`;
  }
  const editorFr = layout.dividerRatio;
  const previewFr = 1 - layout.dividerRatio;
  return `${outlineWidth} minmax(0, ${editorFr}fr) 6px minmax(0, ${previewFr}fr)`;
}

interface OutlineEntry {
  line: number;
  level: number;
  text: string;
}

function computeOutline(doc: EditorView['state']['doc']): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  let inFence = false;
  for (let i = 1; i <= doc.lines; i++) {
    const text = doc.line(i).text;
    if (/^(```|~~~)/.test(text)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    const match = /^(#{1,6})\s+(.*)$/.exec(text);
    if (match !== null) {
      entries.push({ line: i, level: match[1].length, text: match[2] });
    }
  }
  return entries;
}

/**
 * Formats a document's word count and estimated reading time
 * (at WORDS_PER_MINUTE) as shown in the topbar, e.g. "1,234 words · 6 min".
 */
function formatWordCount(text: string): string {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const minutes = Math.max(1, Math.round(words.length / WORDS_PER_MINUTE));
  return `${words.length.toLocaleString()} words · ${minutes} min`;
}

function insertLink(view: EditorView): void {
  view.dispatch(
    view.state.changeByRange((range) => {
      const text = view.state.sliceDoc(range.from, range.to);
      const insert = `[${text}](url)`;
      const urlStart = range.from + text.length + 3;
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.range(urlStart, urlStart + 3),
      };
    }),
  );
  view.focus();
}

function toggleLinePrefix(view: EditorView, prefix: string): void {
  const { state } = view;
  const lineNumbers = new Set<number>();
  for (const range of state.selection.ranges) {
    let pos = range.from;
    while (pos <= range.to) {
      const line = state.doc.lineAt(pos);
      lineNumbers.add(line.number);
      if (line.to + 1 > range.to) {
        break;
      }
      pos = line.to + 1;
    }
  }
  const lines = [...lineNumbers].map((n) => state.doc.line(n));
  const allPrefixed = lines.every((l) => l.text.startsWith(prefix));
  const changes = lines.map((l) =>
    allPrefixed
      ? { from: l.from, to: l.from + prefix.length, insert: '' }
      : { from: l.from, insert: prefix },
  );
  view.dispatch({ changes });
  view.focus();
}

function textInput(
  className: string,
  value: string,
  onInput: () => void,
): HTMLInputElement {
  const input = el('input', className);
  input.type = 'text';
  input.value = value;
  input.addEventListener('input', onInput);
  return input;
}

function dateInput(
  className: string,
  value: string,
  onInput: () => void,
): HTMLInputElement {
  const input = el('input', className);
  input.type = 'date';
  input.value = value;
  input.addEventListener('input', onInput);
  return input;
}

function labeled(label: string, control: HTMLElement): HTMLElement {
  const wrap = el('label', 'field');
  wrap.append(el('span', 'field-label', label), control);
  return wrap;
}

/**
 * Builds the topbar's quick post switcher: a <select> listing every post
 * (sorted by pubDate desc, drafts suffixed " (draft)") with the current
 * post selected. Choosing another post navigates to it via ?slug=; the
 * beforeunload guard registered later covers unsaved changes.
 */
function buildPostSwitcher(posts: PostSummary[], currentSlug: string): HTMLSelectElement {
  const select = el('select', 'post-switcher');
  const sorted = [...posts].sort((a, b) => b.fields.pubDate.localeCompare(a.fields.pubDate));
  for (const post of sorted) {
    const option = el('option', '');
    option.value = post.slug;
    option.textContent = post.fields.draft
      ? `${post.fields.title} (draft)`
      : post.fields.title;
    option.selected = post.slug === currentSlug;
    select.append(option);
  }
  select.addEventListener('change', () => {
    window.location.search = `?slug=${encodeURIComponent(select.value)}`;
  });
  return select;
}

/**
 * Builds a <datalist> of tag suggestions drawn from the union of tags
 * across every post, wired to the tags input. Since the input holds a
 * comma-separated list, suggestions are computed for the segment after
 * the last comma and each option's value is the previously-typed prefix
 * plus the suggested tag — a datalist match replaces the whole input
 * value, not just the active segment.
 */
function buildTagsDatalist(posts: PostSummary[], input: HTMLInputElement): HTMLDataListElement {
  const allTags = [...new Set(posts.flatMap((post) => post.fields.tags))].sort();
  const datalist = el('datalist', '');
  datalist.id = 'tags-datalist';
  input.setAttribute('list', datalist.id);

  function updateSuggestions(): void {
    datalist.textContent = '';
    const value = input.value;
    const lastComma = value.lastIndexOf(',');
    const prefix = lastComma === -1 ? '' : `${value.slice(0, lastComma + 1)} `;
    const typed = value.slice(lastComma + 1).trim().toLowerCase();
    if (typed === '') {
      return;
    }
    for (const tag of allTags) {
      if (tag.toLowerCase().startsWith(typed) && tag.toLowerCase() !== typed) {
        const option = el('option', '');
        option.value = `${prefix}${tag}`;
        datalist.append(option);
      }
    }
  }

  input.addEventListener('input', updateSuggestions);
  return datalist;
}

export async function mountEditor(
  app: HTMLElement,
  base: string,
  slug: string,
): Promise<void> {
  document.title = `${slug} — blog editor`;
  const api = createApi(base);
  const [doc, { posts }] = await Promise.all([api.readPost(slug), api.listPosts()]);

  let currentHash = doc.hash;
  let dirty = false;
  let saving = false;
  let queued = false;
  let conflicted = false;
  let timer: number | undefined;
  const layout = loadLayout();

  const page = el('div', 'editor-page');

  const topbar = el('header', 'topbar');
  const backLink = el('a', 'back-link', '← posts');
  backLink.href = `${base}__edit`;
  const slugLabel = el('span', 'slug-label', `${slug}.md`);
  const postSwitcher = buildPostSwitcher(posts, slug);
  const viewLink = el('a', 'view-link', 'open ↗');
  viewLink.href = `${base}blog/${slug}`;
  viewLink.target = '_blank';
  const wordCountLabel = el('span', 'word-count', formatWordCount(doc.body));
  const status = el('span', 'status', 'loaded');
  topbar.append(backLink, slugLabel, postSwitcher, viewLink, wordCountLabel, status);
  page.append(topbar);

  function setStatus(text: string, kind: 'ok' | 'busy' | 'error'): void {
    status.textContent = text;
    status.className = `status status-${kind}`;
  }

  const banner = el('div', 'conflict-banner');
  banner.hidden = true;
  page.append(banner);

  function markDirty(): void {
    dirty = true;
    setStatus('editing…', 'busy');
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
  }

  const titleInput = textInput('input-title', doc.fields.title, markDirty);
  const descriptionInput = el('textarea', 'input-description');
  descriptionInput.rows = 2;
  descriptionInput.value = doc.fields.description;
  const descriptionCounter = el('span', 'description-counter');
  function updateDescriptionCounter(): void {
    const length = descriptionInput.value.length;
    descriptionCounter.textContent = `${length} chars`;
    descriptionCounter.classList.toggle(
      'description-counter-warning',
      length > DESCRIPTION_WARN_LENGTH,
    );
  }
  descriptionInput.addEventListener('input', markDirty);
  descriptionInput.addEventListener('input', updateDescriptionCounter);
  updateDescriptionCounter();
  const pubDateInput = dateInput('input-date', doc.fields.pubDate, markDirty);
  const updatedDateInput = dateInput(
    'input-date',
    doc.fields.updatedDate === undefined ? '' : doc.fields.updatedDate,
    markDirty,
  );
  const tagsInput = textInput('input-tags', doc.fields.tags.join(', '), markDirty);
  const tagsDatalist = buildTagsDatalist(posts, tagsInput);
  const draftInput = el('input', 'input-draft');
  draftInput.type = 'checkbox';
  draftInput.checked = doc.fields.draft;
  draftInput.addEventListener('change', markDirty);

  const descriptionField = el('div', 'field field-description');
  descriptionField.append(el('span', 'field-label', 'description'));
  const descriptionControl = el('div', 'description-control');
  descriptionControl.append(descriptionInput, descriptionCounter);
  descriptionField.append(descriptionControl);

  const tagsField = labeled('tags', tagsInput);
  tagsField.append(tagsDatalist);

  const form = el('div', 'frontmatter-form');
  form.append(labeled('title', titleInput), descriptionField);
  const metaRow = el('div', 'meta-row');
  metaRow.append(
    labeled('published', pubDateInput),
    labeled('updated', updatedDateInput),
    tagsField,
    labeled('draft', draftInput),
  );
  form.append(metaRow);
  page.append(form);

  function collectFields(): PostFields | null {
    if (titleInput.value === '') {
      setStatus('title required', 'error');
      return null;
    }
    if (pubDateInput.value === '') {
      setStatus('publish date required', 'error');
      return null;
    }
    const fields: PostFields = {
      title: titleInput.value,
      description: descriptionInput.value,
      pubDate: pubDateInput.value,
      tags: tagsInput.value
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t !== ''),
      draft: draftInput.checked,
    };
    if (updatedDateInput.value !== '') {
      fields.updatedDate = updatedDateInput.value;
    }
    return fields;
  }

  function updateWordCount(): void {
    wordCountLabel.textContent = formatWordCount(view.state.doc.toString());
  }

  const view = new EditorView({
    doc: doc.body,
    extensions: buildEditorExtensions({
      onDocChanged: () => {
        markDirty();
        renderOutline();
        updateWordCount();
      },
      onSave: () => {
        window.clearTimeout(timer);
        void save();
      },
    }),
  });

  async function save(): Promise<void> {
    if (conflicted) {
      return;
    }
    if (saving) {
      queued = true;
      return;
    }
    const fields = collectFields();
    if (fields === null) {
      return;
    }
    saving = true;
    dirty = false;
    setStatus('saving…', 'busy');
    try {
      const res = await api.writePost({
        slug,
        fields,
        body: view.state.doc.toString(),
        expectedHash: currentHash,
      });
      currentHash = res.hash;
      if (!dirty) {
        const time = new Date().toLocaleTimeString();
        setStatus(`saved ${time}`, 'ok');
      }
    } catch (err) {
      dirty = true;
      if (err instanceof ApiError && err.status === 409) {
        conflicted = true;
        showConflict(String(err.payload.hash));
      } else {
        setStatus(`save failed: ${(err as Error).message}`, 'error');
      }
    } finally {
      saving = false;
      if (queued) {
        queued = false;
        void save();
      }
    }
  }

  function showConflict(diskHash: string): void {
    banner.textContent = '';
    banner.hidden = false;
    banner.append(
      el(
        'span',
        'conflict-text',
        'This file changed on disk (edited elsewhere?).',
      ),
    );
    const reload = el('button', 'conflict-button', 'reload from disk');
    reload.addEventListener('click', async () => {
      const fresh = await api.readPost(slug);
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: fresh.body },
      });
      titleInput.value = fresh.fields.title;
      descriptionInput.value = fresh.fields.description;
      updateDescriptionCounter();
      pubDateInput.value = fresh.fields.pubDate;
      updatedDateInput.value =
        fresh.fields.updatedDate === undefined ? '' : fresh.fields.updatedDate;
      tagsInput.value = fresh.fields.tags.join(', ');
      draftInput.checked = fresh.fields.draft;
      currentHash = fresh.hash;
      conflicted = false;
      dirty = false;
      banner.hidden = true;
      setStatus('reloaded from disk', 'ok');
    });
    const overwrite = el('button', 'conflict-button', 'overwrite disk');
    overwrite.addEventListener('click', () => {
      currentHash = diskHash;
      conflicted = false;
      banner.hidden = true;
      void save();
    });
    banner.append(reload, overwrite);
    setStatus('conflict', 'error');
  }

  async function flushSave(): Promise<void> {
    window.clearTimeout(timer);
    if (dirty || saving) {
      await save();
    }
    for (let i = 0; i < 30 && (saving || dirty); i++) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
  }

  const publishController = createPublishController({
    api,
    slug,
    getTitle: () => titleInput.value,
    isDraft: () => draftInput.checked,
    applyDraftPublish: (markPublished, setDateToday) => {
      if (markPublished) {
        draftInput.checked = false;
      }
      if (setDateToday) {
        pubDateInput.value = localToday();
      }
      markDirty();
    },
    flushSave,
  });

  const publishButton = el('button', 'publish-button', 'publish');
  publishButton.addEventListener('click', () => {
    if (conflicted) {
      setStatus('resolve the disk conflict before publishing', 'error');
      return;
    }
    publishController.open();
  });
  topbar.insertBefore(publishButton, status);

  const paneModeButtons: Array<[PaneMode, HTMLButtonElement]> = [];
  const paneModes = el('div', 'pane-modes');
  const paneModeConfig: Array<[PaneMode, string, string]> = [
    ['editor', 'editor', 'editor only (⌘1)'],
    ['split', 'split', 'split view (⌘2)'],
    ['preview', 'preview', 'preview only (⌘3)'],
  ];
  for (const [mode, label, title] of paneModeConfig) {
    const button = el('button', 'pane-mode-button', label);
    button.title = title;
    button.addEventListener('click', () => setPaneMode(mode));
    paneModeButtons.push([mode, button]);
    paneModes.append(button);
  }
  topbar.insertBefore(paneModes, status);

  const toolbar = el('div', 'toolbar');
  const tools: Array<[string, string, () => void]> = [
    ['B', 'bold', () => wrapSelection(view, '**', '**')],
    ['I', 'italic', () => wrapSelection(view, '*', '*')],
    ['link', 'insert link', () => insertLink(view)],
    ['H2', 'toggle heading', () => toggleLinePrefix(view, '## ')],
    ['H3', 'toggle subheading', () => toggleLinePrefix(view, '### ')],
    ['• list', 'toggle list item', () => toggleLinePrefix(view, '- ')],
    ['❝ quote', 'toggle blockquote', () => toggleLinePrefix(view, '> ')],
  ];
  for (const [label, title, action] of tools) {
    const button = el('button', 'tool-button', label);
    button.title = title;
    button.addEventListener('click', action);
    toolbar.append(button);
  }

  const outline = el('nav', 'outline');
  const outlineHeader = el('div', 'outline-header');
  const outlineLabel = el('span', 'outline-label', 'outline');
  const outlineToggle = el('button', 'outline-toggle', '‹');
  outlineToggle.title = 'collapse outline';
  outlineToggle.addEventListener('click', () => toggleOutlineCollapsed());
  outlineHeader.append(outlineLabel, outlineToggle);
  const outlineList = el('div', 'outline-list');
  outline.append(outlineHeader, outlineList);

  function renderOutline(): void {
    outlineList.textContent = '';
    for (const entry of computeOutline(view.state.doc)) {
      const item = el('button', `outline-item outline-level-${entry.level}`, entry.text);
      item.addEventListener('click', () => {
        const line = view.state.doc.line(entry.line);
        view.dispatch({
          selection: { anchor: line.from },
          effects: EditorView.scrollIntoView(line.from, {
            y: 'start',
            yMargin: 40,
          }),
        });
        view.focus();
      });
      outlineList.append(item);
    }
  }

  const editorPane = el('div', 'editor-pane');
  editorPane.append(toolbar, view.dom);

  const iframe = el('iframe', 'preview-frame');
  iframe.src = `${base}blog/${slug}`;
  let previewScroll = 0;
  iframe.addEventListener('load', () => {
    const win = iframe.contentWindow;
    if (win === null) {
      return;
    }
    win.scrollTo(0, previewScroll);
    win.addEventListener('scroll', () => {
      previewScroll = win.scrollY;
    });
  });

  const divider = el('div', 'pane-divider');
  divider.title = 'drag to resize';

  const workspace = el('div', 'workspace');
  workspace.append(outline, editorPane, divider, iframe);
  page.append(workspace);

  function applyLayout(): void {
    workspace.style.gridTemplateColumns = renderGridColumns(layout);
    workspace.classList.toggle('mode-editor', layout.paneMode === 'editor');
    workspace.classList.toggle('mode-preview', layout.paneMode === 'preview');
    outline.classList.toggle('collapsed', layout.outlineCollapsed);
    outlineToggle.textContent = layout.outlineCollapsed ? '›' : '‹';
    outlineToggle.title = layout.outlineCollapsed ? 'expand outline' : 'collapse outline';
    for (const [mode, button] of paneModeButtons) {
      button.classList.toggle('active', mode === layout.paneMode);
    }
  }

  function setPaneMode(mode: PaneMode): void {
    layout.paneMode = mode;
    applyLayout();
    saveLayout(layout);
    if (mode !== 'preview') {
      view.requestMeasure();
    }
  }

  function toggleOutlineCollapsed(): void {
    layout.outlineCollapsed = !layout.outlineCollapsed;
    applyLayout();
    saveLayout(layout);
  }

  let dragging = false;
  let dragStartX = 0;
  let dragStartRatio = layout.dividerRatio;
  let dragRegionWidth = 0;

  divider.addEventListener('pointerdown', (event) => {
    if (layout.paneMode !== 'split') {
      return;
    }
    dragging = true;
    dragStartX = event.clientX;
    dragStartRatio = layout.dividerRatio;
    dragRegionWidth =
      editorPane.getBoundingClientRect().width + iframe.getBoundingClientRect().width;
    divider.setPointerCapture(event.pointerId);
    divider.classList.add('dragging');
    iframe.style.pointerEvents = 'none';
  });

  divider.addEventListener('pointermove', (event) => {
    if (!dragging || dragRegionWidth === 0) {
      return;
    }
    const deltaRatio = (event.clientX - dragStartX) / dragRegionWidth;
    layout.dividerRatio = clampDividerRatio(dragStartRatio + deltaRatio);
    workspace.style.gridTemplateColumns = renderGridColumns(layout);
  });

  function endDrag(event: PointerEvent): void {
    if (!dragging) {
      return;
    }
    dragging = false;
    divider.classList.remove('dragging');
    iframe.style.pointerEvents = '';
    saveLayout(layout);
    if (divider.hasPointerCapture(event.pointerId)) {
      divider.releasePointerCapture(event.pointerId);
    }
  }
  divider.addEventListener('pointerup', endDrag);
  divider.addEventListener('pointercancel', endDrag);

  window.addEventListener('keydown', (event) => {
    if (!event.metaKey) {
      return;
    }
    if (event.key === '1') {
      event.preventDefault();
      setPaneMode('editor');
    } else if (event.key === '2') {
      event.preventDefault();
      setPaneMode('split');
    } else if (event.key === '3') {
      event.preventDefault();
      setPaneMode('preview');
    }
  });

  applyLayout();

  app.append(page);
  renderOutline();

  window.addEventListener('beforeunload', (event) => {
    if (dirty || saving) {
      event.preventDefault();
    }
  });
}

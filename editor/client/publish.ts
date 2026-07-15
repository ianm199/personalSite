import { type Api, ApiError, type PublishPreflight } from './api';
import { el } from './dom';

const POLL_INTERVAL_MS = 15000;
const POLL_LIMIT = 20;

interface PublishHooks {
  api: Api;
  slug: string;
  getTitle: () => string;
  isDraft: () => boolean;
  applyDraftPublish: (markPublished: boolean, setDateToday: boolean) => void;
  flushSave: () => Promise<void>;
}

function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function renderDiff(diff: string): HTMLElement {
  const pre = el('pre', 'publish-diff');
  for (const line of diff.split('\n')) {
    let cls = 'diff-ctx';
    if (line.startsWith('+') && !line.startsWith('+++')) {
      cls = 'diff-add';
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      cls = 'diff-del';
    } else if (line.startsWith('@@')) {
      cls = 'diff-hunk';
    }
    pre.append(el('span', `diff-line ${cls}`, line + '\n'));
  }
  return pre;
}

function checkboxRow(label: string, checked: boolean): [HTMLElement, HTMLInputElement] {
  const box = el('input', 'publish-checkbox');
  box.type = 'checkbox';
  box.checked = checked;
  const row = el('label', 'publish-option');
  row.append(box, el('span', 'publish-option-label', label));
  return [row, box];
}

export function createPublishController(hooks: PublishHooks): { open: () => void } {
  let overlay: HTMLElement | null = null;
  let pollTimer: number | undefined;

  function close(): void {
    window.clearInterval(pollTimer);
    if (overlay !== null) {
      overlay.remove();
      overlay = null;
    }
  }

  function panelShell(title: string): HTMLElement {
    close();
    overlay = el('div', 'publish-overlay');
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        close();
      }
    });
    const panel = el('div', 'publish-panel');
    panel.append(el('h2', 'publish-title', title));
    overlay.append(panel);
    document.body.append(overlay);
    window.addEventListener('keydown', function onKey(event) {
      if (event.key === 'Escape') {
        window.removeEventListener('keydown', onKey);
        close();
      }
    });
    return panel;
  }

  function buttonRow(...buttons: HTMLElement[]): HTMLElement {
    const row = el('div', 'publish-buttons');
    row.append(...buttons);
    return row;
  }

  function cancelButton(): HTMLElement {
    const btn = el('button', 'publish-cancel', 'cancel');
    btn.addEventListener('click', close);
    return btn;
  }

  async function showPreflight(): Promise<void> {
    const panel = panelShell('publish');
    const loading = el('p', 'publish-note', 'checking git state…');
    panel.append(loading);
    let pf: PublishPreflight;
    try {
      pf = await hooks.api.publishPreflight(hooks.slug);
    } catch (err) {
      loading.remove();
      panel.append(
        el('p', 'publish-error', (err as Error).message),
        buttonRow(cancelButton()),
      );
      return;
    }
    loading.remove();

    if (!pf.publishable) {
      const list = el('ul', 'publish-blockers');
      for (const blocker of pf.blockers) {
        list.append(el('li', 'publish-blocker', blocker));
      }
      panel.append(list, buttonRow(cancelButton()));
      return;
    }

    const stateNote =
      pf.fileState === 'new'
        ? 'new file — first commit of this post'
        : 'changes since last commit';
    panel.append(el('p', 'publish-note', stateNote));
    panel.append(renderDiff(pf.diff));

    if (pf.ahead > 0) {
      const note = el('div', 'publish-ahead');
      note.append(
        el(
          'p',
          'publish-note',
          `push will also include ${pf.ahead} earlier unpushed commit(s):`,
        ),
      );
      const list = el('ul', 'publish-blockers');
      for (const commit of pf.aheadCommits) {
        list.append(el('li', 'publish-blocker', `${commit.sha} ${commit.subject}`));
      }
      note.append(list);
      panel.append(note);
    }

    const prefix = pf.fileState === 'new' ? 'Publish' : 'Update';
    const messageInput = el('input', 'publish-message');
    messageInput.type = 'text';
    messageInput.value = `${prefix} ${hooks.getTitle()}`;
    const messageField = el('label', 'field');
    messageField.append(el('span', 'field-label', 'commit message'), messageInput);
    panel.append(messageField);

    const confirm = el('button', 'publish-confirm', 'commit & push to main');
    confirm.addEventListener('click', async () => {
      confirm.textContent = 'publishing…';
      (confirm as HTMLButtonElement).disabled = true;
      try {
        const { sha } = await hooks.api.publishPost({
          slug: hooks.slug,
          message: messageInput.value,
        });
        showSuccess(pf, sha);
      } catch (err) {
        showFailure(err);
      }
    });
    panel.append(buttonRow(confirm, cancelButton()));
  }

  function showSuccess(pf: PublishPreflight, sha: string): void {
    const panel = panelShell('published ✓');
    panel.append(el('p', 'publish-note', `pushed ${sha.slice(0, 7)} to main`));
    const deployLine = el('p', 'publish-note', 'deploy: waiting for workflow…');
    panel.append(deployLine);
    const link = el('a', 'publish-link', 'view deploy on GitHub ↗');
    link.href = pf.actionsUrl;
    link.target = '_blank';
    panel.append(link);
    const done = el('button', 'publish-confirm', 'close');
    done.addEventListener('click', close);
    panel.append(buttonRow(done));

    let polls = 0;
    const url = `https://api.github.com/repos/${pf.repo.owner}/${pf.repo.name}/actions/runs?head_sha=${sha}&per_page=1`;
    async function poll(): Promise<void> {
      polls += 1;
      if (polls > POLL_LIMIT) {
        window.clearInterval(pollTimer);
        deployLine.textContent = 'deploy: still running — check GitHub';
        return;
      }
      try {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`github api ${res.status}`);
        }
        const data = await res.json();
        if (data.workflow_runs.length === 0) {
          deployLine.textContent = 'deploy: waiting for workflow…';
          return;
        }
        const run = data.workflow_runs[0];
        if (run.status === 'completed') {
          window.clearInterval(pollTimer);
          deployLine.textContent = `deploy: ${run.conclusion}${run.conclusion === 'success' ? ' ✓ — live site updated' : ''}`;
        } else {
          deployLine.textContent = `deploy: ${run.status}…`;
        }
      } catch {
        window.clearInterval(pollTimer);
        deployLine.textContent = 'deploy status unavailable — use the link';
      }
    }
    pollTimer = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    void poll();
  }

  function showFailure(err: unknown): void {
    const panel = panelShell('publish failed');
    let message = (err as Error).message;
    if (err instanceof ApiError && typeof err.payload.sha === 'string') {
      message = `${message} — the commit exists locally; fix connectivity and publish again to push it.`;
    }
    panel.append(el('p', 'publish-error', message));
    const done = el('button', 'publish-confirm', 'close');
    done.addEventListener('click', close);
    panel.append(buttonRow(done));
  }

  function showDraftOptions(): void {
    const panel = panelShell('publish draft');
    const [publishRow, publishBox] = checkboxRow('mark as published (draft: false)', true);
    const [dateRow, dateBox] = checkboxRow('set publish date to today', true);
    panel.append(
      el('p', 'publish-note', 'this post is currently a draft'),
      publishRow,
      dateRow,
    );
    const cont = el('button', 'publish-confirm', 'continue');
    cont.addEventListener('click', async () => {
      hooks.applyDraftPublish(publishBox.checked, dateBox.checked);
      await hooks.flushSave();
      await showPreflight();
    });
    panel.append(buttonRow(cont, cancelButton()));
  }

  async function open(): Promise<void> {
    await hooks.flushSave();
    if (hooks.isDraft()) {
      showDraftOptions();
      return;
    }
    await showPreflight();
  }

  return { open: () => void open() };
}

export { localToday };

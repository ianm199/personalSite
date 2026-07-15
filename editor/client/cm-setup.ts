import { minimalSetup } from 'codemirror';
import { EditorView, keymap, highlightActiveLine } from '@codemirror/view';
import { EditorSelection, EditorState, Prec, type Extension } from '@codemirror/state';
import { markdown, markdownKeymap } from '@codemirror/lang-markdown';
import { syntaxTree, foldGutter, foldKeymap, foldService } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { indentWithTab } from '@codemirror/commands';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';

export interface EditorExtensionsOptions {
  onDocChanged: () => void;
  onSave: () => void;
}

/**
 * Site-specific editor chrome: dark zinc background matching editor.css,
 * monospace content styling, no focus ring, and a subtle active-line band
 * that reads against both oneDark and the zinc palette underneath it.
 */
const siteTheme = EditorView.theme(
  {
    '&': { backgroundColor: '#18181b', height: '100%', fontSize: '14px' },
    '.cm-content': {
      fontFamily:
        "'SF Mono', ui-monospace, SFMono-Regular, 'JetBrains Mono', Consolas, monospace",
      padding: '16px 8px',
      lineHeight: '1.7',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { overflow: 'auto' },
    '.cm-activeLine': { backgroundColor: 'rgba(63, 63, 70, 0.4)' },
  },
  { dark: true },
);

/**
 * Wraps every selection range in `before`/`after` and leaves the cursor(s)
 * inside the inserted markers. Shared by the bold/italic keybindings and
 * the toolbar buttons.
 */
export function wrapSelection(view: EditorView, before: string, after: string): void {
  view.dispatch(
    view.state.changeByRange((range) => ({
      changes: [
        { from: range.from, insert: before },
        { from: range.to, insert: after },
      ],
      range: EditorSelection.range(
        range.from + before.length,
        range.to + before.length,
      ),
    })),
  );
  view.focus();
}

const closeBracketsData = EditorState.languageData.of(() => [
  { closeBrackets: { brackets: ['(', '['] } },
]);

const VOID_HTML_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const OPEN_TAG_LINE = /^\s*<([a-zA-Z][a-zA-Z0-9-]*)(\s[^<>]*)?>\s*$/;

/**
 * lang-markdown only folds a single HTMLBlock syntax node, and CommonMark
 * terminates raw HTML blocks at the first blank line. A hand-authored
 * <details> block that contains blank lines and nested markdown (headings,
 * fenced code) therefore never becomes one foldable node under the default
 * foldNodeProp. This walks the raw text from a lone opening tag forward,
 * tracking tag nesting depth, so those blocks fold as a whole; single-line
 * <figure><svg> style blocks already fold via the default and simply won't
 * match here (their whole span is already one HTMLBlock).
 */
function htmlBlockFoldService(
  state: EditorState,
  lineStart: number,
  _lineEnd: number,
): { from: number; to: number } | null {
  const line = state.doc.lineAt(lineStart);
  const match = OPEN_TAG_LINE.exec(line.text);
  if (match === null) {
    return null;
  }
  const tag = match[1];
  const attrs = match[2] ?? '';
  if (VOID_HTML_TAGS.has(tag.toLowerCase()) || /\/\s*$/.test(attrs)) {
    return null;
  }

  const tagPos = line.from + match[0].indexOf('<') + 1;
  let node = syntaxTree(state).resolveInner(tagPos, 1);
  let hasHtmlAncestor = false;
  for (let hop = 0; hop < 12; hop += 1) {
    if (node.name === 'HTMLBlock') {
      hasHtmlAncestor = true;
      break;
    }
    const parent = node.parent;
    if (parent === null) {
      break;
    }
    node = parent;
  }
  if (!hasHtmlAncestor) {
    return null;
  }

  let depth = 1;
  for (let num = line.number + 1; num <= state.doc.lines; num += 1) {
    const text = state.doc.line(num).text;
    const tagRe = new RegExp(`<(/?)${tag}(?:\\s[^<>]*)?>`, 'g');
    let found: RegExpExecArray | null;
    while ((found = tagRe.exec(text)) !== null) {
      const isSelfClosing = /\/\s*>$/.test(found[0]);
      if (found[1] === '/') {
        depth -= 1;
      } else if (!isSelfClosing) {
        depth += 1;
      }
      if (depth === 0) {
        return { from: line.to, to: state.doc.line(num).to };
      }
    }
  }
  return null;
}

/**
 * Assembles every CodeMirror extension the post editor needs: the markdown
 * language, theming, autosave/outline wiring via `onDocChanged`, the Mod-s
 * save binding via `onSave`, and the editing-power features (search,
 * folding, bracket closing, list/blockquote continuation, formatting
 * shortcuts, Tab indent). Kept separate from editor-view.ts so the mount
 * function there stays focused on DOM/state wiring rather than extension
 * bookkeeping.
 */
export function buildEditorExtensions(options: EditorExtensionsOptions): Extension[] {
  const { onDocChanged, onSave } = options;
  return [
    minimalSetup,
    markdown({ addKeymap: false }),
    oneDark,
    siteTheme,
    EditorView.lineWrapping,
    highlightActiveLine(),
    search(),
    highlightSelectionMatches(),
    closeBrackets(),
    closeBracketsData,
    foldGutter(),
    foldService.of(htmlBlockFoldService),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onDocChanged();
      }
    }),
    Prec.high(
      keymap.of([
        {
          key: 'Mod-s',
          run: () => {
            onSave();
            return true;
          },
        },
        {
          key: 'Mod-b',
          run: (view) => {
            wrapSelection(view, '**', '**');
            return true;
          },
        },
        {
          key: 'Mod-i',
          run: (view) => {
            wrapSelection(view, '*', '*');
            return true;
          },
        },
        indentWithTab,
        ...markdownKeymap,
        ...closeBracketsKeymap,
        ...searchKeymap,
        ...foldKeymap,
      ]),
    ),
  ];
}

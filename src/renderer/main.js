import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentMore, indentLess } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import MarkdownIt from 'markdown-it';
import emoji from 'markdown-it-emoji';
import footnote from 'markdown-it-footnote';
import sub from 'markdown-it-sub';
import sup from 'markdown-it-sup';
import taskLists from 'markdown-it-task-lists';

const editorHost = document.getElementById('editor');
const previewPane = document.getElementById('preview');
const previewContent = document.getElementById('preview-content');
const modal = document.getElementById('modal');
const modalClose = document.getElementById('modal-close');
const titlebarHitArea = document.getElementById('titlebar-hit-area');
const findbar = document.getElementById('findbar');
const findInput = document.getElementById('find-input');
const findStatus = document.getElementById('find-status');
const findPrev = document.getElementById('find-prev');
const findNext = document.getElementById('find-next');
const findClose = document.getElementById('find-close');

let currentFilePath = null;
let isPreview = false;
let isDirty = false;
let currentFindQuery = '';

const updateTitle = () => {
  const name = currentFilePath ? currentFilePath.split('/').pop() : 'Untitled';
  const title = isDirty ? `${name} •` : name;
  document.title = title;
  syncDocumentState();
};

const setDirty = (dirty) => {
  isDirty = dirty;
  updateTitle();
};

const syncDocumentState = () => {
  window.mona.updateDocumentState({
    filePath: currentFilePath,
    content: view.state.doc.toString(),
    isDirty,
    isPreview
  });
};

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
})
  .use(taskLists, { enabled: true })
  .use(emoji)
  .use(footnote)
  .use(sub)
  .use(sup);

const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading, color: '#214fa8', fontWeight: '600' },
  { tag: tags.link, color: '#0969da' },
  { tag: tags.url, color: '#0969da' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: '#6e7781' },
  { tag: tags.monospace, class: 'cm-md-code' },
  { tag: tags.quote, color: '#57606a' }
]);

const markdownKeymap = [
  { key: 'Mod-b', run: wrapSelection('**', '**') },
  { key: 'Mod-i', run: wrapSelection('_', '_') },
  { key: 'Mod-Shift-x', run: wrapSelection('~~', '~~') },
  { key: 'Mod-e', run: wrapSelection('`', '`') },
  { key: 'Mod-k', run: insertLink },
  { key: 'Mod-Shift-.', run: prefixLine('> ') },
  { key: 'Mod-Shift-8', run: prefixLine('- ') },
  { key: 'Mod-Shift-7', run: prefixLine('1. ') },
  { key: 'Mod-Shift-9', run: prefixLine('- [ ] ') },
  { key: 'Mod-Shift-h', run: toggleHeading(2) },
  { key: 'Mod-Shift-k', run: insertCodeBlock },
  { key: 'Tab', run: indentMore },
  { key: 'Shift-Tab', run: indentLess },
  { key: 'Mod-Shift-p', run: togglePreview }
];

const view = new EditorView({
  parent: editorHost,
  state: EditorState.create({
    doc: '',
    extensions: [
      history(),
      indentUnit.of('    '),
      markdown(),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        spellcheck: 'true',
        autocorrect: 'on',
        autocapitalize: 'sentences'
      }),
      syntaxHighlighting(markdownHighlight),
      keymap.of([
        ...markdownKeymap,
        ...defaultKeymap,
        ...historyKeymap
      ]),
      EditorView.domEventHandlers({
        paste: (event, viewInstance) => handleSmartPaste(event, viewInstance)
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          setDirty(true);
          if (isPreview) {
            refreshPreview();
          }
        }
      })
    ]
  })
});

const togglePreviewState = (nextState) => {
  const nextPreviewState = Boolean(nextState);
  if (nextPreviewState === isPreview) return;
  const currentRatio = isPreview ? getScrollRatio(previewPane) : getScrollRatio(getEditorScroller());
  isPreview = nextPreviewState;
  previewPane.classList.toggle('hidden', !isPreview);
  editorHost.classList.toggle('hidden', isPreview);
  syncDocumentState();
  if (isPreview) {
    refreshPreview();
    requestAnimationFrame(() => setScrollRatio(previewPane, currentRatio));
  } else {
    requestAnimationFrame(() => setScrollRatio(getEditorScroller(), currentRatio));
  }
};

function togglePreview() {
  togglePreviewState(!isPreview);
  return true;
}

function refreshPreview() {
  previewContent.innerHTML = md.render(view.state.doc.toString());
  addHeadingIds(previewContent);
}

function wrapSelection(prefix, suffix) {
  return (viewInstance) => {
    const { state } = viewInstance;
    const range = state.selection.main;
    const selected = state.sliceDoc(range.from, range.to);
    const transaction = state.update({
      changes: { from: range.from, to: range.to, insert: `${prefix}${selected}${suffix}` },
      selection: { anchor: range.from + prefix.length, head: range.from + prefix.length + selected.length }
    });
    viewInstance.dispatch(transaction);
    return true;
  };
}

function prefixLine(prefix) {
  return (viewInstance) => {
    const { state } = viewInstance;
    const range = state.selection.main;
    const line = state.doc.lineAt(range.from);
    const transaction = state.update({
      changes: { from: line.from, insert: prefix }
    });
    viewInstance.dispatch(transaction);
    return true;
  };
}

function insertLink(viewInstance) {
  const { state } = viewInstance;
  const range = state.selection.main;
  const selected = state.sliceDoc(range.from, range.to) || 'link text';
  const insert = `[${selected}](https://)`;
  const transaction = state.update({
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: range.from + 1, head: range.from + 1 + selected.length }
  });
  viewInstance.dispatch(transaction);
  return true;
}

function insertCodeBlock(viewInstance) {
  const { state } = viewInstance;
  const range = state.selection.main;
  const selected = state.sliceDoc(range.from, range.to);
  const block = selected ? `\`\`\`\n${selected}\n\`\`\`` : '```\n\n```';
  const cursorOffset = selected ? 4 : 4;
  const transaction = state.update({
    changes: { from: range.from, to: range.to, insert: block },
    selection: { anchor: range.from + cursorOffset, head: range.from + cursorOffset }
  });
  viewInstance.dispatch(transaction);
  return true;
}

function toggleHeading(level) {
  return (viewInstance) => {
    const { state } = viewInstance;
    const range = state.selection.main;
    const line = state.doc.lineAt(range.from);
    const match = line.text.match(/^(#{1,6})\\s+/);
    const prefix = '#'.repeat(level) + ' ';
    let newLine = line.text;

    if (match) {
      if (match[1].length === level) {
        newLine = line.text.replace(/^(#{1,6})\\s+/, '');
      } else {
        newLine = line.text.replace(/^(#{1,6})\\s+/, prefix);
      }
    } else {
      newLine = prefix + line.text;
    }

    const transaction = state.update({
      changes: { from: line.from, to: line.to, insert: newLine },
      selection: { anchor: line.from + prefix.length, head: line.from + newLine.length }
    });
    viewInstance.dispatch(transaction);
    return true;
  };
}

function handleSmartPaste(event, viewInstance) {
  if (!event.clipboardData) return false;
  const text = event.clipboardData.getData('text/plain');
  if (!text || !isUrl(text)) return false;
  const { state } = viewInstance;
  const range = state.selection.main;
  const selected = state.sliceDoc(range.from, range.to);
  if (!selected) return false;
  event.preventDefault();
  const insert = `[${selected}](${text.trim()})`;
  viewInstance.dispatch(
    state.update({
      changes: { from: range.from, to: range.to, insert },
      selection: { anchor: range.from + 1, head: range.from + 1 + selected.length }
    })
  );
  return true;
}

function isUrl(value) {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function getEditorScroller() {
  return editorHost.querySelector('.cm-scroller');
}

function getScrollRatio(element) {
  if (!element) return 0;
  const maxScroll = element.scrollHeight - element.clientHeight;
  if (maxScroll <= 0) return 0;
  return element.scrollTop / maxScroll;
}

function setScrollRatio(element, ratio) {
  if (!element) return;
  const maxScroll = element.scrollHeight - element.clientHeight;
  if (maxScroll <= 0) return;
  const safeRatio = Math.max(0, Math.min(1, ratio));
  element.scrollTop = maxScroll * safeRatio;
}

function slugifyHeading(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function addHeadingIds(root) {
  const usedIds = new Set();
  root.querySelectorAll('[id]').forEach((node) => usedIds.add(node.id));
  root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
    if (heading.id) {
      usedIds.add(heading.id);
      return;
    }
    const base = slugifyHeading(heading.textContent || '');
    if (!base) return;
    let candidate = base;
    let suffix = 2;
    while (usedIds.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    heading.id = candidate;
    usedIds.add(candidate);
  });
}

const showFindBar = () => {
  findbar.classList.remove('hidden');
  findInput.focus({ preventScroll: true });
  const len = findInput.value.length;
  findInput.setSelectionRange(len, len);
  updateFindStatus();
};

const hideFindBar = async () => {
  findbar.classList.add('hidden');
  await window.mona.stopFindInPage();
  view.focus();
};

const updateFindStatus = (matches, active) => {
  if (!currentFindQuery) {
    findStatus.textContent = '';
    return;
  }
  if (typeof matches === 'number' && matches > 0) {
    findStatus.textContent = `${active}/${matches}`;
    return;
  }
  if (typeof matches === 'number') {
    findStatus.textContent = '0/0';
    return;
  }
  findStatus.textContent = '...';
};

const runFind = async ({ forward = true, findNext: nextMatch = false } = {}) => {
  const query = findInput.value.trim();
  currentFindQuery = query;
  updateFindStatus();
  await window.mona.findInPage(query, { forward, findNext: nextMatch });
};

const loadDocument = ({ filePath, content }) => {
  currentFilePath = filePath;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: content ?? '' }
  });
  setDirty(false);
  togglePreviewState(false);
  view.focus();
};

const showShortcuts = () => {
  if (!isPreview) return;
  modal.classList.remove('hidden');
  modal.querySelector('button').focus();
};

const hideShortcuts = () => {
  modal.classList.add('hidden');
  view.focus();
};

window.mona.onMenu('menu-toggle-preview', () => togglePreview());
window.mona.onMenu('menu-show-shortcuts', showShortcuts);
window.mona.onMenu('menu-format-bold', () => wrapSelection('**', '**')(view));
window.mona.onMenu('menu-format-italic', () => wrapSelection('_', '_')(view));
window.mona.onMenu('menu-format-strike', () => wrapSelection('~~', '~~')(view));
window.mona.onMenu('menu-format-code', () => wrapSelection('`', '`')(view));
window.mona.onMenu('menu-format-link', () => insertLink(view));
window.mona.onMenu('menu-format-quote', () => prefixLine('> ')(view));
window.mona.onMenu('menu-format-ul', () => prefixLine('- ')(view));
window.mona.onMenu('menu-format-ol', () => prefixLine('1. ')(view));
window.mona.onMenu('menu-format-task', () => prefixLine('- [ ] ')(view));
window.mona.onMenu('menu-format-indent', () => indentMore(view));
window.mona.onMenu('menu-format-outdent', () => indentLess(view));
window.mona.onMenu('menu-format-heading', () => toggleHeading(2)(view));
window.mona.onMenu('menu-format-code-block', () => insertCodeBlock(view));
window.mona.onMenu('menu-find', showFindBar);
window.mona.onMenu('menu-find-next', () => {
  if (findbar.classList.contains('hidden')) showFindBar();
  runFind({ forward: true, findNext: true });
});
window.mona.onMenu('menu-find-prev', () => {
  if (findbar.classList.contains('hidden')) showFindBar();
  runFind({ forward: false, findNext: true });
});
window.mona.onFindResult((result) => {
  updateFindStatus(result?.matches, result?.activeMatchOrdinal);
});
window.mona.onDocumentLoad(loadDocument);
window.mona.onDocumentSaved(({ filePath }) => {
  currentFilePath = filePath ?? null;
  setDirty(false);
});

modalClose.addEventListener('click', hideShortcuts);
modal.addEventListener('click', (event) => {
  if (event.target === modal) hideShortcuts();
});

titlebarHitArea.addEventListener('dblclick', () => {
  window.mona.toggleMaximize();
});

previewContent.addEventListener('click', (event) => {
  const anchor = event.target.closest('a[href^="#"]');
  if (!anchor) return;
  const hash = anchor.getAttribute('href') || '';
  const targetId = decodeURIComponent(hash.slice(1));
  if (!targetId) return;
  const target = previewContent.querySelector(`#${CSS.escape(targetId)}`);
  if (!target) return;
  event.preventDefault();
  target.scrollIntoView({ block: 'start' });
  if (history.replaceState) {
    history.replaceState(null, '', `#${targetId}`);
  }
});

findInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    runFind({ forward: !event.shiftKey, findNext: true });
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    hideFindBar();
  }
});
findPrev.addEventListener('click', () => runFind({ forward: false, findNext: true }));
findNext.addEventListener('click', () => runFind({ forward: true, findNext: true }));
findClose.addEventListener('click', hideFindBar);

window.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    showFindBar();
  }
  if (event.key === '?' && isPreview) {
    event.preventDefault();
    showShortcuts();
  }
  if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
    hideShortcuts();
  }
  if (event.key === 'Escape' && !findbar.classList.contains('hidden')) {
    hideFindBar();
  }
  if (event.key === 'Escape') {
    window.mona.exitFullscreen();
  }
});

updateTitle();
view.focus();
syncDocumentState();

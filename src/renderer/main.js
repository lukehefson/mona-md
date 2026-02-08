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

let currentFilePath = null;
let tempFilePath = null;
let isPreview = false;
let isDirty = false;
let autosaveTimer = null;

const updateTitle = () => {
  const name = currentFilePath ? currentFilePath.split('/').pop() : 'Untitled';
  document.title = isDirty ? `${name} •` : name;
};

const setDirty = (dirty) => {
  isDirty = dirty;
  updateTitle();
};

const scheduleAutosave = () => {
  const targetPath = currentFilePath || tempFilePath;
  if (!targetPath) return;
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(async () => {
    await window.mona.writeFile(targetPath, view.state.doc.toString());
    setDirty(false);
  }, 800);
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
          scheduleAutosave();
          if (isPreview) {
            refreshPreview();
          }
        }
      })
    ]
  })
});

const togglePreviewState = (nextState) => {
  isPreview = nextState;
  previewPane.classList.toggle('hidden', !isPreview);
  editorHost.classList.toggle('hidden', isPreview);
  window.mona.setPreviewState(isPreview);
  if (isPreview) {
    refreshPreview();
  }
};

function togglePreview() {
  togglePreviewState(!isPreview);
  return true;
}

function refreshPreview() {
  previewContent.innerHTML = md.render(view.state.doc.toString());
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

const openFile = async () => {
  const result = await window.mona.openFile();
  if (!result) return;
  currentFilePath = result.filePath;
  tempFilePath = null;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: result.content }
  });
  setDirty(false);
  togglePreviewState(false);
};

const openRecent = async (filePath) => {
  if (!filePath) return;
  const result = await window.mona.readFile(filePath);
  if (!result) return;
  currentFilePath = result.filePath;
  tempFilePath = null;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: result.content }
  });
  setDirty(false);
  togglePreviewState(false);
};

const saveFileAs = async () => {
  const defaultPath = currentFilePath || 'README.md';
  const filePath = await window.mona.saveDialog(defaultPath);
  if (!filePath) return false;
  currentFilePath = filePath;
  tempFilePath = null;
  await window.mona.writeFile(filePath, view.state.doc.toString());
  await window.mona.addRecent(filePath);
  await window.mona.clearTemp();
  setDirty(false);
  return true;
};

const saveFile = async () => {
  if (!currentFilePath) {
    return saveFileAs();
  }
  await window.mona.writeFile(currentFilePath, view.state.doc.toString());
  await window.mona.addRecent(currentFilePath);
  setDirty(false);
  return true;
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


const clearRecents = async () => {
  await window.mona.clearRecents();
};

const discardDraft = async () => {
  currentFilePath = null;
  tempFilePath = await window.mona.getTempPath();
  await window.mona.clearTemp();
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: '' }
  });
  setDirty(false);
  togglePreviewState(false);
};

window.mona.onMenu('menu-open', openFile);
window.mona.onMenu('menu-save', saveFile);
window.mona.onMenu('menu-save-as', saveFileAs);
window.mona.onMenu('menu-toggle-preview', () => togglePreview());
window.mona.onMenu('menu-show-shortcuts', showShortcuts);
window.mona.onMenu('menu-open-recent', openRecent);
window.mona.onMenu('menu-clear-recents', clearRecents);
window.mona.onMenu('menu-discard-draft', discardDraft);
window.mona.onMenu('menu-new', discardDraft);
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

modalClose.addEventListener('click', hideShortcuts);
modal.addEventListener('click', (event) => {
  if (event.target === modal) hideShortcuts();
});

window.addEventListener('keydown', (event) => {
  if (event.key === '?' && isPreview) {
    event.preventDefault();
    showShortcuts();
  }
  if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
    hideShortcuts();
  }
  if (event.key === 'Escape') {
    window.mona.exitFullscreen();
  }
});

updateTitle();
view.focus();

const loadTempDraft = async () => {
  const tempResult = await window.mona.loadTemp();
  if (tempResult?.content) {
    tempFilePath = tempResult.filePath;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: tempResult.content }
    });
    setDirty(false);
    return true;
  } else {
    tempFilePath = await window.mona.getTempPath();
  }
  return false;
};

const loadLastIfAvailable = async () => {
  const lastPath = await window.mona.getLastFile();
  if (!lastPath) return false;
  const result = await window.mona.readFile(lastPath);
  if (!result) return false;
  currentFilePath = result.filePath;
  tempFilePath = null;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: result.content }
  });
  setDirty(false);
  return true;
};

(async () => {
  const hasTemp = await loadTempDraft();
  if (!hasTemp) {
    await loadLastIfAvailable();
  }
})();

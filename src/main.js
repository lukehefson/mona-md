import { app, BrowserWindow, Menu, dialog, shell, ipcMain } from 'electron';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const isDev = !app.isPackaged;
app.setName('Mona MD');
app.name = 'Mona MD';

const appIconPath = path.join(app.getAppPath(), 'icon.png');
const gotSingleInstanceLock = app.requestSingleInstanceLock();
const recentsPath = () => path.join(app.getPath('userData'), 'recents.json');
const supportedExtensions = ['md', 'markdown', 'mdx', 'txt'];

let recents = [];
let pendingOpenPaths = [];
const windowState = new Map();

const isSupportedDocument = (filePath = '') => {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return supportedExtensions.includes(extension);
};

const getWindowState = (window) => {
  if (!window || window.isDestroyed()) return null;
  return windowState.get(window.id) ?? null;
};

const getWindowFromEvent = (event) => BrowserWindow.fromWebContents(event.sender);

const getFocusedWindow = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;

const blockedPreviewLinkProtocols = new Set(['javascript:', 'data:', 'vbscript:']);

const isBlockedPreviewLinkProtocol = (url) => blockedPreviewLinkProtocols.has(url.protocol.toLowerCase());

const directoryFileUrl = (filePath) => {
  const directoryPath = path.dirname(filePath);
  const directoryWithSeparator = directoryPath.endsWith(path.sep)
    ? directoryPath
    : `${directoryPath}${path.sep}`;
  return pathToFileURL(directoryWithSeparator);
};

const normalizePreviewLink = (href, filePath) => {
  if (typeof href !== 'string') return null;

  const trimmedHref = href.trim();
  if (!trimmedHref || trimmedHref.startsWith('#')) return null;

  try {
    const url = new URL(trimmedHref.startsWith('//') ? `https:${trimmedHref}` : trimmedHref);
    if (isBlockedPreviewLinkProtocol(url)) return null;
    return url.href;
  } catch {
    if (!filePath) return null;
  }

  try {
    const url = new URL(trimmedHref, directoryFileUrl(filePath));
    if (isBlockedPreviewLinkProtocol(url)) return null;
    return url.href;
  } catch {
    return null;
  }
};

const loadRecents = async () => {
  try {
    const data = await readFile(recentsPath(), 'utf8');
    recents = JSON.parse(data);
  } catch {
    recents = [];
  }
};

const saveRecents = async () => {
  await writeFile(recentsPath(), JSON.stringify(recents.slice(0, 10)), 'utf8');
};

const addRecent = async (filePath) => {
  if (!filePath) return;
  recents = [filePath, ...recents.filter((entry) => entry !== filePath)];
  await saveRecents();
  buildMenu();
};

const sendToWindow = (window, channel, payload) => {
  if (!window || window.isDestroyed()) return;
  window.webContents.send(channel, payload);
};

const updateWindowAppearance = (window) => {
  const state = getWindowState(window);
  if (!window || window.isDestroyed() || !state) return;

  const name = state.filePath ? path.basename(state.filePath) : 'Untitled';
  const title = state.isDirty ? `${name} •` : name;
  window.setTitle(title);
  window.setDocumentEdited(Boolean(state.isDirty));
  window.setRepresentedFilename(state.filePath || '');
};

const registerWindow = (window) => {
  windowState.set(window.id, {
    filePath: null,
    content: '',
    isDirty: false,
    isPreview: false,
    closeInProgress: false,
    closeApproved: false
  });
  updateWindowAppearance(window);
};

const createSpellcheckMenu = (window, params) => {
  const template = [];

  if (params.misspelledWord) {
    const suggestions = params.dictionarySuggestions.slice(0, 6);
    if (suggestions.length > 0) {
      suggestions.forEach((suggestion) => {
        template.push({
          label: suggestion,
          click: () => window.webContents.replaceMisspelling(suggestion)
        });
      });
    } else {
      template.push({ label: 'No Guesses Found', enabled: false });
    }

    template.push({ type: 'separator' });
    template.push({
      label: 'Ignore Spelling',
      click: () => window.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
    });
    template.push({
      label: 'Learn Spelling',
      click: () => window.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
    });
    template.push({ type: 'separator' });
  }

  if (params.selectionText?.trim()) {
    template.push({ role: 'cut' });
    template.push({ role: 'copy' });
  } else {
    template.push({ role: 'copy' });
  }

  if (params.isEditable) {
    template.push({ role: 'paste' });
    template.push({ type: 'separator' });
    template.push({
      label: 'Spelling and Grammar',
      submenu: [
        { role: 'toggleSpellChecker' },
        { role: 'showSubstitutions' },
        { role: 'toggleTextReplacement' }
      ]
    });
  }

  return template;
};

const attachWindowHandlers = (window) => {
  window.on('focus', () => buildMenu());
  window.on('closed', () => {
    windowState.delete(window.id);
    buildMenu();
  });

  window.on('close', async (event) => {
    const state = getWindowState(window);
    if (!state || state.closeApproved || state.closeInProgress) return;
    if (!state.isDirty) return;

    event.preventDefault();
    state.closeInProgress = true;

    const isUntitled = !state.filePath;
    const response = await dialog.showMessageBox(window, {
      type: 'question',
      buttons: isUntitled ? ['Save…', 'Delete', 'Cancel'] : ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      message: isUntitled
        ? 'Do you want to keep this new document “Untitled”?'
        : `Do you want to save the changes made to “${path.basename(state.filePath)}”?`,
      detail: isUntitled
        ? "You can save your changes or delete this document immediately. You can't undo this action."
        : "Your changes will be lost if you don't save them."
    });

    let shouldClose = false;

    if (response.response === 0) {
      shouldClose = await saveWindow(window, { saveAs: isUntitled });
    } else if (response.response === 1) {
      shouldClose = true;
    }

    state.closeInProgress = false;

    if (shouldClose && !window.isDestroyed()) {
      state.closeApproved = true;
      window.close();
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('found-in-page', (_event, result) => {
    sendToWindow(window, 'find-result', {
      requestId: result.requestId,
      activeMatchOrdinal: result.activeMatchOrdinal,
      matches: result.matches,
      finalUpdate: result.finalUpdate
    });
  });

  window.webContents.on('context-menu', (_event, params) => {
    const template = createSpellcheckMenu(window, params);
    if (template.length === 0) return;
    Menu.buildFromTemplate(template).popup({ window });
  });
};

const createWindow = async () => {
  const window = new BrowserWindow({
    width: 1200,
    height: 900,
    backgroundColor: '#ffffff',
    titleBarStyle: 'default',
    icon: appIconPath,
    webPreferences: {
      preload: path.join(app.getAppPath(), 'src/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true
    }
  });

  registerWindow(window);
  attachWindowHandlers(window);

  if (isDev) {
    await window.loadURL('http://localhost:5173');
  } else {
    await window.loadFile(path.join(app.getAppPath(), 'dist/renderer/index.html'));
  }

  return window;
};

const loadDocumentIntoWindow = async (window, filePath) => {
  if (!window || window.isDestroyed() || !filePath) return false;
  const content = await readFile(filePath, 'utf8');
  const state = getWindowState(window);
  if (!state) return false;

  state.filePath = filePath;
  state.content = content;
  state.isDirty = false;
  updateWindowAppearance(window);
  sendToWindow(window, 'document-load', { filePath, content });
  await addRecent(filePath);
  return true;
};

const chooseWindowForOpen = async () => {
  const focused = getFocusedWindow();
  const state = getWindowState(focused);

  if (focused && state && !state.filePath && !state.isDirty && !state.content.trim()) {
    return focused;
  }

  return createWindow();
};

const promptForOpen = async (window) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    buttonLabel: 'Open',
    properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: supportedExtensions }]
  });

  if (canceled || filePaths.length === 0) return false;
  return loadDocumentIntoWindow(window, filePaths[0]);
};

const promptStartupChoice = async (window) => {
  if (!window || window.isDestroyed()) return;

  const { response } = await dialog.showMessageBox(window, {
    type: 'question',
    buttons: ['Open…', 'New Document', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    message: 'Open a Markdown document or create a new one?',
    detail: 'Launch Mona MD with an existing file, start a new document, or cancel.'
  });

  if (response === 0) {
    const didOpen = await promptForOpen(window);
    if (!didOpen && !window.isDestroyed()) {
      window.focus();
    }
    return;
  }

  if (response === 2 && !window.isDestroyed()) {
    const state = getWindowState(window);
    if (state) state.closeApproved = true;
    window.close();
  }
};

const saveWindow = async (window, { saveAs = false } = {}) => {
  const state = getWindowState(window);
  if (!window || window.isDestroyed() || !state) return false;

  let targetPath = state.filePath;
  if (saveAs || !targetPath) {
    const defaultPath = targetPath || path.join(app.getPath('documents'), 'Untitled.md');
    const { canceled, filePath } = await dialog.showSaveDialog(window, {
      defaultPath,
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    });

    if (canceled || !filePath) return false;
    targetPath = filePath;
  }

  await writeFile(targetPath, state.content, 'utf8');
  state.filePath = targetPath;
  state.isDirty = false;
  updateWindowAppearance(window);
  sendToWindow(window, 'document-saved', { filePath: targetPath });
  await addRecent(targetPath);
  return true;
};

const clearRecents = async () => {
  recents = [];
  await saveRecents();
  buildMenu();
};

const sendToFocusedWindow = (channel, payload) => {
  const window = getFocusedWindow();
  if (window) {
    sendToWindow(window, channel, payload);
  }
};

const buildMenu = () => {
  const recentItems = recents
    .filter((entry) => existsSync(entry))
    .slice(0, 10)
    .map((entry) => ({
      label: entry,
      click: async () => {
        const window = await chooseWindowForOpen();
        await loadDocumentIntoWindow(window, entry);
      }
    }));

  if (recentItems.length === 0) {
    recentItems.push({ label: 'No Recent Files', enabled: false });
  } else {
    recentItems.push({ type: 'separator' });
    recentItems.push({
      label: 'Clear Recent',
      click: clearRecents
    });
  }

  const focusedState = getWindowState(getFocusedWindow());
  const isPreview = Boolean(focusedState?.isPreview);

  const template = [
    {
      label: 'Mona MD',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: async () => {
            await createWindow();
          }
        },
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const window = await chooseWindowForOpen();
            await promptForOpen(window);
          }
        },
        {
          label: 'Open Recent',
          submenu: recentItems
        },
        { type: 'separator' },
        { role: 'close' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: async () => {
            const window = getFocusedWindow();
            if (window) {
              await saveWindow(window);
            }
          }
        },
        {
          label: 'Duplicate',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: async () => {
            const window = getFocusedWindow();
            if (window) {
              await saveWindow(window, { saveAs: true });
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Preview/Edit Markdown',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => sendToFocusedWindow('menu-toggle-preview')
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find',
          accelerator: 'CmdOrCtrl+F',
          click: () => sendToFocusedWindow('menu-find')
        },
        {
          label: 'Find Next',
          accelerator: 'CmdOrCtrl+G',
          click: () => sendToFocusedWindow('menu-find-next')
        },
        {
          label: 'Find Previous',
          accelerator: 'Shift+CmdOrCtrl+G',
          click: () => sendToFocusedWindow('menu-find-prev')
        },
        { type: 'separator' },
        { role: 'toggleSpellChecker' },
        { role: 'showSubstitutions' },
        { role: 'toggleTextReplacement' }
      ]
    },
    {
      label: 'Format',
      submenu: [
        {
          label: 'Markdown Shortcuts',
          id: 'format-shortcuts',
          accelerator: '?',
          enabled: isPreview,
          click: () => sendToFocusedWindow('menu-show-shortcuts')
        },
        { type: 'separator' },
        {
          label: 'Bold',
          id: 'format-bold',
          accelerator: 'CmdOrCtrl+B',
          enabled: !isPreview,
          click: () => sendToFocusedWindow('menu-format-bold')
        },
        {
          label: 'Italic',
          id: 'format-italic',
          accelerator: 'CmdOrCtrl+I',
          enabled: !isPreview,
          click: () => sendToFocusedWindow('menu-format-italic')
        },
        {
          label: 'Strikethrough',
          id: 'format-strike',
          accelerator: 'CmdOrCtrl+Shift+X',
          enabled: !isPreview,
          click: () => sendToFocusedWindow('menu-format-strike')
        },
        {
          label: 'Inline Code',
          id: 'format-code',
          accelerator: 'CmdOrCtrl+E',
          enabled: !isPreview,
          click: () => sendToFocusedWindow('menu-format-code')
        },
        {
          label: 'Link',
          id: 'format-link',
          accelerator: 'CmdOrCtrl+K',
          enabled: !isPreview,
          click: () => sendToFocusedWindow('menu-format-link')
        },
        { type: 'separator' },
        {
          label: 'Quote',
          id: 'format-quote',
          accelerator: 'CmdOrCtrl+Shift+.',
          enabled: !isPreview,
          click: () => sendToFocusedWindow('menu-format-quote')
        },
        {
          label: 'Unordered List',
          id: 'format-ul',
          accelerator: 'CmdOrCtrl+Shift+8',
          enabled: !isPreview,
          click: () => sendToFocusedWindow('menu-format-ul')
        },
        {
          label: 'Ordered List',
          id: 'format-ol',
          accelerator: 'CmdOrCtrl+Shift+7',
          enabled: !isPreview,
          click: () => sendToFocusedWindow('menu-format-ol')
        },
        {
          label: 'Task List',
          id: 'format-task',
          accelerator: 'CmdOrCtrl+Shift+9',
          enabled: !isPreview,
          click: () => sendToFocusedWindow('menu-format-task')
        },
        { type: 'separator' },
        {
          label: 'Indent',
          id: 'format-indent',
          accelerator: 'Tab',
          enabled: !isPreview,
          click: () => sendToFocusedWindow('menu-format-indent')
        },
        {
          label: 'Outdent',
          id: 'format-outdent',
          accelerator: 'Shift+Tab',
          enabled: !isPreview,
          click: () => sendToFocusedWindow('menu-format-outdent')
        },
        {
          label: 'Heading',
          id: 'format-heading',
          accelerator: 'CmdOrCtrl+Shift+H',
          enabled: !isPreview,
          click: () => sendToFocusedWindow('menu-format-heading')
        },
        {
          label: 'Code Block',
          id: 'format-code-block',
          accelerator: 'CmdOrCtrl+Shift+K',
          enabled: !isPreview,
          click: () => sendToFocusedWindow('menu-format-code-block')
        }
      ]
    },
    {
      role: 'window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const bootstrap = async () => {
  await loadRecents();

  if (isDev && process.platform === 'darwin' && app.dock?.setIcon) {
    try {
      app.dock.setIcon(appIconPath);
    } catch {
      // Ignore dock icon failures in dev.
    }
  }

  buildMenu();

  if (pendingOpenPaths.length > 0) {
    for (const filePath of pendingOpenPaths) {
      const window = await createWindow();
      await loadDocumentIntoWindow(window, filePath);
    }
    pendingOpenPaths = [];
    return;
  }

  const startupWindow = await createWindow();
  await promptStartupChoice(startupWindow);
};

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', async (_event, argv) => {
    const fileArgs = argv.filter((arg) => isSupportedDocument(arg));

    if (fileArgs.length === 0) {
      const window = getFocusedWindow() ?? await createWindow();
      if (window.isMinimized()) window.restore();
      window.focus();
      return;
    }

    for (const filePath of fileArgs) {
      const window = await createWindow();
      await loadDocumentIntoWindow(window, filePath);
    }
  });
}

app.on('open-file', async (event, filePath) => {
  event.preventDefault();
  if (!isSupportedDocument(filePath)) return;

  if (app.isReady()) {
    const window = await createWindow();
    await loadDocumentIntoWindow(window, filePath);
    return;
  }

  pendingOpenPaths.push(filePath);
});

app.whenReady().then(async () => {
  await bootstrap();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const window = await createWindow();
      await promptStartupChoice(window);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.on('document:update-state', (event, payload) => {
  const window = getWindowFromEvent(event);
  const state = getWindowState(window);
  if (!window || !state) return;

  state.filePath = payload?.filePath ?? null;
  state.content = typeof payload?.content === 'string' ? payload.content : state.content;
  state.isDirty = Boolean(payload?.isDirty);
  state.isPreview = Boolean(payload?.isPreview);
  updateWindowAppearance(window);
  buildMenu();
});

ipcMain.handle('file:read', async (_event, filePath) => {
  const content = await readFile(filePath, 'utf8');
  await addRecent(filePath);
  return { filePath, content };
});

ipcMain.handle('preview:open-link', async (event, href) => {
  const window = getWindowFromEvent(event);
  if (!window || window.isDestroyed()) return { opened: false };

  const state = getWindowState(window);
  const url = normalizePreviewLink(href, state?.filePath);
  if (!url) return { opened: false };

  try {
    await shell.openExternal(url);
    return { opened: true };
  } catch {
    return { opened: false };
  }
});

ipcMain.handle('window:toggle-maximize', async (event) => {
  const window = getWindowFromEvent(event);
  if (!window || window.isDestroyed()) return false;
  if (window.isMaximized()) {
    window.unmaximize();
  } else {
    window.maximize();
  }
  return true;
});

ipcMain.handle('window:exit-fullscreen', async (event) => {
  const window = getWindowFromEvent(event);
  if (window && !window.isDestroyed()) {
    window.setFullScreen(false);
  }
  return true;
});

ipcMain.handle('find:start', async (event, text, options = {}) => {
  const window = getWindowFromEvent(event);
  if (!window || window.isDestroyed()) return false;
  const contents = window.webContents;

  if (!text) {
    contents.stopFindInPage('clearSelection');
    return true;
  }

  const requestId = contents.findInPage(text, options);
  return requestId;
});

ipcMain.handle('find:stop', async (event) => {
  const window = getWindowFromEvent(event);
  if (!window || window.isDestroyed()) return false;
  window.webContents.stopFindInPage('clearSelection');
  return true;
});

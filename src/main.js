import { app, BrowserWindow, dialog, Menu, shell, ipcMain } from 'electron';
import { readFile, writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const isDev = !app.isPackaged;
app.setName('Mona MD');
app.name = 'Mona MD';

let mainWindow;
let recents = [];
let isPreview = false;
let lastFilePath = null;

const recentsPath = () => path.join(app.getPath('userData'), 'recents.json');
const tempPath = () => path.join(app.getPath('userData'), 'untitled.md');
const lastPath = () => path.join(app.getPath('userData'), 'last.json');

const loadRecents = async () => {
  try {
    const data = await readFile(recentsPath(), 'utf8');
    recents = JSON.parse(data);
  } catch {
    recents = [];
  }
};

const loadLastFile = async () => {
  try {
    const data = await readFile(lastPath(), 'utf8');
    lastFilePath = JSON.parse(data)?.filePath ?? null;
  } catch {
    lastFilePath = null;
  }
};

const saveRecents = async () => {
  await writeFile(recentsPath(), JSON.stringify(recents.slice(0, 10)), 'utf8');
};

const saveLastFile = async (filePath) => {
  lastFilePath = filePath || null;
  await writeFile(lastPath(), JSON.stringify({ filePath: lastFilePath }), 'utf8');
};

const addRecent = async (filePath) => {
  if (!filePath) return;
  recents = [filePath, ...recents.filter((entry) => entry !== filePath)];
  await saveRecents();
  await saveLastFile(filePath);
  buildMenu();
};

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    backgroundColor: '#ffffff',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(app.getAppPath(), 'src/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173');
  } else {
    await mainWindow.loadFile(path.join(app.getAppPath(), 'dist/renderer/index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
};

const sendToRenderer = (channel, payload) => {
  const contents = mainWindow?.webContents;
  if (!contents || contents.isDestroyed()) return;
  contents.send(channel, payload);
};


const buildMenu = () => {
  const recentItems = recents
    .filter((entry) => existsSync(entry))
    .slice(0, 10)
    .map((entry) => ({
      label: entry,
      click: () => sendToRenderer('menu-open-recent', entry)
    }));

  if (recentItems.length === 0) {
    recentItems.push({ label: 'No Recent Files', enabled: false });
  } else {
    recentItems.push({ type: 'separator' });
    recentItems.push({
      label: 'Clear Recent',
      click: () => sendToRenderer('menu-clear-recents')
    });
  }

  const template = [
    {
      label: 'Mona MD',
      submenu: [
        { role: 'about' },
        {
          role: 'preferences',
          label: 'Settings…',
          accelerator: 'CmdOrCtrl+,',
          click: () => sendToRenderer('menu-settings')
        },
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
          click: () => sendToRenderer('menu-new')
        },
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendToRenderer('menu-open')
        },
        {
          label: 'Open Recent',
          submenu: recentItems
        },
        {
          type: 'separator'
        },
        {
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          role: 'close'
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendToRenderer('menu-save')
        },
        {
          label: 'Duplicate',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendToRenderer('menu-save-as')
        },
        { type: 'separator' },
        {
          label: 'Discard Draft',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => sendToRenderer('menu-discard-draft')
        },
        { type: 'separator' },
        {
          label: 'Preview/Edit Markdown',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => sendToRenderer('menu-toggle-preview')
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
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Format',
      submenu: [
        {
          label: 'Markdown Shortcuts',
          id: 'format-shortcuts',
          accelerator: '?',
          click: () => sendToRenderer('menu-show-shortcuts')
        },
        { type: 'separator' },
        {
          label: 'Bold',
          id: 'format-bold',
          accelerator: 'CmdOrCtrl+B',
          click: () => sendToRenderer('menu-format-bold')
        },
        {
          label: 'Italic',
          id: 'format-italic',
          accelerator: 'CmdOrCtrl+I',
          click: () => sendToRenderer('menu-format-italic')
        },
        {
          label: 'Strikethrough',
          id: 'format-strike',
          accelerator: 'CmdOrCtrl+Shift+X',
          click: () => sendToRenderer('menu-format-strike')
        },
        {
          label: 'Inline Code',
          id: 'format-code',
          accelerator: 'CmdOrCtrl+E',
          click: () => sendToRenderer('menu-format-code')
        },
        {
          label: 'Link',
          id: 'format-link',
          accelerator: 'CmdOrCtrl+K',
          click: () => sendToRenderer('menu-format-link')
        },
        { type: 'separator' },
        {
          label: 'Quote',
          id: 'format-quote',
          accelerator: 'CmdOrCtrl+Shift+.',
          click: () => sendToRenderer('menu-format-quote')
        },
        {
          label: 'Unordered List',
          id: 'format-ul',
          accelerator: 'CmdOrCtrl+Shift+8',
          click: () => sendToRenderer('menu-format-ul')
        },
        {
          label: 'Ordered List',
          id: 'format-ol',
          accelerator: 'CmdOrCtrl+Shift+7',
          click: () => sendToRenderer('menu-format-ol')
        },
        {
          label: 'Task List',
          id: 'format-task',
          accelerator: 'CmdOrCtrl+Shift+9',
          click: () => sendToRenderer('menu-format-task')
        },
        { type: 'separator' },
        {
          label: 'Indent',
          id: 'format-indent',
          accelerator: 'Tab',
          click: () => sendToRenderer('menu-format-indent')
        },
        {
          label: 'Outdent',
          id: 'format-outdent',
          accelerator: 'Shift+Tab',
          click: () => sendToRenderer('menu-format-outdent')
        },
        {
          label: 'Heading',
          id: 'format-heading',
          accelerator: 'CmdOrCtrl+Shift+H',
          click: () => sendToRenderer('menu-format-heading')
        },
        {
          label: 'Code Block',
          id: 'format-code-block',
          accelerator: 'CmdOrCtrl+Shift+K',
          click: () => sendToRenderer('menu-format-code-block')
        }
      ]
    },
    {
      role: 'window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  updateMenuState(menu);
};

const updateMenuState = (menu = Menu.getApplicationMenu()) => {
  if (!menu) return;
  const setEnabled = (id, enabled) => {
    const item = menu.getMenuItemById(id);
    if (item) item.enabled = enabled;
  };

  setEnabled('format-shortcuts', isPreview);
  const formatEnabled = !isPreview;
  [
    'format-bold',
    'format-italic',
    'format-strike',
    'format-code',
    'format-link',
    'format-quote',
    'format-ul',
    'format-ol',
    'format-task',
    'format-indent',
    'format-outdent',
    'format-heading',
    'format-code-block'
  ].forEach((id) => setEnabled(id, formatEnabled));
};

app.whenReady().then(async () => {
  await loadRecents();
  await loadLastFile();
  await createWindow();
  buildMenu();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('dialog:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdx', 'txt'] }]
  });

  if (canceled || filePaths.length === 0) return null;

  const filePath = filePaths[0];
  const content = await readFile(filePath, 'utf8');
  await addRecent(filePath);
  return { filePath, content };
});

ipcMain.handle('dialog:save', async (_event, defaultPath) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath,
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
  });

  if (canceled || !filePath) return null;
  return filePath;
});

ipcMain.handle('file:write', async (_event, filePath, content) => {
  await writeFile(filePath, content, 'utf8');
  return true;
});

ipcMain.handle('file:read', async (_event, filePath) => {
  const content = await readFile(filePath, 'utf8');
  await addRecent(filePath);
  return { filePath, content };
});

ipcMain.handle('recents:add', async (_event, filePath) => {
  await addRecent(filePath);
  return true;
});

ipcMain.handle('recents:get', async () => recents);

ipcMain.handle('recents:clear', async () => {
  recents = [];
  await saveRecents();
  buildMenu();
  return true;
});

ipcMain.handle('last:get', async () => lastFilePath);

ipcMain.handle('temp:load', async () => {
  const filePath = tempPath();
  if (!existsSync(filePath)) return null;
  const content = await readFile(filePath, 'utf8');
  return { filePath, content };
});

ipcMain.handle('temp:clear', async () => {
  const filePath = tempPath();
  if (!existsSync(filePath)) return false;
  await unlink(filePath);
  return true;
});

ipcMain.handle('temp:path', async () => tempPath());

ipcMain.on('preview:state', (_event, nextState) => {
  isPreview = Boolean(nextState);
  updateMenuState();
});

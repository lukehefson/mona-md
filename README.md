# mona-md

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Run in dev mode (Vite + Electron):

```bash
npm run dev
```

## Build/Repackage For macOS

To build a local app bundle for replacing the Dock app:

```bash
npm run pack
```

This creates an unpacked `.app` bundle at:

```text
/Users/lukehefson/Projects/mona-md/dist/mac-arm64/
```

Then replace the installed app in `/Applications`.

If Finder/Dock still shows an old icon or stale app state, remove and re-add the app in Dock.

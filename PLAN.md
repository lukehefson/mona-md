A desktop markdown app the looks and feels like using the GitHub web editor.

Probably electron? CRUD (save, view edit `.md` files to filesystem)

Basically, just looks and works like a GitHUb web-view comment area:
- `Cmd + Shift P` to preview/edit — no buttons for this just the keyboard shortcut
    - 'File' menubar item has 'Preview/edit markdown'
- All the GitHub keyboard shortcuts
    - In preview mode `?` opened a modal diaglog with all the relevant keyboard shortcuts
    - 'Format' menubar item tells you about all the formatting options and keyboard shortcuts
- No soft wrap for v1
- Indent mode is always Spaces = 4 for v1
- A single line footer at the bottom
- Preview is styled like GitHub
    - See https://github.com/lukehefson/github-readme-theme for styling for the main content area
- Edit mode is monospaced font, but has _some_ rendering depending on the style
    - Headers are bold
    - Table header rows are bold
    - Bold is bold
    - Italic is italic
    - Strikethrough is strikethrough
    - Links (URLs and anchors) in makdown links get a dark blue text treatment (but not for headers- those remain black bold)
    - Task list item square-brackets get a lighter blue styline
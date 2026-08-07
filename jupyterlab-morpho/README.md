# jupyterlab-morpho

Prototype Morpho syntax highlighting for **JupyterLab 4** / Notebook 7 (CodeMirror 6 `StreamLanguage`).

This package is intentionally structured so language rules can move into a shared
`morpho-syntax` package later. Token tables in [`src/tokens.ts`](src/tokens.ts)
are synced with Morpho's lexer (`standardtokens[]` in Morpho's `lex.c`) and have
no JupyterLab imports.

## Install (development)

From this directory (requires JupyterLab 4, Node, and `jlpm`):

```bash
jlpm install
jlpm build
jupyter labextension develop . --overwrite
```

Or, after `jlpm build`, symlink the built extension:

```bash
# example — adjust to your prefix
ln -sfn "$(pwd)/jupyterlab_morpho/labextension" \
  "$CONDA_PREFIX/share/jupyter/labextensions/jupyterlab-morpho"
```

Fully restart JupyterLab and hard-refresh the browser so the federated bundle
reloads. Open a notebook with the **morpho (xmorpho)** kernel; cells should
highlight Morpho keywords (`fn`, `var`, `with`, …), comments, strings, and
numbers. Help markdown fences tagged `morpho` use the same highlighter.

The xeus-morpho kernel advertises `language_info.codemirror_mode = "morpho"` and
`mimetype = "text/x-morpho"`. Without this labextension, cells stay plain text.

## Layout

| File | Role |
|------|------|
| `src/tokens.ts` | Extractable keyword / literal / operator tables |
| `src/language.ts` | CM6 StreamLanguage adapter |
| `src/index.ts` | Lab `IEditorLanguageRegistry` glue only |

## Extraction path

When a second consumer (e.g. VS Code) needs the same rules:

1. Move `tokens.ts` (and optionally a TextMate grammar) to `morpho-syntax`
2. Keep this package as a thin Lab adapter
3. Leave xeus-morpho with only `language_info` wiring

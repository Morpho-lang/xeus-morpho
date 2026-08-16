# jupyterlab-morpho

Morpho syntax highlighting and **morphoview WebGL MIME** rendering for **JupyterLab 4** / Notebook 7.

Token tables in [`src/tokens.ts`](src/tokens.ts) are synced with Morpho's lexer and have
no JupyterLab imports. The MIME renderer interprets `application/vnd.morpho.morphoview`
(ASCII command IR from `Show.write` / `xjupyter.display`).

## Install (development)

From this directory (requires JupyterLab 4, Node, and `jlpm`):

```bash
jlpm install
jlpm build
jupyter labextension develop . --overwrite
```

Fully restart JupyterLab and hard-refresh the browser. Open a notebook with the
**morpho (xmorpho)** kernel. Cells highlight Morpho; `Display(g)` from `xjupyter`
renders interactive WebGL (drag to orbit, scroll to zoom).

## Layout

| File | Role |
|------|------|
| `src/tokens.ts` | Keyword / literal / operator tables |
| `src/language.ts` | CM6 StreamLanguage adapter |
| `src/parse.ts` | Morphoview ASCII IR parser |
| `src/render.ts` | WebGL drawer |
| `src/mime.ts` | `IRenderMime` widget factory |
| `src/index.ts` | Language + MIME plugins |

## Notebook graphics

```morpho
import xgraphics
import xcolor
import xjupyter

var g = Graphics()
g.display(Sphere([0,0,0], 1, color=Red))
Display(g)
```

Requires xeus-morpho (`JupyterDisplay` builtin + `share/modules/xjupyter.morpho` on the Morpho package path) and the morphoview package for `xgraphics` / `xshow`.
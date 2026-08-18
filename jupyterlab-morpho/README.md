# jupyterlab-morpho

Morpho syntax highlighting and **morphoview WebGL MIME** rendering for **JupyterLab 4** / Notebook 7.

Token tables in [`src/tokens.ts`](src/tokens.ts) are synced with Morpho's lexer and have
no JupyterLab imports. The MIME renderer interprets `application/vnd.morpho.morphoview`
(ASCII command IR from `Show.write` / `jupyter.Display`).

## Install (development)

From this directory (requires JupyterLab 4, Node, and `jlpm`):

```bash
jlpm install
jlpm build
jupyter labextension develop . --overwrite
```

Fully restart JupyterLab and hard-refresh the browser. Open a notebook with the
**morpho (xmorpho)** kernel. Cells highlight Morpho; `Display(g)` from `jupyter`
renders interactive WebGL (drag to orbit, scroll to zoom).

Parser tests (no Lab required):

```bash
jlpm test
```


## Layout

| File | Role |
|------|------|
| `src/tokens.ts` | Keyword / literal / operator tables |
| `src/language.ts` | CM6 StreamLanguage adapter |
| `src/mat4.ts` | Shared column-major 4×4 helpers |
| `src/parse.ts` | Morphoview ASCII IR parser |
| `src/render.ts` | WebGL drawer |
| `src/mime.ts` | `IRenderMime` widget factory |
| `src/index.ts` | Language + MIME plugins |

## Notebook graphics

```morpho
import xgraphics
import xcolor
import jupyter

var g = Graphics()
g.display(Sphere([0,0,0], 1, color=Red))
Display(g)
```

Requires xeus-morpho (`JupyterDisplay` builtin + `share/modules/jupyter.morpho` on the Morpho package path — list this repository in `~/.morphopackages`) and the morphoview package for `xgraphics` / `xshow`.
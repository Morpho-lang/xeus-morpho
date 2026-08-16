[comment]: # (xeus-morpho notebook display help)
[version]: # (0.6)

# Jupyter display
[tagxjupyter]: # (xjupyter)
[tagDisplay]: # (Display)

Module `xjupyter` (shipped with xeus-morpho) shows a `Graphics` or `Scene` inside Jupyter:

    import xgraphics
    import xcolor
    import xjupyter

    var g = Graphics()
    g.display(Sphere([0,0,0], 1, color=Red))
    Display(g)

`Display(g)` serializes with `Show.write` from the morphoview package (`xshow`) and publishes Jupyter `display_data` (`application/vnd.morpho.morphoview`). It does **not** launch the desktop morphoview window — use `Show(g)` for that.

Requires:

* the **xmorpho** kernel (registers the `JupyterDisplay` builtin)
* morphoview package modules on the Morpho package path (`xshow`, `xgraphics`, …)
* jupyterlab-morpho for the WebGL MIME renderer

[comment]: # (xeus-morpho notebook display help)
[version]: # (0.6.4)

# Jupyter inline graphics
[tagjupyter]: # (jupyter)
[tagDisplay]: # (Display)

The `jupyter` module enables a morpho `Graphics` or `Scene` to be displayed inline inside a Jupyter notebook:

    import xgraphics
    import xcolor
    import jupyter

    var g = Graphics()
    g.display(Sphere([0, 0, 0], 1, color=Red))
    Display(g)

This fully coexists with morphoview, so you can also view the graphics in that app:

    import morphoview
    Show(g) // or View(g)

.. Copyright (c) 2023, Tim Atherton

   Distributed under the terms of the MIT license.

   The full license is in the file LICENSE, distributed with this software.

Usage
=====

Launch JupyterLab (or Classic Notebook) and open a new notebook with the
**morpho (xmorpho)** kernel.

Installation is covered in the project README. Morpho 0.6 and a matching
``xmorpho`` kernelspec must be available in the environment.

Code execution
--------------

Cells run Morpho source through the kernel. Printed output (the ``print``
statement and ``System.print``) is streamed to stdout as it is produced, so
long-running cells (for example optimizers) show progress during the run.
Compilation and runtime errors are reported with Morpho's message and stack
trace.

Variables persist across cells in the same kernel session, as in the Morpho
REPL.

Help
----

Morpho's help system works in the notebook:

- Run ``help`` or ``help Topic`` in a cell (or ``?`` / ``Topic?``).
- Use Shift-Tab (inspect) on a topic name for the same markdown help.

Help is rendered as Markdown, including fenced Morpho examples when the
labextension is installed.

Code completion
---------------

Tab completion offers Morpho keywords (aligned with morpho-cli) plus help
topic names from Morpho's help index. Symbol completion is not available yet.

Incomplete code
---------------

When editing a cell, the kernel's ``is_complete`` check matches morpho-cli:
brackets must balance. Help / ``?`` lines are always treated as complete.

Syntax highlighting
-------------------

Cell highlighting for Morpho is provided by the optional JupyterLab 4
extension in ``jupyterlab-morpho/``. Without it, cells are plain text. See
the extension README for build and install steps.

Warnings
--------

Morpho warnings are published on the stderr stream for the cell.

Not yet supported
-----------------

The following Jupyter features are **not** wired up yet:

- Live ``View`` sessions / Jupyter widgets and comms (use desktop morphoview ``View``)
- The Jupyter debugger protocol

In-notebook graphics (static ``Show`` path)
-------------------------------------------

With the morphoview package (for ``xgraphics`` / ``xshow``), xeus-morpho's
``xjupyter`` module on the Morpho package path, and the jupyterlab-morpho MIME
renderer:

.. code-block:: morpho

    import xgraphics
    import xcolor
    import xjupyter

    var g = Graphics()
    g.display(Sphere([0, 0, 0], 1, color=Red))
    Display(g)

``Display(g)`` serializes via ``Show.write`` and publishes
``application/vnd.morpho.morphoview`` display data (WebGL in Lab). Desktop
``Show(g)`` still launches the native morphoview window.

List this repository in ``~/.morphopackages`` (or install the shipped
``share/modules``) so ``import xjupyter`` resolves.

Interactive stdin (``System.readline``) uses Jupyter's input prompt. Print
output is streamed to stdout as it is produced, so prompts appear before the
input box.

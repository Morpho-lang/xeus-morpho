.. Copyright (c) 2023-2026, Tim Atherton

   Distributed under the terms of the MIT license.

   The full license is in the file LICENSE, distributed with this software.

Usage
=====

Launch JupyterLab (or Classic Notebook) and open a new notebook with the
**morpho (xmorpho)** kernel.

Installation is covered in :doc:`installation`. Morpho 0.6.4+ and a matching
``xmorpho`` kernelspec must be available in the environment.

Code execution
--------------

Cells run Morpho source through the kernel. Printed output (the ``print``
statement and ``System.print``) is streamed to stdout as it is produced, so
long-running cells (for example optimizers) show progress during the run.
Compilation and runtime errors are reported with Morpho's message, source
location (line and character, matching the CLI), and stack trace.

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

Tab completion offers Morpho keywords from the language lexer (`standardtokens`) plus help
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
- Interrupting a running cell (the notebook Stop button). Morpho has no cancel
  API, so ``morpho_run`` cannot be aborted from Jupyter. Long-running cells
  (for example optimizers) keep going until they finish. ``System.exit()`` also
  cannot shut the kernel down: Morpho treats that as a successful run.

In-notebook graphics (static ``Show`` path)
-------------------------------------------

With the morphoview package (for ``xgraphics`` / ``xshow``), xeus-morpho's
``jupyter`` module on the Morpho package path, and the jupyterlab-morpho MIME
renderer:

.. code-block:: morpho

    import xgraphics
    import xcolor
    import jupyter

    var g = Graphics()
    g.display(Sphere([0, 0, 0], 1, color=Red))
    Display(g)

``Display(g)`` serializes via ``Show.write`` and publishes
``application/vnd.morpho.morphoview`` display data (WebGL in Lab). Desktop
``Show(g)`` still launches the native morphoview window.

List this repository in ``~/.morphopackages`` (Morpho looks for
``share/modules`` and ``share/help`` under each entry) so ``import jupyter``
resolves. Installing xeus-morpho into the same prefix Morpho uses also works.

Interactive stdin (``System.readline``) uses Jupyter's input prompt. Print
output is streamed to stdout as it is produced, so prompts appear before the
input box.

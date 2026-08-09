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
statement and ``System.print``) appears as the cell result. Compilation and
runtime errors are reported with Morpho's message and stack trace.

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

- Rich display / ``Show`` as notebook images (Morpho still launches morphoview)
- Jupyter widgets and comms
- The Jupyter debugger protocol

Those may appear in later releases; do not expect cookiecutter-style demos
for them.

Interactive stdin (``System.readline``) uses Jupyter's input prompt. Any
``print`` output before ``readline`` is flushed to stdout so prompts are
visible.

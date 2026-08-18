.. Copyright (c) 2023-2026, Tim Atherton

   Distributed under the terms of the MIT license.

   The full license is in the file LICENSE, distributed with this software.

Installation
============

xeus-morpho is not packaged for conda yet; build it from source. Use a
`miniforge <https://github.com/conda-forge/miniforge>`_ or
`miniconda <https://conda.io/miniconda.html>`_ environment. Full Anaconda
installs often conflict on ZeroMQ.

Install build dependencies into the conda environment you use for Jupyter
(often ``base``). From the repository root:

.. code-block:: bash

   conda env update -n "$CONDA_DEFAULT_ENV" -f environment-dev.yml

You also need **Morpho 0.6.4+** (``libmorpho`` and headers). Set ``MORPHO_ROOT``
if CMake cannot find Morpho under the usual prefixes.

Build and install
-----------------

.. code-block:: bash

   cmake -S . -B build \
     -D CMAKE_BUILD_TYPE=Release \
     -D CMAKE_PREFIX_PATH=$CONDA_PREFIX \
     -D CMAKE_INSTALL_PREFIX=$CONDA_PREFIX \
     -D CMAKE_INSTALL_LIBDIR=lib
   cmake --build build -j
   cmake --install build

That puts ``xmorpho`` in ``$CONDA_PREFIX/bin`` and a kernelspec in
``$CONDA_PREFIX/share/jupyter/kernels/xmorpho``. Jupyter must see that prefix:
use the same env’s ``jupyter`` / JupyterLab, or copy the kernelspec into your
Jupyter data dir (for example ``~/Library/Jupyter/kernels/xmorpho`` on macOS).

``CMAKE_INSTALL_LIBDIR=lib`` keeps the macOS conda layout from using ``lib64``.
The install prefix is first on the runtime rpath so a leftover
``/usr/local/lib/libxeus-morpho`` cannot shadow the built library.

On macOS, if you copy ``xmorpho`` / ``libxeus-morpho*.dylib`` by hand (instead of
``cmake --install``), re-sign afterward or the kernel may exit with SIGKILL:

.. code-block:: bash

   codesign -s - -f $CONDA_PREFIX/bin/xmorpho
   codesign -s - -f $CONDA_PREFIX/lib/libxeus-morpho*.dylib

Syntax highlighting
-------------------

Morpho cell highlighting is a separate JupyterLab 4 labextension under
``jupyterlab-morpho/``. After building the kernel:

.. code-block:: bash

   cd jupyterlab-morpho
   jlpm install
   jlpm build
   jupyter labextension develop . --overwrite

Restart JupyterLab (hard-refresh the browser). The same extension renders
morphoview ASCII IR when you ``import jupyter`` and call ``Display(g)``. List
this repository in ``~/.morphopackages`` (Morpho looks for ``share/modules``
and ``share/help`` under each entry), or install into the same prefix Morpho
uses. You still need the morphoview package for ``xgraphics`` / ``xshow``.

Troubleshooting
---------------

- **Wrong ``xmorpho`` on PATH.** An older binary (for example
  ``/usr/local/bin/xmorpho``) can shadow ``$CONDA_PREFIX/bin/xmorpho``. Check
  ``which xmorpho``, ``jupyter kernelspec list``, and the ``argv`` in
  ``kernel.json``.
- **Old ``libxeus-morpho`` in ``/usr/local/lib``.** Confirm with ``otool -L``
  (macOS) or ``ldd`` that the kernel loads the conda-prefix library.

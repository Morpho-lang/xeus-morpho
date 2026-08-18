..  Copyright (c) 2023-2026, Tim Atherton

   Distributed under the terms of the MIT license.

   The full license is in the file LICENSE, distributed with this software.

Build and configuration
=======================

CMake requires **Morpho 0.6.4 or newer** (it reads ``build.h`` next to
``morpho.h``). Set ``MORPHO_ROOT`` if Morpho is not under a usual prefix.

Typical configure flags (see :doc:`installation`):

.. code-block:: bash

   cmake -S . -B build \
     -D CMAKE_BUILD_TYPE=Release \
     -D CMAKE_PREFIX_PATH=$CONDA_PREFIX \
     -D CMAKE_INSTALL_PREFIX=$CONDA_PREFIX \
     -D CMAKE_INSTALL_LIBDIR=lib

The kernelspec is generated in the CMake **build** tree (not the source tree).
``CMAKE_INSTALL_LIBDIR=lib`` is recommended on macOS conda. The install prefix
is first on the runtime rpath so a leftover ``/usr/local/lib/libxeus-morpho``
cannot shadow the built library.

Building the xeus-morpho library
--------------------------------

``xeus-morpho`` supports the following CMake options:

- ``XEUS_MORPHO_BUILD_SHARED``: Build the ``xeus-morpho`` shared library. **Enabled by default**.
- ``XEUS_MORPHO_BUILD_STATIC``: Build the ``xeus-morpho`` static library. **Disabled by default**.
- ``XEUS_MORPHO_USE_SHARED_XEUS``: Link with a ``xeus`` shared library (instead of the static library). **Enabled by default**.

Building the kernel
-------------------

- ``XEUS_MORPHO_BUILD_EXECUTABLE``: Build the ``xmorpho`` executable. **Enabled by default**.

If ``XEUS_MORPHO_USE_SHARED_XEUS_MORPHO`` is disabled, ``xmorpho`` is linked statically with ``xeus-morpho``.

Tests
-----

Protocol tests live under ``test/`` and are run with ``pytest`` against an installed ``xmorpho`` kernelspec (see ``CONTRIBUTING.md``). There is no CMake test target.

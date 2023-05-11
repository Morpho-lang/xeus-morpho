..  Copyright (c) 2023,    

   Distributed under the terms of the MIT license.  

   The full license is in the file LICENSE, distributed with this software.

Build and configuration
=======================

General Build Options
---------------------

Building the xeus-morpho library
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``xeus-morpho`` build supports the following options:

- ``XEUS_MORPHO_BUILD_SHARED``: Build the ``xeus-morpho`` shared library. **Enabled by default**.
- ``XEUS_MORPHO_BUILD_STATIC``: Build the ``xeus-morpho`` static library. **Enabled by default**.


- ``XEUS_MORPHO_USE_SHARED_XEUS``: Link with a `xeus` shared library (instead of the static library). **Enabled by default**.

Building the kernel
~~~~~~~~~~~~~~~~~~~

The package includes two options for producing a kernel: an executable ``xmorpho`` and a Python extension module, which is used to launch a kernel from Python.

- ``XEUS_MORPHO_BUILD_EXECUTABLE``: Build the ``xmorpho``  executable. **Enabled by default**.


If ``XEUS_MORPHO_USE_SHARED_XEUS_MORPHO`` is disabled, xmorpho  will be linked statically with ``xeus-morpho``.

Building the Tests
~~~~~~~~~~~~~~~~~~

- ``XEUS_MORPHO_BUILD_TESTS ``: enables the tets  **Disabled by default**.


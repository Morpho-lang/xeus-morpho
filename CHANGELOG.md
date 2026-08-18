# Changelog

## 0.2.0

- Target xeus 6.x and xeus-zmq 4.x (was xeus 5.x / xeus-zmq 3.x).
- Require Morpho 0.6.4 or newer at configure time.
- Generate the Jupyter kernelspec in the CMake build tree instead of the source tree.
- Put the install prefix first on the runtime rpath so a leftover `/usr/local/lib/libxeus-morpho` cannot shadow the built library.
- Rename the Morpho display module from `xjupyter` to `jupyter` (`import jupyter`).
- Add GitHub Actions CI (kernel protocol tests and jupyterlab-morpho parser tests).
- Document conda-based builds with `cmake -S` / `-B` (install into the Jupyter env; no dedicated env required).

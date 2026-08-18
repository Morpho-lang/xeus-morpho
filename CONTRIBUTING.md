# Contributing to xeus-morpho

xeus-morpho lives under [Morpho-lang](https://github.com/Morpho-lang/xeus-morpho)
and uses [xeus](https://github.com/jupyter-xeus/xeus) for the Jupyter protocol.
Please follow the [Jupyter Code of Conduct](https://github.com/jupyter/governance/blob/master/conduct/code_of_conduct.md).

## Setting up a development environment

Fork the project, then install build and test dependencies into the conda
environment you use for Jupyter (often `base`):

```bash
conda env update -n "$CONDA_DEFAULT_ENV" -f environment-dev.yml
```

You also need **Morpho 0.6.4+** (`libmorpho` and headers). Set `MORPHO_ROOT` if
CMake cannot find Morpho.

Clone your fork, then from the repository root:

```bash
cmake -S . -B build \
  -D CMAKE_BUILD_TYPE=Release \
  -D CMAKE_PREFIX_PATH=$CONDA_PREFIX \
  -D CMAKE_INSTALL_PREFIX=$CONDA_PREFIX \
  -D CMAKE_INSTALL_LIBDIR=lib
cmake --build build -j
cmake --install build
```

## Running the tests

Ensure the `xmorpho` kernelspec points at the kernel you just built/installed (`jupyter kernelspec list`).

```bash
cd test
pytest . -vv
```

The suite uses `jupyter_kernel_test` to exercise execute, help/`?`, completion, `is_complete`, inspect, stdin (`System.readline`), silent execute, and morphoview `display_data`.

Parser tests for the Lab MIME renderer:

```bash
cd jupyterlab-morpho
jlpm test
```

# ![xeus-morpho](docs/source/xeus-logo.svg)

`xeus-morpho` is a Jupyter kernel for the [morpho language](https://github.com/Morpho-lang/morpho) based on the native implementation of the
Jupyter protocol [xeus](https://github.com/jupyter-xeus/xeus).

## Installation

xeus-morpho is not packaged for conda yet; build it from source.

Use a [miniforge](https://github.com/conda-forge/miniforge) or
[miniconda](https://conda.io/miniconda.html) environment. Full Anaconda
installs often conflict on ZeroMQ.

### Install dependencies

In the conda environment you use for Jupyter (often `base`), install the build
stack from [`environment-dev.yml`](environment-dev.yml):

```bash
conda env update -n "$CONDA_DEFAULT_ENV" -f environment-dev.yml
```

(`mamba` / `micromamba` work the same way if you have them.) You also need a
**Morpho 0.6.4+** install (`libmorpho` and headers). Set `MORPHO_ROOT` if CMake
cannot find Morpho under the usual prefixes.

### Build and install the kernel

From the repository root:

```bash
cmake -S . -B build \
  -D CMAKE_BUILD_TYPE=Release \
  -D CMAKE_PREFIX_PATH=$CONDA_PREFIX \
  -D CMAKE_INSTALL_PREFIX=$CONDA_PREFIX \
  -D CMAKE_INSTALL_LIBDIR=lib
cmake --build build -j
cmake --install build
```

Install puts `xmorpho` in `$CONDA_PREFIX/bin` and a kernelspec in
`$CONDA_PREFIX/share/jupyter/kernels/xmorpho`. Jupyter must see that prefix: use the
same env’s `jupyter` / JupyterLab, or copy the kernelspec into your Jupyter
data dir (for example `~/Library/Jupyter/kernels/xmorpho` on macOS).

On macOS, if you copy `xmorpho` / `libxeus-morpho*.dylib` by hand (instead of
`cmake --install`), re-sign afterward or the kernel may exit with SIGKILL:

```bash
codesign -s - -f $CONDA_PREFIX/bin/xmorpho
codesign -s - -f $CONDA_PREFIX/lib/libxeus-morpho*.dylib
```

### Syntax highlighting (JupyterLab 4)

Morpho cell highlighting is a separate prototype labextension under
[`jupyterlab-morpho/`](jupyterlab-morpho/). After building the kernel:

```bash
cd jupyterlab-morpho
jlpm install
jlpm build
jupyter labextension develop . --overwrite
```

Restart JupyterLab (hard-refresh the browser). See
[`jupyterlab-morpho/README.md`](jupyterlab-morpho/README.md) for details.
Token tables are kept extractable for a future shared Morpho syntax package.

The same extension renders morphoview ASCII IR (`application/vnd.morpho.morphoview`)
via WebGL when you `import jupyter` and call `Display(g)`. The Morpho module lives in
[`share/modules/jupyter.morpho`](share/modules/jupyter.morpho); add this repository
to `~/.morphopackages` (Morpho looks for `share/modules` and `share/help` under each
entry) so Morpho can find it. You still need the morphoview package for `xgraphics`
/ `xshow`. See
[`notebooks/morphoview-display.ipynb`](notebooks/morphoview-display.ipynb).

### Troubleshooting

**Wrong `xmorpho` on PATH.** An older binary (for example `/usr/local/bin/xmorpho`)
can shadow `$CONDA_PREFIX/bin/xmorpho`. Check `which xmorpho`,
`jupyter kernelspec list`, and the `argv` in `kernel.json`.

**Old `libxeus-morpho` in `/usr/local/lib`.** The install rpath prefers
`$CONDA_PREFIX/lib`. Confirm with `otool -L` (macOS) or `ldd` that the kernel
loads the conda-prefix library.

## Documentation

- Kernel usage notes: [`docs/source/usage.rst`](docs/source/usage.rst)
- Changelog: [`CHANGELOG.md`](CHANGELOG.md)
- Morpho language docs: https://morpho-lang.readthedocs.io

## Dependencies

`xeus-morpho` depends on

- [xeus](https://github.com/jupyter-xeus/xeus) (>= 6.0, < 7)
- [xeus-zmq](https://github.com/jupyter-xeus/xeus-zmq) (>= 4.0, < 5)
- [nlohmann_json](https://github.com/nlohmann/json)
- [cppzmq](https://github.com/zeromq/cppzmq)
- [morpho](https://github.com/Morpho-lang/morpho) (>= 0.6.4)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) to know how to contribute and set up a
development environment.

## License

This software is licensed under the `MIT license`. See the [LICENSE](LICENSE)
file for details.

# ![xeus-morpho](docs/source/xeus-logo.svg)

`xeus-morpho` is a Jupyter kernel for the [morpho language](https://github.com/Morpho-lang/morpho) based on the native implementation of the
Jupyter protocol [xeus](https://github.com/jupyter-xeus/xeus).

## Installation

xeus-morpho is not packaged for conda/mamba yet; build it from source.

Use a [miniforge](https://github.com/conda-forge/miniforge) or
[miniconda](https://conda.io/miniconda.html) environment. Full Anaconda
installs often conflict on ZeroMQ.

### Create an environment

Preferred (matches [`environment-dev.yml`](environment-dev.yml)):

```bash
mamba env create -f environment-dev.yml
mamba activate xeus-morpho
```

Or create an empty env and install deps by hand (xeus 5.x / xeus-zmq 3.x):

```bash
mamba create -n xeus-morpho
mamba activate xeus-morpho
mamba install cmake cxx-compiler xeus "xeus-zmq>=3.1,<4" nlohmann_json cppzmq jupyterlab -c conda-forge
```

You also need a **Morpho 0.6** install (`libmorpho` and headers). Current kernel
features (stdin, help topics, markdown help) expect Morpho **0.6.4+** APIs.
Set `MORPHO_ROOT` if CMake cannot find Morpho under the usual prefixes.

### Build and install the kernel

```bash
mkdir build && cd build
cmake .. \
  -D CMAKE_PREFIX_PATH=$CONDA_PREFIX \
  -D CMAKE_INSTALL_PREFIX=$CONDA_PREFIX \
  -D CMAKE_INSTALL_LIBDIR=lib
cmake --build . -j
cmake --install .
```

(`make && make install` works too if CMake generated Unix Makefiles.)

Install puts `xmorpho` in `$PREFIX/bin` and a kernelspec in
`$PREFIX/share/jupyter/kernels/xmorpho`. Jupyter must see that prefix: use the
same env’s `jupyter` / JupyterLab, or copy the kernelspec into your Jupyter
data dir (for example `~/Library/Jupyter/kernels/xmorpho` on macOS).

On macOS, if you copy `xmorpho` / `libxeus-morpho*.dylib` by hand (instead of
`cmake --install`), re-sign afterward or the kernel may exit with SIGKILL:

```bash
codesign -s - -f $PREFIX/bin/xmorpho
codesign -s - -f $PREFIX/lib/libxeus-morpho.0.1.0.dylib
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
via WebGL when you `import xjupyter` and call `Display(g)`. The Morpho module lives in
[`share/modules/xjupyter.morpho`](share/modules/xjupyter.morpho); add this repo to
`~/.morphopackages` (or install) so Morpho can find it. You still need the morphoview
package for `xgraphics` / `xshow`. See
[`notebooks/morphoview-display.ipynb`](notebooks/morphoview-display.ipynb).

## Documentation

- Kernel usage notes: [`docs/source/usage.rst`](docs/source/usage.rst)
- Morpho language docs: https://morpho-lang.readthedocs.io

## Dependencies

`xeus-morpho` depends on

- [xeus](https://github.com/jupyter-xeus/xeus) (>= 5.1, < 6)
- [xeus-zmq](https://github.com/jupyter-xeus/xeus-zmq) (>= 3.1, < 4)
- [nlohmann_json](https://github.com/nlohmann/json)
- [cppzmq](https://github.com/zeromq/cppzmq)
- [morpho](https://github.com/Morpho-lang/morpho) (0.6; 0.6.4+ recommended)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) to know how to contribute and set up a
development environment.

## License

This software is licensed under the `MIT license`. See the [LICENSE](LICENSE)
file for details.

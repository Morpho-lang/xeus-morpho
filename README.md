# ![xeus-morpho](docs/source/xeus-logo.svg)

[![Documentation Status](http://readthedocs.org/projects/morpho-lang/badge/?version=latest)](https://morpho-lang.readthedocs.io/en/latest/?badge=latest)

`xeus-morpho` is a Jupyter kernel for the [morpho language](https://github.com/Morpho-lang/morpho) based on the native implementation of the
Jupyter protocol [xeus](https://github.com/jupyter-xeus/xeus).

## Installation

xeus-morpho has not been packaged for the mamba (or conda) package manager.

To ensure that the installation works, it is preferable to install `xeus-morpho` in a
fresh environment. It is also needed to use a
[miniforge](https://github.com/conda-forge/miniforge#mambaforge) or
[miniconda](https://conda.io/miniconda.html) installation because with the full
[anaconda](https://www.anaconda.com/) you may have a conflict with the `zeromq` library
which is already installed in the anaconda distribution.

The safest usage is to create an environment named `xeus-morpho`

```bash
mamba create -n xeus-morpho
source activate xeus-morpho
```

### Installing from source

Install dependencies (xeus 5.x / xeus-zmq 3.x):

```bash
mamba install cmake cxx-compiler xeus "xeus-zmq>=3.1,<4" nlohmann_json cppzmq jupyterlab -c conda-forge
```

Then compile the sources (replace `$CONDA_PREFIX` with a custom installation
prefix if need be). Morpho 0.6 must be installed; set `MORPHO_ROOT` if needed.

```bash
mkdir build && cd build
cmake .. -D CMAKE_PREFIX_PATH=$CONDA_PREFIX -D CMAKE_INSTALL_PREFIX=$CONDA_PREFIX -D CMAKE_INSTALL_LIBDIR=lib
make && make install
```

On macOS, if you copy `xmorpho` / `libxeus-morpho*.dylib` by hand (instead of
`make install`), re-sign afterward or the kernel may exit with SIGKILL:

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

## Documentation

To get started with using `xeus-morpho`, check out the full documentation

http://morpho-lang.readthedocs.io


## Dependencies

`xeus-morpho` depends on

- [xeus](https://github.com/jupyter-xeus/xeus) (>= 5.1, < 6)
- [xeus-zmq](https://github.com/jupyter-xeus/xeus-zmq) (>= 3.1, < 4)
- [nlohmann_json](https://github.com/nlohmann/json)
- [cppzmq](https://github.com/zeromq/cppzmq)
- [morpho](https://github.com/Morpho-lang/morpho) (0.6)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) to know how to contribute and set up a
development environment.

## License

This software is licensed under the `MIT license`. See the [LICENSE](LICENSE)
file for details.

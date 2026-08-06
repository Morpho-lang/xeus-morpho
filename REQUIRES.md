# Required packages

xeus-morpho targets **xeus 5.x** and **xeus-zmq 3.x** (matching the Morpho 0.6 Jupyter kernel stack).

Install build dependencies with conda-forge:

```bash
mamba install cmake cxx-compiler xeus "xeus-zmq>=3.1,<4" nlohmann_json cppzmq jupyterlab -c conda-forge
```

You also need a Morpho 0.6 install (`libmorpho` and headers). Set `MORPHO_ROOT` if CMake cannot find them.

If CMake cannot find the conda packages, pass the prefix explicitly:

```bash
cmake -DCMAKE_PREFIX_PATH="$CONDA_PREFIX" ..
```

To refresh packages later:

```bash
conda update --channel=conda-forge xeus xeus-zmq
```

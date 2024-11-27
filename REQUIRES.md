# Required packages

To build xeus-morpho, we need: 

* Xtl

    mamba install xtl

* xeus

    mamba install xeus

* nlohmann_json

    mamba install nlohmann_json

* Xeus-Zmq

    mamba install xeus-zmq

* CppZmq

    mamba install cppzmq

* OpenSSL: 

    brew install openssl
    cmake . -DOPENSSL_ROOT_DIR=/usr/local/Cellar/openssl@3/3.1.0

----
Note that CMake can have trouble finding the CMake files from the above; may need to set CMAKE_PREFIX_PATH as follows:

cmake -DCMAKE_PREFIX_PATH="/usr/local/Caskroom/miniforge/base/share/cmake;/usr/local/Caskroom/miniforge/base/lib/cmake" ..

We also needed up-to-date jupyter, so used brew to install jupyterlab 


# Required packages

To build xeus-morpho, we need: 

* Xtl

    conda install xtl -c conda-forge

* xeus

    conda install -c conda-forge xeus

* nlohmann_json

    conda install -c conda-forge nlohmann_json

* Xeus-Zmq

    conda install -c conda-forge xeus-zmq

* CppZmq

    conda install -c conda-forge cppzmq

* OpenSSL: 

    brew install openssl
    cmake . -DOPENSSL_ROOT_DIR=/usr/local/Cellar/openssl@3/3.1.0
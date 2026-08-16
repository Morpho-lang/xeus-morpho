/***************************************************************************
* Copyright (c) 2023, Tim Atherton                                  
*                                                                          
* Distributed under the terms of the MIT license.                 
*                                                                          
* The full license is in the file LICENSE, distributed with this software. 
****************************************************************************/

#include <cstdlib>
#include <iostream>
#include <memory>
#include <string>
#include <utility>
#include <signal.h>

#ifdef __GNUC__
#include <stdio.h>
#include <execinfo.h>
#include <stdlib.h>
#include <unistd.h>
#endif

#include "xeus/xeus_context.hpp"
#include "xeus/xhelper.hpp"
#include "xeus/xkernel.hpp"
#include "xeus/xkernel_configuration.hpp"
#include "xeus/xserver.hpp"

#include "xeus-zmq/xserver_zmq_split.hpp"
#include "xeus-zmq/xzmq_context.hpp"

#include "xeus-morpho/xinterpreter.hpp"
#include "xeus-morpho/xeus_morpho_config.hpp"

#ifdef __GNUC__
void handler(int sig)
{
    void* array[10];
    size_t size = backtrace(array, 10);
    fprintf(stderr, "Error: signal %d:\n", sig);
    backtrace_symbols_fd(array, size, STDERR_FILENO);
    _exit(1);
}
#endif

namespace
{
    std::string morpho_banner()
    {
        return " ___   ___\n"
               "( @ \\Y/ @ )   morpho  " MORPHO_VERSIONSTRING "\n"
               " \\__+|+__/\n"
               "  {_/ \\_}\n";
    }

    bool launched_from_jupyter(int argc, char* argv[])
    {
        if (std::getenv("JPY_PARENT_PID") != nullptr) {
            return true;
        }
        for (int i = 0; i < argc; ++i) {
            if (std::string(argv[i]) == "-f") {
                return true;
            }
        }
        return false;
    }
}

int main(int argc, char* argv[])
{
    if (xeus::should_print_version(argc, argv))
    {
        std::clog << "xmorpho " << XEUS_MORPHO_VERSION << std::endl;
        return 0;
    }

    // Jupyter launcher / JupyterHub: std* may be closed; writing the banner
    // would SIGPIPE. Also silence clog when JPY_PARENT_PID is set.
    const bool quiet = launched_from_jupyter(argc, argv);
    if (quiet)
    {
        std::clog.setstate(std::ios_base::failbit);
    }

    // Registering SIGSEGV handler. Leave SIGINT to xeus so interrupt does not
    // exit the kernel process.
#ifdef __GNUC__
    if (!quiet)
    {
        std::clog << "registering handler for SIGSEGV" << std::endl;
    }
    signal(SIGSEGV, handler);
#endif

    std::unique_ptr<xeus::xcontext> context = xeus::make_zmq_context();

    auto interpreter = std::make_unique<xeus_morpho::interpreter>();
    auto hist = xeus::make_in_memory_history_manager();

    std::string connection_filename = xeus::extract_filename(argc, argv);

    nl::json debugger_config;

    if (!connection_filename.empty())
    {
        xeus::xconfiguration config = xeus::load_configuration(connection_filename);
        xeus::xkernel kernel(config,
                             xeus::get_user_name(),
                             std::move(context),
                             std::move(interpreter),
                             xeus::make_xserver_shell_main,
                             std::move(hist),
                             xeus::make_console_logger(xeus::xlogger::msg_type,
                                                       xeus::make_file_logger(xeus::xlogger::content, "xeus.log")),
                             xeus::make_null_debugger,
                             debugger_config);

        if (!quiet)
        {
            std::cout << morpho_banner()
                      << "\nIf you want to connect to this kernel from an other client, you can use"
                         " the "
                      << connection_filename << " file." << std::endl;
        }

        kernel.start();
    }
    else
    {
        xeus::xkernel kernel(xeus::get_user_name(),
                             std::move(context),
                             std::move(interpreter),
                             xeus::make_xserver_shell_main,
                             std::move(hist),
                             nullptr,
                             xeus::make_null_debugger,
                             debugger_config);

        if (!quiet)
        {
            std::cout << morpho_banner() << "\n"
                      << xeus::get_start_message(kernel.get_config()) << std::endl;
        }

        kernel.start();
    }

    return 0;
}

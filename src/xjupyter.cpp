/***************************************************************************
* Copyright (c) 2023, Tim Atherton
*
* Distributed under the terms of the MIT license.
*
* The full license is in the file LICENSE, distributed with this software.
****************************************************************************/

#include <string>

#include "xeus-morpho/xinterpreter.hpp"
#include "xeus-morpho/xjupyter.hpp"

extern "C" {
#include <builtin.h>
#include <strng.h>
}

namespace xeus_morpho
{
    namespace
    {
        interpreter* g_interpreter = nullptr;

        char jupyter_display_args_id[] = "JupyterDisplayArgs";
        char jupyter_display_args_msg[] =
            "JupyterDisplay expects a String (morphoview ASCII commands).";
        char jupyter_display_name[] = "JupyterDisplay";

        value JupyterDisplay(vm* v, int nargs, value* args)
        {
            if (nargs < 1 || !MORPHO_ISSTRING(MORPHO_GETARG(args, 0))) {
                morpho_runtimeerror(v, jupyter_display_args_id);
                return MORPHO_NIL;
            }

            if (!g_interpreter) {
                return MORPHO_NIL;
            }

            char* ascii = MORPHO_GETCSTRING(MORPHO_GETARG(args, 0));
            g_interpreter->display_morphoview(ascii ? std::string(ascii) : std::string());
            return MORPHO_NIL;
        }
    }

    void register_jupyter_builtins(interpreter* interp)
    {
        g_interpreter = interp;
        morpho_defineerror(jupyter_display_args_id, ERROR_HALT, jupyter_display_args_msg);
        builtin_addfunction(jupyter_display_name, JupyterDisplay, MORPHO_FN_IO);
    }

    void unregister_jupyter_builtins()
    {
        g_interpreter = nullptr;
    }
}

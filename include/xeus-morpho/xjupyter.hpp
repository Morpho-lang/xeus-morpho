/***************************************************************************
* Copyright (c) 2023, Tim Atherton
*
* Distributed under the terms of the MIT license.
*
* The full license is in the file LICENSE, distributed with this software.
****************************************************************************/

#ifndef XEUS_MORPHO_XJUPYTER_HPP
#define XEUS_MORPHO_XJUPYTER_HPP

namespace xeus_morpho
{
    class interpreter;

    /** MIME type for morphoview ASCII command IR (Show.write output). */
    inline constexpr const char* MORPHOVIEW_MIME = "application/vnd.morpho.morphoview";

    /** Register Morpho builtins that publish Jupyter display_data. */
    void register_jupyter_builtins(interpreter* interp);
}

#endif

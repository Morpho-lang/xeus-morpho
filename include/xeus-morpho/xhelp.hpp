/***************************************************************************
* Copyright (c) 2026, Tim Atherton
*
* Distributed under the terms of the MIT license.
*
* The full license is in the file LICENSE, distributed with this software.
****************************************************************************/

#ifndef XEUS_MORPHO_XHELP_HPP
#define XEUS_MORPHO_XHELP_HPP

#include <string>

namespace xeus_morpho
{
    /** Token under the cursor for help lookup ([A-Za-z0-9_.]). */
    std::string extract_help_query(const std::string& code, int cursor_pos);

    /**
     * Look up Morpho help for query.
     * On success, fills markdown (raw MD) and plain text.
     * On miss, fills both with Morpho's query hint and returns false.
     */
    bool lookup_help(const std::string& query, std::string& markdown, std::string& plain);

    /**
     * If code is a CLI-style help/? directive (leading help/? or trailing Topic?),
     * set query to the remainder (possibly empty) and return true. Otherwise false.
     */
    bool parse_help_directive(const std::string& code, std::string& query);
}

#endif

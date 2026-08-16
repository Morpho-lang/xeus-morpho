/***************************************************************************
* Copyright (c) 2026, Tim Atherton
*
* Distributed under the terms of the MIT license.
*
* The full license is in the file LICENSE, distributed with this software.
****************************************************************************/

#ifndef XEUS_MORPHO_XHELP_HPP
#define XEUS_MORPHO_XHELP_HPP

#include <cstddef>
#include <string>

namespace xeus_morpho
{
    /** Jupyter cursor_pos is Unicode code points; Morpho sources are UTF-8 bytes. */
    std::size_t utf8_codepoint_index_to_byte(const std::string& s, int cursor_pos);
    int utf8_byte_index_to_codepoint(const std::string& s, std::size_t byte_index);

    /** Token under the cursor for help lookup ([A-Za-z0-9_.]).
     *  cursor_pos is a Jupyter Unicode code-point index. */
    std::string extract_help_query(const std::string& code, int cursor_pos);

    /** Append Morpho's top-level help topic names (CLI blank-help list). */
    void append_toplevel_topics(std::string& markdown, std::string& plain);

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

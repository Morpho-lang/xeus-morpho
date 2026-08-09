/***************************************************************************
* Copyright (c) 2024, Tim Atherton                                  
*                                                                          
* Distributed under the terms of the MIT license.                 
*                                                                          
* The full license is in the file LICENSE, distributed with this software. 
****************************************************************************/

#include <cctype>
#include <set>
#include <string>
#include <vector>

#include "nlohmann/json.hpp"

extern "C"
{
    #include <morpho.h>
    #include <help.h>
    #include <strng.h>
}

namespace nl = nlohmann;

namespace xeus_morpho
{
    namespace
    {
        bool startswith(const std::string& str, const std::string& cmp)
        {
            return str.compare(0, cmp.length(), cmp) == 0;
        }

        bool startswith_ci(const std::string& str, const std::string& cmp)
        {
            if (cmp.size() > str.size()) {
                return false;
            }
            for (std::size_t i = 0; i < cmp.size(); ++i) {
                if (std::tolower(static_cast<unsigned char>(str[i]))
                    != std::tolower(static_cast<unsigned char>(cmp[i]))) {
                    return false;
                }
            }
            return true;
        }

        void append_help_topic_matches(const std::string& to_match, nl::json& matches, std::set<std::string>& seen)
        {
            varray_value topics;
            varray_valueinit(&topics);
            morpho_helptopics(&topics);

            for (unsigned int i = 0; i < topics.count; ++i) {
                if (!MORPHO_ISSTRING(topics.data[i])) {
                    continue;
                }
                const std::string name = MORPHO_GETCSTRING(topics.data[i]);
                // Topic index names are often lowercase filenames; match case-insensitively.
                if (!startswith_ci(name, to_match) || !seen.insert(name).second) {
                    continue;
                }
                matches.push_back(name);
            }

            varray_valueclear(&topics);
        }
    }
    
    int complete(program* /*p*/, const std::string& code, int cursor_pos, nl::json& matches)
    {
        // Keep in sync with morpho-cli cli_complete (cli.c words[]).
        static const std::vector<std::string> keywords = {
            "as", "and", "break", "catch", "class", "continue", "do", "else",
            "false", "fn", "for", "help", "if", "import", "in", "is", "nil",
            "or", "print", "quit", "return", "self", "super", "true", "try",
            "var", "while", "with"
        };

        // Jupyter cursor_pos is in [0, code.size()]. Scan only characters before the cursor.
        if (cursor_pos < 0) {
            cursor_pos = 0;
        }
        if (static_cast<std::size_t>(cursor_pos) > code.size()) {
            cursor_pos = static_cast<int>(code.size());
        }

        int cursor_start = cursor_pos;
        while (cursor_start > 0 && !std::isspace(static_cast<unsigned char>(code[cursor_start - 1]))) {
            --cursor_start;
        }

        if (cursor_pos > cursor_start) {
            const std::string to_match = code.substr(
                static_cast<std::size_t>(cursor_start),
                static_cast<std::size_t>(cursor_pos - cursor_start));

            std::set<std::string> seen;
            for (const auto& kw : keywords) {
                if (startswith(kw, to_match) && seen.insert(kw).second) {
                    matches.push_back(kw);
                }
            }
            append_help_topic_matches(to_match, matches, seen);
        }

        return cursor_start;
    }
}

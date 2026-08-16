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

#include "nlohmann/json.hpp"

#include "xeus-morpho/xhelp.hpp"

extern "C" {
#include <morpho.h>
#include <help.h>
#include <strng.h>
#include <lex.h>
    extern tokendefn standardtokens[];
    extern int nstandardtokens;
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

        bool is_ident_token(const char* s)
        {
            if (s == nullptr || s[0] == '\0') {
                return false;
            }
            unsigned char c = static_cast<unsigned char>(s[0]);
            return std::isalpha(c) != 0 || c == '_';
        }

        void append_keyword_matches(const std::string& to_match, nl::json& matches,
                                    std::set<std::string>& seen)
        {
            const int n = nstandardtokens;
            for (int i = 0; i < n; ++i) {
                const char* tok = standardtokens[i].string;
                if (!is_ident_token(tok)) {
                    continue;
                }
                const std::string name(tok);
                if (startswith(name, to_match) && seen.insert(name).second) {
                    matches.push_back(name);
                }
            }
        }

        void append_help_topic_matches(const std::string& to_match, nl::json& matches,
                                       std::set<std::string>& seen)
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
    
    int complete(const std::string& code, int cursor_pos, nl::json& matches)
    {
        // Jupyter cursor_pos is in Unicode code points.
        const std::size_t cursor_byte = utf8_codepoint_index_to_byte(code, cursor_pos);
        std::size_t start_byte = cursor_byte;
        while (start_byte > 0 && !std::isspace(static_cast<unsigned char>(code[start_byte - 1]))) {
            --start_byte;
        }

        if (cursor_byte > start_byte) {
            const std::string to_match = code.substr(start_byte, cursor_byte - start_byte);
            std::set<std::string> seen;
            append_keyword_matches(to_match, matches, seen);
            append_help_topic_matches(to_match, matches, seen);
        }

        return utf8_byte_index_to_codepoint(code, start_byte);
    }
}

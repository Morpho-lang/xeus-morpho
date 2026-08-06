/***************************************************************************
* Copyright (c) 2024, Tim Atherton                                  
*                                                                          
* Distributed under the terms of the MIT license.                 
*                                                                          
* The full license is in the file LICENSE, distributed with this software. 
****************************************************************************/

#include <cctype>
#include <string>
#include <vector>

#include "nlohmann/json.hpp"

extern "C"
{
    #include <morpho.h>
}

namespace nl = nlohmann;

namespace xeus_morpho
{
    inline bool startswith(const std::string& str, const std::string& cmp)
    {
        return str.compare(0, cmp.length(), cmp) == 0;
    }
    
    int complete(program* /*p*/, const std::string& code, int cursor_pos, nl::json& matches)
    {
        static const std::vector<std::string> keywords = {
            "as", "and", "break", "class", "continue", "do", "else", "for", "false",
            "fn", "help", "if", "in", "import", "nil", "or", "print", "return",
            "true", "var", "while", "quit", "self", "super", "this", "try", "catch"
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

            for (const auto& kw : keywords) {
                if (startswith(kw, to_match)) {
                    matches.push_back(kw);
                }
            }
        }

        return cursor_start;
    }
}

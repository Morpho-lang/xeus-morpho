/***************************************************************************
* Copyright (c) 2024, Tim Atherton                                  
*                                                                          
* Distributed under the terms of the MIT license.                 
*                                                                          
* The full license is in the file LICENSE, distributed with this software. 
****************************************************************************/

#include <iostream>
#include <sstream>
#include <string>
#include <array>

#include "nlohmann/json.hpp"

extern "C"
{
    #include <morpho/morpho.h>
}

namespace nl = nlohmann;

namespace xeus_morpho
{
    inline bool startswith(const std::string& str, const std::string& cmp)
    {
        return str.compare(0, cmp.length(), cmp) == 0;
    }
    
    int complete(program* /*p*/, const std::string & code, int cursor_pos, nl::json & matches)
    {
        static std::vector<std::string> keywords = {"as", "and", "break", "class", "continue", "do", "else", "for", "false", "fn", "help", "if", "in", "import", "nil", "or", "print", "return", "true", "var", "while", "quit", "self", "super", "this", "try", "catch" };
        
        // Look back finding whitespace
        int cursor_start=cursor_pos;
        for (; cursor_start >= 0; cursor_start--) {
            if (std::isspace(code[cursor_start])) {
                break;
            }
        }
        cursor_start+=1;
        
        if (cursor_pos>cursor_start) {
            const std::string to_match = code.substr(cursor_start, cursor_pos-cursor_start+1);
            
            // Match keywords
            for(auto kw : keywords) {
                if(startswith(kw, to_match)) {
                    matches.push_back(kw);
                }
            }
        }
        
        return cursor_start;
    }
}

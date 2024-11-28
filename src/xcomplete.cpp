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
    
    int complete(program* p, const std::string & code, int cursor_pos, nl::json & matches)
    {
        
    }
}

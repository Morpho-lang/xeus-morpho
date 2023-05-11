/***************************************************************************
* Copyright (c) 2023, Tim Atherton                                  
*                                                                          
* Distributed under the terms of the MIT license.                 
*                                                                          
* The full license is in the file LICENSE, distributed with this software. 
****************************************************************************/

#ifndef XEUS_MORPHO_CONFIG_HPP
#define XEUS_MORPHO_CONFIG_HPP

// Project version
#define XEUS_MORPHO_VERSION_MAJOR 0
#define XEUS_MORPHO_VERSION_MINOR 1
#define XEUS_MORPHO_VERSION_PATCH 0

// Composing the version string from major, minor and patch
#define XEUS_MORPHO_CONCATENATE(A, B) XEUS_MORPHO_CONCATENATE_IMPL(A, B)
#define XEUS_MORPHO_CONCATENATE_IMPL(A, B) A##B
#define XEUS_MORPHO_STRINGIFY(a) XEUS_MORPHO_STRINGIFY_IMPL(a)
#define XEUS_MORPHO_STRINGIFY_IMPL(a) #a

#define XEUS_MORPHO_VERSION XEUS_MORPHO_STRINGIFY(XEUS_MORPHO_CONCATENATE(XEUS_MORPHO_VERSION_MAJOR,   \
                 XEUS_MORPHO_CONCATENATE(.,XEUS_MORPHO_CONCATENATE(XEUS_MORPHO_VERSION_MINOR,   \
                                  XEUS_MORPHO_CONCATENATE(.,XEUS_MORPHO_VERSION_PATCH)))))

#ifdef _WIN32
    #ifdef XEUS_MORPHO_EXPORTS
        #define XEUS_MORPHO_API __declspec(dllexport)
    #else
        #define XEUS_MORPHO_API __declspec(dllimport)
    #endif
#else
    #define XEUS_MORPHO_API
#endif

#endif
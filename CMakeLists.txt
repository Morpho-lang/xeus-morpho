#############################################################################
#Copyright (c) 2023,                                          
#                                                                         
#Distributed under the terms of the MIT license.                 
#                                                                         
#The full license is in the file LICENSE, distributed with this software. 
#############################################################################

cmake_minimum_required(VERSION 3.16)
project(xeus-morpho)

set(XEUS_MORPHO_INCLUDE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/include)

#-------------------------------------------------------------------------------
# Include the morpho library
#-------------------------------------------------------------------------------

find_file(MORPHO_HEADER
    morpho.h
    HINTS
        $ENV{MORPHO_ROOT}/include
        $ENV{MORPHO_ROOT}/include/morpho
        $ENV{CONDA_PREFIX}/include
        $ENV{CONDA_PREFIX}/include/morpho
        ${CMAKE_INSTALL_PREFIX}/include
        ${CMAKE_INSTALL_PREFIX}/include/morpho
        /usr/local/include
        /usr/local/include/morpho
        /opt/homebrew/include
        /opt/homebrew/include/morpho
        /home/linuxbrew/.linuxbrew/include
        /home/linuxbrew/.linuxbrew/include/morpho
        "C:/Program Files/Morpho/include/morpho"
)

if (NOT MORPHO_HEADER)
    message(FATAL_ERROR
        "Could not find morpho.h. Set MORPHO_ROOT or install Morpho "
        "(e.g. under /usr/local, Homebrew, or CONDA_PREFIX).")
endif ()

message(STATUS "Found morpho.h at ${MORPHO_HEADER}")

# Directory containing morpho.h (typically .../include/morpho)
get_filename_component(MORPHO_INCLUDE ${MORPHO_HEADER} DIRECTORY)
message(STATUS "Including Morpho directory ${MORPHO_INCLUDE}")

find_library(MORPHO_LIBRARY
    NAMES morpho libmorpho
    HINTS
        $ENV{MORPHO_ROOT}/lib
        $ENV{CONDA_PREFIX}/lib
        ${CMAKE_INSTALL_PREFIX}/lib
        ${CMAKE_INSTALL_PREFIX}/lib64
        /usr/local/lib
        /opt/homebrew/lib
        /home/linuxbrew/.linuxbrew/lib
        "C:/Program Files/Morpho/lib"
)

if (NOT MORPHO_LIBRARY)
    message(FATAL_ERROR
        "Could not find libmorpho. Set MORPHO_ROOT or ensure the Morpho library "
        "is visible to CMake.")
endif ()

message(STATUS "Found Morpho library: ${MORPHO_LIBRARY}")

# Require Morpho 0.6.4+ (help/stdin APIs live in the library from that release).
set(MORPHO_BUILD_H "${MORPHO_INCLUDE}/build.h")
if (NOT EXISTS "${MORPHO_BUILD_H}")
    message(FATAL_ERROR
        "Found morpho.h but not build.h next to it (${MORPHO_BUILD_H}). "
        "xeus-morpho requires Morpho 0.6.4 or newer.")
endif ()
file(STRINGS "${MORPHO_BUILD_H}" _morpho_ver_lines
     REGEX "^#define MORPHO_VERSION_(MAJOR|MINOR|PATCH) ")
foreach (_line ${_morpho_ver_lines})
    if (_line MATCHES "#define MORPHO_VERSION_MAJOR +([0-9]+)")
        set(MORPHO_VERSION_MAJOR "${CMAKE_MATCH_1}")
    elseif (_line MATCHES "#define MORPHO_VERSION_MINOR +([0-9]+)")
        set(MORPHO_VERSION_MINOR "${CMAKE_MATCH_1}")
    elseif (_line MATCHES "#define MORPHO_VERSION_PATCH +([0-9]+)")
        set(MORPHO_VERSION_PATCH "${CMAKE_MATCH_1}")
    endif ()
endforeach ()
if (NOT DEFINED MORPHO_VERSION_MAJOR OR NOT DEFINED MORPHO_VERSION_MINOR OR NOT DEFINED MORPHO_VERSION_PATCH)
    message(FATAL_ERROR
        "Could not parse Morpho version from ${MORPHO_BUILD_H}. "
        "xeus-morpho requires Morpho 0.6.4 or newer.")
endif ()
math(EXPR MORPHO_VERSION_PACKED
    "${MORPHO_VERSION_MAJOR} * 10000 + ${MORPHO_VERSION_MINOR} * 100 + ${MORPHO_VERSION_PATCH}")
if (MORPHO_VERSION_PACKED LESS 604)
    message(FATAL_ERROR
        "Morpho ${MORPHO_VERSION_MAJOR}.${MORPHO_VERSION_MINOR}.${MORPHO_VERSION_PATCH} is too old. "
        "xeus-morpho requires Morpho 0.6.4 or newer.")
endif ()
message(STATUS "Found Morpho ${MORPHO_VERSION_MAJOR}.${MORPHO_VERSION_MINOR}.${MORPHO_VERSION_PATCH}")

#-------------------------------------------------------------------------------
# Versioning
#-------------------------------------------------------------------------------

file(STRINGS "${XEUS_MORPHO_INCLUDE_DIR}/xeus-morpho/xeus_morpho_config.hpp" version_defines
     REGEX "#define XEUS_MORPHO_VERSION_(MAJOR|MINOR|PATCH)")
foreach (ver ${version_defines})
    if (ver MATCHES "#define XEUS_MORPHO_VERSION_(MAJOR|MINOR|PATCH) +([^ ]+)$")
        set(XEUS_MORPHO_VERSION_${CMAKE_MATCH_1} "${CMAKE_MATCH_2}" CACHE INTERNAL "")
    endif ()
endforeach ()
set(${PROJECT_NAME}_VERSION
    ${XEUS_MORPHO_VERSION_MAJOR}.${XEUS_MORPHO_VERSION_MINOR}.${XEUS_MORPHO_VERSION_PATCH})
message(STATUS "Building xeus-morpho v${${PROJECT_NAME}_VERSION}")

#-------------------------------------------------------------------------------
# Configuration
#-------------------------------------------------------------------------------

include(GNUInstallDirs)

if (NOT DEFINED XEUS_MORPHO_KERNELSPEC_PATH)
    set(XEUS_MORPHO_KERNELSPEC_PATH "${CMAKE_INSTALL_PREFIX}/${CMAKE_INSTALL_BINDIR}/")
endif ()

set(XEUS_MORPHO_KERNELSPEC_BUILD_DIR
    "${CMAKE_CURRENT_BINARY_DIR}/share/jupyter/kernels/xmorpho")
file(MAKE_DIRECTORY "${XEUS_MORPHO_KERNELSPEC_BUILD_DIR}")
configure_file(
    "${CMAKE_CURRENT_SOURCE_DIR}/share/jupyter/kernels/xmorpho/kernel.json.in"
    "${XEUS_MORPHO_KERNELSPEC_BUILD_DIR}/kernel.json"
    @ONLY
)
file(COPY
    "${CMAKE_CURRENT_SOURCE_DIR}/share/jupyter/kernels/xmorpho/logo-svg.svg"
    DESTINATION "${XEUS_MORPHO_KERNELSPEC_BUILD_DIR}"
)

#-------------------------------------------------------------------------------
# Build options
#-------------------------------------------------------------------------------

option(XEUS_MORPHO_BUILD_STATIC "Build xeus-morpho static library" OFF)
option(XEUS_MORPHO_BUILD_SHARED "Split xmorpho build into executable and library" ON)
option(XEUS_MORPHO_BUILD_EXECUTABLE "Build the xmorpho executable" ON)

option(XEUS_MORPHO_USE_SHARED_XEUS "Link xmorpho with the xeus shared library (instead of the static library)" ON)
option(XEUS_MORPHO_USE_SHARED_XEUS_MORPHO "Link xmorpho with the xeus-morpho shared library (instead of the static library)" ON)

#-------------------------------------------------------------------------------
# Dependencies
#-------------------------------------------------------------------------------

set(xeus_REQUIRED_VERSION 6.0.0)
set(xeus-zmq_REQUIRED_VERSION 4.0.0)

if (NOT TARGET xeus AND NOT TARGET xeus-static)
    find_package(xeus ${xeus_REQUIRED_VERSION} REQUIRED)
endif ()

find_package(Threads REQUIRED)

#-------------------------------------------------------------------------------
# Flags
#-------------------------------------------------------------------------------

if (MSVC)
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} /wd4251 /wd4141")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} /wd4018 /wd4267 /wd4715 /wd4146 /wd4129")
endif ()



#-------------------------------------------------------------------------------
# Source files
#-------------------------------------------------------------------------------

set(XEUS_MORPHO_HEADERS
    include/xeus-morpho/xeus_morpho_config.hpp
    include/xeus-morpho/xhelp.hpp
    include/xeus-morpho/xinterpreter.hpp
    include/xeus-morpho/xjupyter.hpp
)

set(XEUS_MORPHO_SRC
    src/xinterpreter.cpp
    src/xcomplete.cpp
    src/xhelp.cpp
    src/xjupyter.cpp
)

set(XEUS_MORPHO_MAIN_SRC
    src/main.cpp
)

#-------------------------------------------------------------------------------
# Targets and link - Macros
#-------------------------------------------------------------------------------

string(TOUPPER "${CMAKE_BUILD_TYPE}" U_CMAKE_BUILD_TYPE)

get_filename_component(MORPHO_LIBDIR "${MORPHO_LIBRARY}" DIRECTORY)
set(XEUS_MORPHO_RPATH "${CMAKE_INSTALL_PREFIX}/${CMAKE_INSTALL_LIBDIR}")
if (NOT MORPHO_LIBDIR STREQUAL "${CMAKE_INSTALL_PREFIX}/${CMAKE_INSTALL_LIBDIR}"
    AND NOT MORPHO_LIBDIR STREQUAL "${CMAKE_INSTALL_PREFIX}/lib")
    list(APPEND XEUS_MORPHO_RPATH "${MORPHO_LIBDIR}")
endif ()
# Prefix first so a leftover /usr/local/lib/libxeus-morpho is not preferred over the install.
set(CMAKE_INSTALL_RPATH "${XEUS_MORPHO_RPATH}")
set(CMAKE_BUILD_RPATH "${XEUS_MORPHO_RPATH}")

macro(xeus_morpho_set_common_options target_name)
    if (MSVC)
        target_compile_options(${target_name} PUBLIC /wd4251 /wd4141)
        target_compile_options(${target_name} PUBLIC /wd4018 /wd4267 /wd4715 /wd4146 /wd4129)
    endif ()

    if (CMAKE_CXX_COMPILER_ID MATCHES "Clang" OR
        CMAKE_CXX_COMPILER_ID MATCHES "GNU" OR
        CMAKE_CXX_COMPILER_ID MATCHES "Intel")

        target_compile_options(${target_name} PUBLIC -Wunused-parameter -Wextra -Wreorder)
    endif ()

    target_compile_features(${target_name} PRIVATE cxx_std_17)

    if (APPLE)
        set_target_properties(${target_name} PROPERTIES
            MACOSX_RPATH ON
            BUILD_WITH_INSTALL_RPATH TRUE
        )
    else ()
        set_target_properties(${target_name} PROPERTIES
            BUILD_WITH_INSTALL_RPATH TRUE
            SKIP_BUILD_RPATH FALSE
        )
    endif ()

    set_target_properties(${target_name} PROPERTIES
        INSTALL_RPATH "${XEUS_MORPHO_RPATH}"
        BUILD_RPATH "${XEUS_MORPHO_RPATH}"
        INSTALL_RPATH_USE_LINK_PATH FALSE
    )
endmacro()

# Common macro kernels (xmorpho)
macro(xeus_morpho_set_kernel_options target_name)
    if (XEUS_MORPHO_USE_SHARED_XEUS_MORPHO)
        target_link_libraries(${target_name} PRIVATE xeus-morpho)
        if(CMAKE_DL_LIBS)
            target_link_libraries(${target_name} PRIVATE ${CMAKE_DL_LIBS})
        endif()
    else ()
        target_link_libraries(${target_name} PRIVATE xeus-morpho-static)
    endif()

    target_link_libraries(${target_name} PRIVATE Threads::Threads)
endmacro()

# Common macro for shared and static library
macro(xeus_morpho_create_target target_name linkage output_name)
    string(TOUPPER "${linkage}" linkage_upper)

    if (NOT ${linkage_upper} MATCHES "^(SHARED|STATIC)$")
        message(FATAL_ERROR "Invalid library linkage: ${linkage}")
    endif ()

    add_library(${target_name} ${linkage_upper} ${XEUS_MORPHO_SRC} ${XEUS_MORPHO_HEADERS})
    xeus_morpho_set_common_options(${target_name})

    set_target_properties(${target_name} PROPERTIES
                          PUBLIC_HEADER "${XEUS_MORPHO_HEADERS}"
                          PREFIX ""
                          VERSION ${${PROJECT_NAME}_VERSION}
                          SOVERSION ${XEUS_MORPHO_VERSION_MAJOR}
                          OUTPUT_NAME "lib${output_name}")

    target_compile_definitions(${target_name} PUBLIC "XEUS_MORPHO_EXPORTS")

    target_include_directories(${target_name}
                               PUBLIC
                               $<BUILD_INTERFACE:${XEUS_MORPHO_INCLUDE_DIR}>
                               ${MORPHO_INCLUDE}
                               $<INSTALL_INTERFACE:include>)

    if (XEUS_MORPHO_USE_SHARED_XEUS)
        set(XEUS_MORPHO_XEUS_TARGET xeus)
    else ()
        set(XEUS_MORPHO_XEUS_TARGET xeus-static)
    endif ()

    target_link_libraries(${target_name} PUBLIC ${XEUS_MORPHO_XEUS_TARGET} ${MORPHO_LIBRARY} Threads::Threads)
    if (WIN32 OR CYGWIN)
        #
    elseif (APPLE)
        # target_link_libraries(${target_name} PRIVATE "-undefined dynamic_lookup")
    endif ()
endmacro()

#-------------------------------------------------------------------------------
# xeus-morpho
#-------------------------------------------------------------------------------

set(XEUS_MORPHO_TARGETS "")

if (XEUS_MORPHO_BUILD_SHARED)
    # Build libraries
    xeus_morpho_create_target(xeus-morpho SHARED xeus-morpho)
    list(APPEND XEUS_MORPHO_TARGETS xeus-morpho)
endif ()

if (XEUS_MORPHO_BUILD_STATIC)
    # On Windows, a static library should use a different output name
    # to avoid the conflict with the import library of a shared one.
    if (CMAKE_HOST_WIN32)
        xeus_morpho_create_target(xeus-morpho-static STATIC xeus-morpho-static)
    else ()
        xeus_morpho_create_target(xeus-morpho-static STATIC xeus-morpho)
    endif ()
    list(APPEND XEUS_MORPHO_TARGETS xeus-morpho-static)
endif ()

#-------------------------------------------------------------------------------
# xmorpho
#-------------------------------------------------------------------------------

if (XEUS_MORPHO_BUILD_EXECUTABLE)
    find_package(xeus-zmq ${xeus-zmq_REQUIRED_VERSION} REQUIRED)
    add_executable(xmorpho ${XEUS_MORPHO_MAIN_SRC})
    xeus_morpho_set_common_options(xmorpho)
    xeus_morpho_set_kernel_options(xmorpho)
    target_link_libraries(xmorpho PRIVATE xeus-zmq)
endif()



#-------------------------------------------------------------------------------
# Installation
#-------------------------------------------------------------------------------

include(CMakePackageConfigHelpers)

set(XEUS_MORPHO_CMAKECONFIG_INSTALL_DIR "${CMAKE_INSTALL_LIBDIR}/cmake/${PROJECT_NAME}" CACHE STRING "install path for xeus-morphoConfig.cmake")

# Install xeus-morpho and xeus-morpho-static
if (XEUS_MORPHO_TARGETS)
    install(TARGETS ${XEUS_MORPHO_TARGETS}
            EXPORT ${PROJECT_NAME}-targets
            ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
            LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
            RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
            PUBLIC_HEADER DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}/xeus-morpho)

    # Makes the project importable from the build directory
    export(EXPORT ${PROJECT_NAME}-targets
           FILE "${CMAKE_CURRENT_BINARY_DIR}/${PROJECT_NAME}Targets.cmake")
endif ()

# Install xmorpho
if (XEUS_MORPHO_BUILD_EXECUTABLE)
    install(TARGETS xmorpho
            RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR})

    # Configuration and data directories for jupyter and xeus-morpho
    set(XJUPYTER_DATA_DIR "share/jupyter"    CACHE STRING "Jupyter data directory")

    # Install xmorpho Jupyter kernelspec (generated in the build tree)
    install(DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/share/jupyter/kernels
            DESTINATION ${XJUPYTER_DATA_DIR})


    # Install Morpho modules / help shipped with xeus-morpho (jupyter, etc.)
    # Discoverable when this repo is listed in ~/.morphopackages, and also
    # when installed under the Morpho share tree.
    install(DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/share/modules
            DESTINATION share/morpho
            FILES_MATCHING PATTERN "*.morpho")
    install(DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/share/help
            DESTINATION share/morpho
            FILES_MATCHING PATTERN "*.md")

    # Extra path for installing Jupyter kernelspec
    if (XEXTRA_JUPYTER_DATA_DIR)
        install(DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/share/jupyter/kernels
                DESTINATION ${XEXTRA_JUPYTER_DATA_DIR})
    endif ()
endif ()

# Configure 'xeus-morphoConfig.cmake' for a build tree
set(XEUS_MORPHO_CONFIG_CODE "")
configure_package_config_file(${PROJECT_NAME}Config.cmake.in
                              "${CMAKE_CURRENT_BINARY_DIR}/${PROJECT_NAME}Config.cmake"
                              INSTALL_DESTINATION ${PROJECT_BINARY_DIR})

# Configure 'xeus-morphoConfig.cmake.in for an install tree
set(XEUS_MORPHO_CONFIG_CODE "")
configure_package_config_file(${PROJECT_NAME}Config.cmake.in
                              "${CMAKE_CURRENT_BINARY_DIR}/CMakeFiles/${PROJECT_NAME}Config.cmake"
                              INSTALL_DESTINATION ${XEUS_MORPHO_CMAKECONFIG_INSTALL_DIR})

write_basic_package_version_file(${CMAKE_CURRENT_BINARY_DIR}/${PROJECT_NAME}ConfigVersion.cmake
                                 VERSION ${${PROJECT_NAME}_VERSION}
                                 COMPATIBILITY AnyNewerVersion)
install(FILES ${CMAKE_CURRENT_BINARY_DIR}/CMakeFiles/${PROJECT_NAME}Config.cmake
              ${CMAKE_CURRENT_BINARY_DIR}/${PROJECT_NAME}ConfigVersion.cmake
              DESTINATION ${XEUS_MORPHO_CMAKECONFIG_INSTALL_DIR})

if (XEUS_MORPHO_TARGETS)
    install(EXPORT ${PROJECT_NAME}-targets
            FILE ${PROJECT_NAME}Targets.cmake
            DESTINATION ${XEUS_MORPHO_CMAKECONFIG_INSTALL_DIR})
endif ()



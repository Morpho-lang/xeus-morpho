#############################################################################
#Copyright (c) 2023,                                          
#                                                                         
#Distributed under the terms of the MIT license.                 
#                                                                         
#The full license is in the file LICENSE, distributed with this software. 
#############################################################################

cmake_minimum_required(VERSION 3.10)
project(xeus-morpho)
set(CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake;${CMAKE_MODULE_PATH}")

set(XEUS_MORPHO_INCLUDE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/include)

set(MORPHO_INCLUDE_DIR /usr/local/include)

# Versioning
# ==========

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

# Configuration
# =============

include(GNUInstallDirs)

if (NOT DEFINED XEUS_MORPHO_KERNELSPEC_PATH)
    set(XEUS_MORPHO_KERNELSPEC_PATH "${CMAKE_INSTALL_PREFIX}/${CMAKE_INSTALL_BINDIR}/")
endif ()

configure_file (
    "${CMAKE_CURRENT_SOURCE_DIR}/share/jupyter/kernels/xmorpho/kernel.json.in"
    "${CMAKE_CURRENT_SOURCE_DIR}/share/jupyter/kernels/xmorpho/kernel.json"
)

# Build options
# =============

option(XEUS_MORPHO_BUILD_STATIC "Build xeus-morpho static library" ON)
OPTION(XEUS_MORPHO_BUILD_SHARED "Split xmorpho build into executable and library" ON)
OPTION(XEUS_MORPHO_BUILD_EXECUTABLE "Build the xmorpho executable" ON)

OPTION(XEUS_MORPHO_USE_SHARED_XEUS "Link xmorpho  with the xeus shared library (instead of the static library)" ON)
OPTION(XEUS_MORPHO_USE_SHARED_XEUS_MORPHO "Link xmorpho  with the xeus shared library (instead of the static library)" ON)





# Dependencies
# ============

set(xtl_REQUIRED_VERSION 0.7.0)
set(xeus_REQUIRED_VERSION 3.0.5)

if (NOT TARGET xtl)
    find_package(xtl ${xtl_REQUIRED_VERSION} REQUIRED)
endif ()
if (NOT TARGET xeus AND NOT TARGET xeus-static)
    find_package(xeus ${xeus_REQUIRED_VERSION} REQUIRED)
endif ()

# Flags
# =====
include(CheckCXXCompilerFlag)

if (MSVC)
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} /wd4251 /wd4141")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} /wd4018 /wd4267 /wd4715 /wd4146 /wd4129")
endif ()

if (CMAKE_CXX_COMPILER_ID MATCHES "Clang" OR CMAKE_CXX_COMPILER_ID MATCHES "GNU" OR CMAKE_CXX_COMPILER_ID MATCHES "Intel")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Wunused-parameter -Wextra -Wreorder")
    

    CHECK_CXX_COMPILER_FLAG("-std=c++17" HAS_CPP_17_FLAG)
    if (HAS_CPP_17_FLAG)
        set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -std=c++17")
    else ()
        message(FATAL_ERROR "Unsupported compiler -- xeus requires C++17 support!")
    endif ()
endif ()



# Source files
# ============

set(XEUS_MORPHO_HEADERS
    include/xeus-morpho/xeus_morpho_config.hpp
    include/xeus-morpho/xinterpreter.hpp
)

set(XEUS_MORPHO_SRC
    src/xinterpreter.cpp
    src/xcomplete.cpp
)

set(XEUS_MORPHO_MAIN_SRC
    src/main.cpp
)

# Targets and link - Macros
# =========================

include(CheckCXXCompilerFlag)

string(TOUPPER "${CMAKE_BUILD_TYPE}" U_CMAKE_BUILD_TYPE)

set(CMAKE_INSTALL_RPATH "${CMAKE_INSTALL_PREFIX}/lib; ${CMAKE_INSTALL_PREFIX}/${CMAKE_INSTALL_LIBDIR}")

macro(xeus_morpho_set_common_options target_name)
    if (MSVC)
        target_compile_options(${target_name} PUBLIC /wd4251 /wd4141)
        target_compile_options(${target_name} PUBLIC /wd4018 /wd4267 /wd4715 /wd4146 /wd4129)
    endif ()

    if (CMAKE_CXX_COMPILER_ID MATCHES "Clang" OR
        CMAKE_CXX_COMPILER_ID MATCHES "GNU" OR
        CMAKE_CXX_COMPILER_ID MATCHES "Intel")

        target_compile_options(${target_name} PUBLIC -Wunused-parameter -Wextra -Wreorder)

        # C++17 flag
        CHECK_CXX_COMPILER_FLAG("-std=c++17" HAS_CPP_17_FLAG)
        if (HAS_CPP_17_FLAG)
            target_compile_features(${target_name} PRIVATE cxx_std_17)
        else ()
            message(FATAL_ERROR "Unsupported compiler -- xeus-morpho requires C++17 support!")
        endif ()
    endif ()

    if (APPLE)
        set_target_properties(${target_name} PROPERTIES
            MACOSX_RPATH ON
        )
    else ()
        set_target_properties(${target_name} PROPERTIES
            BUILD_WITH_INSTALL_RPATH 1
            SKIP_BUILD_RPATH FALSE
        )
    endif ()

    set_target_properties(${target_name} PROPERTIES
        INSTALL_RPATH_USE_LINK_PATH TRUE
    )
endmacro()

# Common macro kernels (xmorpho)
macro(xeus_morpho_set_kernel_options target_name)
    if (XEUS_MORPHO_USE_SHARED_XEUS_MORPHO)
        target_link_libraries(${target_name} PRIVATE xeus-morpho)
        if(CMAKE_DL_LIBS)
            target_link_libraries(${target_name} PRIVATE ${CMAKE_DL_LIBS} util)
        endif()
    else ()
        target_link_libraries(${target_name} PRIVATE xeus-morpho-static)
    endif()

    find_package(Threads) 
        target_link_libraries(${target_name} PRIVATE ${CMAKE_THREAD_LIBS_INIT})
    
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

    target_compile_features(${target_name} PRIVATE cxx_std_17)

    target_include_directories(${target_name}
                               PUBLIC
                               $<BUILD_INTERFACE:${XEUS_MORPHO_INCLUDE_DIR}>
                               ${MORPHO_INCLUDE_DIR}
                               $<INSTALL_INTERFACE:include>)

    if (XEUS_MORPHO_USE_SHARED_XEUS)
        set(XEUS_MORPHO_XEUS_TARGET xeus)
    else ()
        set(XEUS_MORPHO_XEUS_TARGET xeus-static)
    endif ()

    target_link_libraries(${target_name} PUBLIC ${XEUS_MORPHO_XEUS_TARGET} xtl /usr/local/lib/libmorpho.dylib)
    if (WIN32 OR CYGWIN)
        #
    elseif (APPLE)
        # target_link_libraries(${target_name} PRIVATE "-undefined dynamic_lookup")
    endif ()
    find_package(Threads) # TODO: add Threads as a dependence of xeus-static?
        target_link_libraries(${target_name} PRIVATE ${CMAKE_THREAD_LIBS_INIT})
    
endmacro()

# xeus-morpho
# ===========

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

# xmorpho
# =======
if (XEUS_MORPHO_BUILD_EXECUTABLE)
    find_package(xeus-zmq 1.0.2 REQUIRED)
    add_executable(xmorpho ${XEUS_MORPHO_MAIN_SRC})
    target_compile_features(xmorpho PRIVATE cxx_std_17)
    xeus_morpho_set_common_options(xmorpho)
    xeus_morpho_set_kernel_options(xmorpho)
    target_link_libraries(xmorpho PRIVATE xeus-zmq)
endif()



# Installation
# ============
include(CMakePackageConfigHelpers)

set(XEUS_MORPHO_CMAKECONFIG_INSTALL_DIR "${CMAKE_INSTALL_LIBDIR}/cmake/${PROJECT_NAME}" CACHE STRING "install path for xeus-morphoConfig.cmake")

# Install xeus-morpho and xeus-morpho-static
if (XEUS_MORPHO_BUILD_SHARED)
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

    # Install xmorpho Jupyter kernelspec
    set(KERNELSPEC_DIR ${CMAKE_CURRENT_SOURCE_DIR}/share/jupyter/kernels)
    install(DIRECTORY ${KERNELSPEC_DIR}
            DESTINATION ${XJUPYTER_DATA_DIR}
            PATTERN "*.in" EXCLUDE)


    # Extra path for installing Jupyter kernelspec
    if (XEXTRA_JUPYTER_DATA_DIR)
        install(DIRECTORY ${KERNELSPEC_DIR}
                DESTINATION ${XEXTRA_JUPYTER_DATA_DIR}
                PATTERN "*.in" EXCLUDE)
    endif ()
endif ()

# Configure 'xeus-morphoConfig.cmake' for a build tree
set(XEUS_MORPHO_CONFIG_CODE "####### Expanded from \@XEUS_MORPHO_CONFIG_CODE\@ #######\n")
set(XEUS_MORPHO_CONFIG_CODE "${XEUS_MORPHO_CONFIG_CODE}set(CMAKE_MODULE_PATH \"${CMAKE_CURRENT_SOURCE_DIR}/cmake;\${CMAKE_MODULE_PATH}\")\n")
set(XEUS_MORPHO_CONFIG_CODE "${XEUS_MORPHO_CONFIG_CODE}##################################################")
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

if (XEUS_MORPHO_BUILD_SHARED)
    install(EXPORT ${PROJECT_NAME}-targets
            FILE ${PROJECT_NAME}Targets.cmake
            DESTINATION ${XEUS_MORPHO_CMAKECONFIG_INSTALL_DIR})
endif ()



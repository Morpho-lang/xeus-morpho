/***************************************************************************
* Copyright (c) 2023, Tim Atherton                                  
*                                                                          
* Distributed under the terms of the MIT license.                 
*                                                                          
* The full license is in the file LICENSE, distributed with this software. 
****************************************************************************/


#ifndef XEUS_MORPHO_INTERPRETER_HPP
#define XEUS_MORPHO_INTERPRETER_HPP

#ifdef __GNUC__
    #pragma GCC diagnostic push
    #pragma GCC diagnostic ignored "-Wattributes"
#endif

#include <string>
#include <memory>

#include "nlohmann/json.hpp"

#include "xeus_morpho_config.hpp"
#include "xeus/xinterpreter.hpp"

extern "C"
{
    #include <morpho/morpho.h>
}

namespace nl = nlohmann;

namespace xeus_morpho
{
    class XEUS_MORPHO_API interpreter : public xeus::xinterpreter
    {
    public:

        interpreter();
        virtual ~interpreter();

    protected:

        void configure_impl() override;

        nl::json execute_request_impl(int execution_counter,
                                      const std::string& code,
                                      bool silent,
                                      bool store_history,
                                      nl::json user_expressions,
                                      bool allow_stdin) override;

        nl::json complete_request_impl(const std::string& code, int cursor_pos) override;

        nl::json inspect_request_impl(const std::string& code,
                                      int cursor_pos,
                                      int detail_level) override;

        nl::json is_complete_request_impl(const std::string& code) override;

        nl::json kernel_info_request_impl() override;

        void shutdown_request_impl() override;

    private: 

        program *morpho_program;
        compiler *morpho_compiler;
        vm *morpho_vm; 

    };
}

#ifdef __GNUC__
    #pragma GCC diagnostic pop
#endif

#endif

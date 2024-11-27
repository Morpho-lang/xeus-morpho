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

    typedef void (*morphoprintfn) (vm *v, void *ref, char *str);
    typedef void (*morphowarningfn) (vm *v, void *ref, error *warning);
    typedef void (*morphodebuggerfn) (vm *v, void *ref);

    void morpho_setwarningfn(vm *v, morphowarningfn warningfn, void *ref);
    void morpho_setprintfn(vm *v, morphoprintfn printfn, void *ref);
    void morpho_setdebuggerfn(vm *v, morphodebuggerfn debuggerfn, void *ref);
}

namespace nl = nlohmann;

namespace xeus_morpho
{
    class XEUS_MORPHO_API interpreter : public xeus::xinterpreter
    {
    public:

        interpreter();
        virtual ~interpreter();
        void print(const std::string& output);

    protected:

        void configure_impl() override;
        
        void execute_request_impl(send_reply_callback cb,
                                  int execution_counter,
                                  const std::string& code,
                                  xeus::execute_request_config config,
                                  nl::json user_expressions) override;

        nl::json complete_request_impl(const std::string& code, int cursor_pos) override;

        nl::json inspect_request_impl(const std::string& code,
                                      int cursor_pos,
                                      int detail_level) override;

        nl::json is_complete_request_impl(const std::string& code) override;

        nl::json kernel_info_request_impl() override;

        void shutdown_request_impl() override;
        
        void reset();

    private: 

        program *morpho_program;
        compiler *morpho_compiler;
        vm *morpho_vm; 

        std::string buffer;
    };
}

#ifdef __GNUC__
    #pragma GCC diagnostic pop
#endif

#endif

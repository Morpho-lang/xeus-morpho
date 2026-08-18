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
    #include <morpho.h>
}

namespace nl = nlohmann;

namespace xeus_morpho
{
    class XEUS_MORPHO_API interpreter : public xeus::xinterpreter
    {
    public:

        interpreter();
        virtual ~interpreter();

        interpreter(const interpreter&) = delete;
        interpreter& operator=(const interpreter&) = delete;
        interpreter(interpreter&&) = delete;
        interpreter& operator=(interpreter&&) = delete;

        void print(const std::string& output);
        void warn(const std::string& message);
        /** Publish morphoview ASCII IR as Jupyter display_data. */
        void display_morphoview(const std::string& ascii);
        /** Jupyter stdin for Morpho System.readline (no Morpho types in this API). */
        void read_stdin_line(std::string& line);

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

        nl::json shutdown_request_impl(bool restart) override;

        nl::json interrupt_request_impl() override;
        
        void reset();

    private: 

        program *morpho_program;
        compiler *morpho_compiler;
        vm *morpho_vm; 

        std::string buffer;
        /** When false, print() only buffers (used while collecting stack traces). */
        bool stream_prints = true;
        bool m_silent = false;
        bool m_allow_stdin = true;
    };
}

#ifdef __GNUC__
    #pragma GCC diagnostic pop
#endif

#endif

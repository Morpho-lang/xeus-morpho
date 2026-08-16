/***************************************************************************
* Copyright (c) 2023, Tim Atherton                                  
*                                                                          
* Distributed under the terms of the MIT license.                 
*                                                                          
* The full license is in the file LICENSE, distributed with this software. 
****************************************************************************/

#include <string>
#include <vector>
#include <iostream>
#include <sstream>

#include "nlohmann/json.hpp"

#include "xeus/xhelper.hpp"
#include "xeus/xinput.hpp"
#include "xeus/xinterpreter.hpp"

#include "xeus-morpho/xhelp.hpp"
#include "xeus-morpho/xinterpreter.hpp"
#include "xeus-morpho/xjupyter.hpp"

namespace nl = nlohmann;

namespace xeus_morpho
{

    extern "C" void xeus_morphoprintfn (vm* /*v */,
                                        void* ref,
                                        char* str) {
        interpreter *thisinterpreter = (interpreter *) ref;
        thisinterpreter->print(std::string(str));
    }

    extern "C" void xeus_morphowarningfn (vm* /*v */, void* ref, error* warning) {
        interpreter *thisinterpreter = (interpreter *) ref;
        
        thisinterpreter->publish_stream("stderr", "Warning '" + std::string(warning->id) + "': " + std::string(warning->msg));
    }

    extern "C" void xeus_morphoinputfn(vm* /*v*/, void* ref, morphoinputmode mode, varray_char* str)
    {
        // System.readline only requests LINE mode; KEYPRESS is unused by libmorpho.
        if (mode != MORPHO_INPUT_LINE || str == nullptr) {
            return;
        }
        static_cast<interpreter*>(ref)->fill_input(str);
    }

    // implemented in xcomplete.cpp
    int complete(program *p, const std::string& code, int cursor_pos, nl::json& matches);
 
    interpreter::interpreter()
    {
        morpho_initialize();
        morpho_program = morpho_newprogram();
        morpho_compiler = morpho_newcompiler(morpho_program);

        morpho_vm = morpho_newvm();
        morpho_setprintfn(morpho_vm, xeus_morphoprintfn, this);
        morpho_setwarningfn(morpho_vm, xeus_morphowarningfn, this);
        morpho_setinputfn(morpho_vm, xeus_morphoinputfn, this);

        register_jupyter_builtins(this);

        xeus::register_interpreter(this);
        
        buffer = "";
    }

    interpreter::~interpreter()
    {
        // Match Morpho CLI teardown order: VM, then program, then compiler.
        morpho_freevm(morpho_vm);
        morpho_freeprogram(morpho_program);
        morpho_freecompiler(morpho_compiler);

        morpho_finalize();
    }

    void interpreter::reset()
    {
        buffer.clear();
    }

    void interpreter::print(const std::string& output)
    {
        // Stream live so long runs (e.g. optimizers) show progress during the cell.
        // Keep a copy for stack traces; do not also publish as execute_result.
        buffer += output;
        if (stream_prints && !output.empty()) {
            publish_stream("stdout", output);
        }
    }

    void interpreter::display_morphoview(const std::string& ascii)
    {
        nl::json data;
        data[MORPHOVIEW_MIME] = ascii;
        data["text/plain"] = "[morphoview graphics]";
        // xeus 5: display_data (was publish_display_data in older xeus)
        display_data(std::move(data), nl::json::object(), nl::json::object());
    }

    void interpreter::fill_input(varray_char* str)
    {
        // Prints are already streamed live; just wait for stdin.
        std::string line = xeus::blocking_input_request("", /*password=*/false);
        while (!line.empty() && (line.back() == '\n' || line.back() == '\r')) {
            line.pop_back();
        }
        if (!line.empty()) {
            varray_charadd(str, &line[0], static_cast<int>(line.size()));
        }
    }

    void interpreter::execute_request_impl(send_reply_callback cb,
                                           int execution_count,
                                           const std::string& code,
                                           xeus::execute_request_config /*config*/,
                                           nl::json /*user_expressions*/)
    {
        nl::json kernel_res;

        kernel_res["payload"] = nl::json::array();
        kernel_res["user_expressions"] = nl::json::object();
        kernel_res["status"] = "ok";

        // CLI-style help / ? — publish markdown in-place, do not compile.
        std::string help_query;
        if (parse_help_directive(code, help_query)) {
            nl::json pub_data;
            if (help_query.empty()) {
                pub_data["text/plain"] = "Usage: help <topic> or ? <topic>";
            } else {
                std::string markdown;
                std::string plain;
                lookup_help(help_query, markdown, plain);
                if (!markdown.empty()) {
                    pub_data["text/markdown"] = markdown;
                }
                pub_data["text/plain"] = plain.empty() ? markdown : plain;
            }
            publish_execution_result(execution_count, std::move(pub_data), nl::json::object());
            cb(kernel_res);
            return;
        }
        
        error err; // Error structure that received messages from the compiler and VM
        error_init(&err);

        // Compile code 
        bool success=morpho_compile((char *) code.c_str(), morpho_compiler, false, &err);
        
        if (success) {
            reset();
            
            success=morpho_run(morpho_vm, morpho_program);

            // Now process the output 
            if (success) {
                // Print output was already streamed to stdout during the run.
                kernel_res["status"] = "ok";
                kernel_res["user_expressions"] = nl::json::object();
            } else {
                err=*morpho_geterror(morpho_vm);

                std::string id(err.id); // Extract the error id and message
                std::string msg(err.msg);

                reset();
                stream_prints = false;
                morpho_stacktrace(morpho_vm);
                stream_prints = true;
                
                // Convert stacktrace into string vector
                std::vector<std::string> stacktrace({"Error '" + id + "': " + msg});
                std::istringstream iss(buffer);
                std::string line;

                while (std::getline(iss, line)) { // Split the output of morpho_stacktrace
                    stacktrace.push_back(line);
                }
                
                kernel_res["status"] = "error";
                kernel_res["ename"] = id;
                kernel_res["evalue"] = msg;
                kernel_res["traceback"] = stacktrace;
                
                publish_execution_error(id, msg, stacktrace);
            }
        } else {
            std::string id(err.id);
            std::string msg(err.msg);

            std::vector<std::string> stacktrace({"Compilation error '" + id + "': " + msg});

            kernel_res["status"] = "error";
            kernel_res["ename"] = id;
            kernel_res["evalue"] = msg;
            kernel_res["traceback"] = stacktrace;

            publish_execution_error(id, msg, stacktrace);
        }
        
        cb(kernel_res);
    }

    void interpreter::configure_impl()
    {
    }

    nl::json interpreter::is_complete_request_impl(const std::string& code)
    {
        // Same idea as morpho-cli cli_multiline: keep collecting while
        // brackets are unbalanced; help/? always finishes immediately.
        std::string help_query;
        if (parse_help_directive(code, help_query)) {
            return xeus::create_is_complete_reply("complete");
        }

        int balance = 0;
        for (unsigned char c : code) {
            switch (c) {
                case '(':
                case '{':
                case '[':
                    ++balance;
                    break;
                case ')':
                case '}':
                case ']':
                    --balance;
                    break;
                default:
                    break;
            }
        }

        if (balance > 0) {
            return xeus::create_is_complete_reply("incomplete", "  ");
        }
        return xeus::create_is_complete_reply("complete");
    }

    nl::json interpreter::complete_request_impl(const std::string&  code,
                                                     int cursor_pos)
    {
        nl::json matches = nl::json::array();

        int cursor_start = complete(morpho_program, code, cursor_pos, matches);
        
        nl::json result;
        result["status"] = "ok";
        result["matches"] = matches;
        result["cursor_start"] = cursor_start;
        result["metadata"] = nl::json::object();
        result["cursor_end"] = cursor_pos;

        return result;
    }

    nl::json interpreter::inspect_request_impl(const std::string& code,
                                                      int cursor_pos,
                                                      int /*detail_level*/)
    {
        const std::string query = extract_help_query(code, cursor_pos);
        if (query.empty()) {
            return xeus::create_inspect_reply(false);
        }

        std::string markdown;
        std::string plain;
        if (!lookup_help(query, markdown, plain)) {
            return xeus::create_inspect_reply(false);
        }

        nl::json data;
        data["text/markdown"] = markdown;
        data["text/plain"] = plain.empty() ? markdown : plain;
        return xeus::create_inspect_reply(true, data, nl::json::object());
    }

    void interpreter::shutdown_request_impl() {
        std::cout << "Bye!!" << std::endl;
    }

    nl::json interpreter::kernel_info_request_impl()
    {
        nl::json result;
        result["implementation"] = "xmorpho";
        result["implementation_version"] = XEUS_MORPHO_VERSION;
        result["banner"] = "xmorpho";
        result["language_info"]["name"] = "morpho";
        result["language_info"]["version"] = MORPHO_VERSIONSTRING;
        result["language_info"]["mimetype"] = "text/x-morpho";
        result["language_info"]["file_extension"] = ".morpho";
        result["language_info"]["codemirror_mode"] = "morpho";
        result["language_info"]["pygments_lexer"] = "text";
        result["status"] = "ok";
        return result;
    }

}

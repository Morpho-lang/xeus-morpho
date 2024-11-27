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

#include <unistd.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>

#include "nlohmann/json.hpp"

#include "xeus/xinput.hpp"
#include "xeus/xinterpreter.hpp"
#include "xeus/xhelper.hpp"

#include "xeus-morpho/xinterpreter.hpp"

namespace nl = nlohmann;

namespace xeus_morpho
{

    extern "C" void xeus_morphoprintfn (vm* /*v */,
                                        void* ref,
                                        char* str) {
        interpreter *thisinterpreter = (interpreter *) ref;
        thisinterpreter->print(std::string(str));
    }

    extern "C" void xeus_morphowarningfn (vm* v, void *ref, error *warning) {

    }

    extern "C" void xeus_morphodebuggerfn (vm *v, void *ref, char *str) {

    }
 
    interpreter::interpreter()
    {
        morpho_initialize();
        morpho_program = morpho_newprogram();
        morpho_compiler = morpho_newcompiler(morpho_program);

        morpho_vm = morpho_newvm();
        morpho_setprintfn(morpho_vm, xeus_morphoprintfn, this);
        morpho_setwarningfn(morpho_vm, xeus_morphowarningfn, this);

        xeus::register_interpreter(this);
        
        buffer = "";
    }

    interpreter::~interpreter()
    {
        morpho_freeprogram(morpho_program);
        morpho_freecompiler(morpho_compiler);
        morpho_freevm(morpho_vm);

        morpho_finalize();
    }

    void interpreter::reset()
    {
        buffer.clear();
    }

    void interpreter::print(const std::string& output)
    {
        buffer += output;
    }

    void interpreter::execute_request_impl(send_reply_callback cb,
                                               int execution_count,
                                               const std::string& code,
                                               xeus::execute_request_config config,
                                               nl::json user_expressions)
    {
        nl::json kernel_res;

        kernel_res["payload"] = nl::json::array();
        kernel_res["user_expressions"] = nl::json::object();
        kernel_res["status"] = "ok";
        
        error err; // Error structure that received messages from the compiler and VM
        error_init(&err);

        // Compile code 
        bool success=morpho_compile((char *) code.c_str(), morpho_compiler, false, &err);
        
        if (success) {
            reset();
            
            success=morpho_run(morpho_vm, morpho_program);

            // Now process the output 
            if (success) {
                nl::json pub_data;
                pub_data["text/plain"] = buffer;

                publish_execution_result(execution_count, std::move(pub_data), nl::json::object());
                
                kernel_res["status"] = "ok";
                kernel_res["user_expressions"] = nl::json::object();
            } else {
                err=*morpho_geterror(morpho_vm);

                std::string id(err.id);
                std::string msg(err.msg);

                /*publish_execution_error(id, msg, {
                    "<traceback>",
                    "<traceback>"
                });*/
                
                kernel_res["status"] = "error";
                kernel_res["ename"] = "load file error";
                kernel_res["evalue"] = id + "' : " + msg;
                kernel_res["traceback"] = { id + "' : " + msg };
            }
        } else {
            std::string id(err.id);
            std::string msg(err.msg);

            publish_stream("stderr", "Compilation error '" + id + "' : " + msg);
        }
        cb(kernel_res);
    }

    void interpreter::configure_impl()
    {
        // `configure_impl` allows you to perform some operations
        // after the custom_interpreter creation and before executing any request.
        // This is optional, but can be useful;
        // you can for example initialize an engine here or redirect output.
    }

    nl::json interpreter::is_complete_request_impl(const std::string& code)
    {
        // Insert code here to validate the ``code``
        // and use `create_is_complete_reply` with the corresponding status
        // "unknown", "incomplete", "invalid", "complete"
        return xeus::create_is_complete_reply("complete"/*status*/, "   "/*indent*/);
    }

    nl::json interpreter::complete_request_impl(const std::string&  code,
                                                     int cursor_pos)
    {
        // Should be replaced with code performing the completion
        // and use the returned `matches` to `create_complete_reply`
        // i.e if the code starts with 'H', it could be the following completion
        if (code[0] == 'H')
        {
       
            return xeus::create_complete_reply(
                {
                    std::string("Hello"), 
                    std::string("Hey"), 
                    std::string("Howdy")
                },          /*matches*/
                5,          /*cursor_start*/
                cursor_pos  /*cursor_end*/
            );
        }

        // No completion result
        else
        {

            return xeus::create_complete_reply(
                nl::json::array(),  /*matches*/
                cursor_pos,         /*cursor_start*/
                cursor_pos          /*cursor_end*/
            );
        }
    }

    nl::json interpreter::inspect_request_impl(const std::string& /*code*/,
                                                      int /*cursor_pos*/,
                                                      int /*detail_level*/)
    {
        
        return xeus::create_inspect_reply(true/*found*/, 
            {{std::string("text/plain"), std::string("hello!")}}, /*data*/
            {{std::string("text/plain"), std::string("hello!")}}  /*meta-data*/
        );
         
    }

    void interpreter::shutdown_request_impl() {
        std::cout << "Bye!!" << std::endl;
    }

    nl::json interpreter::kernel_info_request_impl()
    {

        const std::string  protocol_version = "5.3";
        const std::string  implementation = "xmorpho";
        const std::string  implementation_version = XEUS_MORPHO_VERSION;
        const std::string  language_name = "morpho";
        const std::string  language_version = MORPHO_VERSIONSTRING;
        const std::string  language_mimetype = "text/x-morpho";;
        const std::string  language_file_extension = "morpho";;
        const std::string  language_pygments_lexer = "";
        const std::string  language_codemirror_mode = "";
        const std::string  language_nbconvert_exporter = "";
        const std::string  banner = "xmorpho";
        const bool         debugger = false;
        
        const nl::json     help_links = nl::json::array();


        return xeus::create_info_reply(
            protocol_version,
            implementation,
            implementation_version,
            language_name,
            language_version,
            language_mimetype,
            language_file_extension,
            language_pygments_lexer,
            language_codemirror_mode,
            language_nbconvert_exporter,
            banner,
            debugger,
            help_links
        );
    }

}

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

    extern "C" void xeus_morphowarningfn (vm* /*v */, void* /*ref*/, error* /*warning */) {

    }

    extern "C" void xeus_morphodebuggerfn (vm* /*v*/, void* /*ref*/, char* /*str */) {

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
                                           xeus::execute_request_config /*config*/,
                                           nl::json /*user_expressions*/)
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

                std::string id(err.id); // Extract the error id and message
                std::string msg(err.msg);

                reset();
                morpho_stacktrace(morpho_vm);
                
                // Convert stacktrace into string vector
                std::vector<std::string> stacktrace({"Error [" + id + "]: " + msg});
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
            
            kernel_res["status"] = "error";
            kernel_res["ename"] = id;
            kernel_res["evalue"] = msg;
            
            std::vector<std::string> stacktrace({"Compilation error [" + id + "]: " + msg});
            
            publish_execution_error(id, msg, stacktrace);
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

    nl::json interpreter::is_complete_request_impl(const std::string& /*code*/)
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
        nl::json result;
        result["implementation"] = "xmorpho";
        result["implementation_version"] = XEUS_MORPHO_VERSION;
        result["banner"] = "xmorpho";
        result["language_info"]["name"] = "morpho";
        result["language_info"]["version"] = MORPHO_VERSIONSTRING;
        result["language_info"]["mimetype"] = "text/x-morpho";
        result["language_info"]["file_extension"] = "morpho";
        result["status"] = "ok";
        return result;
    }

}

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
 
    interpreter::interpreter()
    {
        morpho_initialize();
        morpho_program = morpho_newprogram();
        morpho_compiler = morpho_newcompiler(morpho_program);

        morpho_vm = morpho_newvm();

        xeus::register_interpreter(this);
    }

    interpreter::~interpreter()
    {
        morpho_freeprogram(morpho_program);
        morpho_freecompiler(morpho_compiler);
        morpho_freevm(morpho_vm);

        morpho_finalize();
    }

    nl::json interpreter::execute_request_impl(int execution_counter, // Typically the cell number
                                                      const  std::string & code, // Code to execute
                                                      bool /*silent*/,
                                                      bool /*store_history*/,
                                                      nl::json /*user_expressions*/,
                                                      bool /*allow_stdin*/)
    {
        error err; // Error structure that received messages from the compiler and VM 
        error_init(&err);

        // Compile code 
        bool success=morpho_compile((char *) code.c_str(), morpho_compiler, false, &err);
        
        if (success) {
            // TODO: MUST REPLACE ALL THIS! 
            // Save the original stdout file descriptor
            int saved_stdout = dup(1);

            int fd=open("./xmorpho.txt", O_WRONLY | O_CREAT, S_IRUSR | S_IWUSR); 
            dup2(fd, 1);

            success=morpho_run(morpho_vm, morpho_program);

            // Restore the original stdout
            dup2(saved_stdout, 1);
            close(saved_stdout);


            char output_string[2048] = ""; 
            // Rewind the temporary file to the beginning
            FILE *temp_file = fopen("./xmorpho.txt", "r");
            // Read the contents of the temporary file into a string
            if (temp_file) {
                size_t length = fread(output_string, 1, sizeof(output_string) - 1, temp_file);
                output_string[length] = '\0';
                fclose(temp_file);
            }

            system("rm ./xmorpho.txt");

            //fprintf(stderr, "Captured '%s'\n", output_string);

            // Now process the output 
            if (success) {
                std::string output(output_string);
                nl::json pub_data;
                pub_data["text/plain"] = output;

                //pub_data["text/markdown"] = "# Header 1\n## Header 2\n This is markdown, including _formatting_.\n";
                /*pub_data["text/html"] = "<canvas id=\"myCanvas\" width=\"200\" height=\"100\" style=\"border:1px solid #000000;\">"
                "</canvas>"
                "<script>"
                "var c = document.getElementById(\"myCanvas\");"
                "var ctx = c.getContext(\"2d\");"
                "ctx.beginPath();"
                "ctx.arc(95, 50, 40, 0, 2 * Math.PI);"
                "ctx.stroke();"
                "</script>";*/

                publish_execution_result(execution_counter, std::move(pub_data), nl::json::object());
            } else {
                err=*morpho_geterror(morpho_vm);

                std::string id(err.id);
                std::string msg(err.msg);

                publish_stream("stderr", "Runtime error '" + id + "' : " + msg);
            }
        } else {
            std::string id(err.id);
            std::string msg(err.msg);

            publish_stream("stderr", "Compilation error '" + id + "' : " + msg);
        }

        // Use this method for publishing the execution result to the client,
        // this method takes the ``execution_counter`` as first argument,
        // the data to publish (mime type data) as second argument and metadata
        // as third argument.
        // Replace "Hello World !!" by what you want to be displayed under the execution cell
        //nl::json pub_data;
        //pub_data["text/plain"] = "Reply";

        // If silent is set to true, do not publish anything!
        // Otherwise:
        // Publish the execution result
        //publish_execution_result(execution_counter, std::move(pub_data), nl::json::object());

        // You can also use this method for publishing errors to the client, if the code
        // failed to execute
        // publish_execution_error(error_name, error_value, error_traceback);
        // publish_execution_error("TypeError", "123", {"!@#$", "*(*"});

        // Use publish_stream to publish a stream message or error:
        //publish_stream("stdout", "I am publishing a message");
        //publish_stream("stderr", "Error!");

        // Use Helpers that create replies to the server to be returned
        return xeus::create_successful_reply(/*payload, user_expressions*/);
        // Or in case of error:
        //return xeus::create_error_reply(evalue, ename, trace_back);
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
        const std::string  language_version = "0.5.7";
        const std::string  language_version = "0.6.0";
        const std::string  language_mimetype = "text/x-morpho";;
        const std::string  language_file_extension = "morpho";;
        const std::string  language_pygments_lexer = "";
        const std::string  language_codemirror_mode = "";
        const std::string  language_nbconvert_exporter = "";
        const std::string  banner = "xmorpho";const bool         debugger = false;
        
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

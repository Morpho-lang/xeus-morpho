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
#include "xeus/xmessage.hpp"

#include "xeus-morpho/xhelp.hpp"
#include "xeus-morpho/xinterpreter.hpp"
#include "xeus-morpho/xjupyter.hpp"
#include "xeus-morpho/xeus_morpho_config.hpp"
#include "morpho_compat.hpp"

namespace nl = nlohmann;

namespace xeus_morpho
{

    extern "C" void xeus_morphoprintfn(vm* /*v */, void* ref, char* str)
    {
        if (ref == nullptr || str == nullptr) {
            return;
        }
        static_cast<interpreter*>(ref)->print(str);
    }

    extern "C" void xeus_morphowarningfn(vm* /*v */, void* ref, error* warning)
    {
        if (ref == nullptr || warning == nullptr) {
            return;
        }
        const char* id = warning->id != nullptr ? warning->id : "";
        static_cast<interpreter*>(ref)->warn(
            "Warning '" + std::string(id) + "': " + std::string(warning->msg));
    }

    extern "C" void xeus_morphoinputfn(vm* /*v*/, void* ref, morphoinputmode mode, varray_char* str)
    {
        // System.readline only requests LINE mode; KEYPRESS is unused by libmorpho.
        if (ref == nullptr || mode != MORPHO_INPUT_LINE || str == nullptr) {
            return;
        }
        std::string line;
        static_cast<interpreter*>(ref)->read_stdin_line(line);
        if (!line.empty()) {
            varray_charadd(str, &line[0], static_cast<int>(line.size()));
        }
    }

    int complete(const std::string& code, int cursor_pos, nl::json& matches);

    namespace
    {
        std::string format_error_location(const error& err)
        {
            if (err.line == ERROR_POSNUNIDENTIFIABLE || err.posn == ERROR_POSNUNIDENTIFIABLE) {
                return {};
            }
            std::ostringstream oss;
            oss << "[line " << err.line << " char " << (err.posn + 1);
            if (err.file != nullptr) {
                oss << " in module '" << err.file << "'";
            }
            oss << "]";
            return oss.str();
        }

        std::string format_error_line(const error& err, bool compile)
        {
            const char* id = err.id != nullptr ? err.id : "";
            std::ostringstream oss;
            if (compile) {
                oss << "Compilation error '" << id << "'";
                const std::string loc = format_error_location(err);
                if (!loc.empty()) {
                    oss << " " << loc;
                }
            } else {
                oss << "Error '" << id << "'";
            }
            oss << ": " << err.msg;
            return oss.str();
        }
    }

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
        unregister_jupyter_builtins();
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
        if (!stream_prints) {
            buffer += output;
            return;
        }
        if (!m_silent && !output.empty()) {
            publish_stream("stdout", output);
        }
    }

    void interpreter::warn(const std::string& message)
    {
        if (!m_silent && !message.empty()) {
            publish_stream("stderr", message);
        }
    }

    void interpreter::display_morphoview(const std::string& ascii)
    {
        if (m_silent) {
            return;
        }
        nl::json data;
        data[MORPHOVIEW_MIME] = ascii;
        data["text/plain"] = "[morphoview graphics]";
        display_data(std::move(data), nl::json::object(), nl::json::object());
    }

    void interpreter::read_stdin_line(std::string& line)
    {
        line.clear();
        if (!m_allow_stdin) {
            return;
        }
        line = xeus::blocking_input_request("", /*password=*/false);
        while (!line.empty() && (line.back() == '\n' || line.back() == '\r')) {
            line.pop_back();
        }
    }

    void interpreter::execute_request_impl(send_reply_callback cb,
                                           int execution_count,
                                           const std::string& code,
                                           xeus::execute_request_config config,
                                           nl::json /*user_expressions*/)
    {
        m_silent = config.silent;
        m_allow_stdin = config.allow_stdin;

        std::string help_query;
        if (parse_help_directive(code, help_query)) {
            std::string markdown;
            std::string plain;
            const std::string topic = help_query.empty() ? std::string("help") : help_query;
            lookup_help(topic, markdown, plain);
            if (help_query.empty()) {
                append_toplevel_topics(markdown, plain);
            }
            if (!m_silent) {
                nl::json pub_data;
                if (!markdown.empty()) {
                    pub_data["text/markdown"] = markdown;
                }
                pub_data["text/plain"] = plain.empty() ? markdown : plain;
                publish_execution_result(execution_count, std::move(pub_data), nl::json::object());
            }
            cb(xeus::create_successful_reply());
            return;
        }

        error err;
        error_init(&err);

        bool success = morpho_compile(const_cast<char*>(code.c_str()), morpho_compiler, false, &err);

        if (success) {
            reset();

            success = morpho_run(morpho_vm, morpho_program);

            if (success) {
                cb(xeus::create_successful_reply());
            } else {
                err = *morpho_geterror(morpho_vm);

                const std::string id = err.id != nullptr ? err.id : "";
                const std::string msg = err.msg;

                reset();
                stream_prints = false;
                morpho_stacktrace(morpho_vm);
                stream_prints = true;

                std::vector<std::string> stacktrace({format_error_line(err, false)});
                std::istringstream iss(buffer);
                std::string line;
                while (std::getline(iss, line)) {
                    stacktrace.push_back(line);
                }

                if (!m_silent) {
                    publish_execution_error(id, msg, stacktrace);
                }
                cb(xeus::create_error_reply(id, msg, stacktrace));
            }
        } else {
            const std::string id = err.id != nullptr ? err.id : "";
            const std::string msg = err.msg;
            std::vector<std::string> stacktrace({format_error_line(err, true)});

            if (!m_silent) {
                publish_execution_error(id, msg, stacktrace);
            }
            cb(xeus::create_error_reply(id, msg, stacktrace));
        }
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

    nl::json interpreter::complete_request_impl(const std::string& code, int cursor_pos)
    {
        nl::json matches = nl::json::array();
        int cursor_start = complete(code, cursor_pos, matches);
        return xeus::create_complete_reply(matches, cursor_start, cursor_pos);
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
        const bool found = lookup_help(query, markdown, plain);
        if (!found && markdown.empty() && plain.empty()) {
            return xeus::create_inspect_reply(false);
        }

        nl::json data;
        if (!markdown.empty()) {
            data["text/markdown"] = markdown;
        }
        data["text/plain"] = plain.empty() ? markdown : plain;
        return xeus::create_inspect_reply(true, data, nl::json::object());
    }

    void interpreter::shutdown_request_impl()
    {
    }

    nl::json interpreter::kernel_info_request_impl()
    {
        return xeus::create_info_reply(
            xeus::get_protocol_version(),
            "xmorpho",
            XEUS_MORPHO_VERSION,
            "morpho",
            MORPHO_VERSIONSTRING,
            "text/x-morpho",
            ".morpho",
            "text",
            "morpho",
            "",
            "xmorpho",
            false,
            nl::json::array());
    }

}

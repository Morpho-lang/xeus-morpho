/***************************************************************************
* Copyright (c) 2026, Tim Atherton
*
* Distributed under the terms of the MIT license.
*
* The full license is in the file LICENSE, distributed with this software.
****************************************************************************/

#include <algorithm>
#include <cctype>
#include <string>
#include <vector>

#include "xeus-morpho/xhelp.hpp"

extern "C"
{
    #include <morpho.h>
    #include <help.h>
    #include <strng.h>
}

namespace xeus_morpho
{
    namespace
    {
        bool is_help_ident_char(unsigned char c)
        {
            return std::isalnum(c) != 0 || c == '_' || c == '.';
        }

        std::string trim_ascii(const std::string& s)
        {
            std::size_t begin = 0;
            while (begin < s.size() && std::isspace(static_cast<unsigned char>(s[begin]))) {
                ++begin;
            }
            std::size_t end = s.size();
            while (end > begin && std::isspace(static_cast<unsigned char>(s[end - 1]))) {
                --end;
            }
            return s.substr(begin, end - begin);
        }

        std::string varray_to_string(const varray_char& buf)
        {
            if (buf.data == nullptr || buf.count == 0) {
                return {};
            }
            std::size_t n = buf.count;
            if (buf.data[n - 1] == '\0') {
                --n;
            }
            return std::string(buf.data, n);
        }

        std::string span_to_string(const char* src, size_t src_len, md_span span)
        {
            if (src == nullptr || span.start >= src_len) {
                return {};
            }
            size_t len = span.length;
            if (span.start + len > src_len) {
                len = src_len - span.start;
            }
            return std::string(src + span.start, len);
        }

        std::vector<std::string> collect_subtopic_names(const help_topic& topic)
        {
            varray_value subs;
            varray_valueinit(&subs);
            morpho_helpsubtopics(&topic, &subs);

            std::vector<std::string> names;
            names.reserve(subs.count);
            for (unsigned int i = 0; i < subs.count; ++i) {
                if (MORPHO_ISSTRING(subs.data[i])) {
                    names.emplace_back(MORPHO_GETCSTRING(subs.data[i]));
                }
            }
            varray_valueclear(&subs);
            std::sort(names.begin(), names.end());
            return names;
        }

        void append_subtopics_markdown(const help_topic& topic, std::string& out)
        {
            const std::vector<std::string> names = collect_subtopic_names(topic);
            if (names.empty()) {
                return;
            }

            // Multi-column table, similar density to the CLI topic list.
            constexpr std::size_t ncols = 3;
            const std::size_t cols = names.size() < ncols ? names.size() : ncols;

            out += "\n**Subtopics:**\n\n|";
            for (std::size_t c = 0; c < cols; ++c) {
                out += " |";
            }
            out += "\n|";
            for (std::size_t c = 0; c < cols; ++c) {
                out += "---|" ;
            }
            out += '\n';

            for (std::size_t i = 0; i < names.size(); i += cols) {
                out += '|';
                for (std::size_t c = 0; c < cols; ++c) {
                    out += ' ';
                    if (i + c < names.size()) {
                        out += names[i + c];
                    }
                    out += " |";
                }
                out += '\n';
            }
        }

        void append_subtopics_plain(const help_topic& topic, std::string& out)
        {
            const std::vector<std::string> names = collect_subtopic_names(topic);
            if (names.empty()) {
                return;
            }

            if (!out.empty() && out.back() != '\n') {
                out += '\n';
            }

            constexpr std::size_t ncols = 3;
            const std::size_t cols = names.size() < ncols ? names.size() : ncols;

            out += "\nSubtopics:\n";
            for (std::size_t i = 0; i < names.size(); i += cols) {
                for (std::size_t c = 0; c < cols && i + c < names.size(); ++c) {
                    if (c > 0) {
                        out += "  ";
                    }
                    out += names[i + c];
                }
                out += '\n';
            }
        }

        /**
         * Render a resolved topic as markdown for Jupyter.
         * Expands MD_SHOW_SUBTOPICS (unlike morpho_helpasmd raw dump) and
         * omits link-definition blocks (tags / the showsubtopics directive itself).
         */
        bool topic_to_markdown(const help_topic& topic, std::string& out)
        {
            if (topic.file == nullptr || topic.file->source == nullptr || topic.nblocks == 0) {
                return false;
            }

            const char* src = topic.file->source;
            const size_t src_len = topic.file->sourcelen;
            out.clear();

            for (unsigned int i = 0; i < topic.nblocks; ++i) {
                const md_block* b = &topic.content_blocks[i];
                switch (b->type) {
                    case MD_BLOCK_LINK_DEF:
                        break;
                    case MD_SHOW_SUBTOPICS:
                        append_subtopics_markdown(topic, out);
                        break;
                    default: {
                        std::string chunk = span_to_string(src, src_len, b->span);
                        if (chunk.empty()) {
                            break;
                        }
                        out += chunk;
                        if (chunk.back() != '\n') {
                            out += '\n';
                        }
                        break;
                    }
                }
            }

            return !out.empty();
        }
    }

    std::string extract_help_query(const std::string& code, int cursor_pos)
    {
        if (cursor_pos < 0) {
            cursor_pos = 0;
        }
        if (static_cast<std::size_t>(cursor_pos) > code.size()) {
            cursor_pos = static_cast<int>(code.size());
        }

        int start = cursor_pos;
        while (start > 0 && is_help_ident_char(static_cast<unsigned char>(code[start - 1]))) {
            --start;
        }

        int end = cursor_pos;
        while (static_cast<std::size_t>(end) < code.size()
               && is_help_ident_char(static_cast<unsigned char>(code[end]))) {
            ++end;
        }

        if (end <= start) {
            return {};
        }
        return code.substr(static_cast<std::size_t>(start), static_cast<std::size_t>(end - start));
    }

    bool lookup_help(const std::string& query, std::string& markdown, std::string& plain)
    {
        markdown.clear();
        plain.clear();

        if (query.empty()) {
            return false;
        }

#ifdef MORPHO_INCLUDE_HELP
        help_topic topic;
        if (!morpho_helpastopic(query.c_str(), &topic)) {
            varray_char hint;
            varray_charinit(&hint);
            help_queryhint(query.c_str(), &hint);
            markdown = varray_to_string(hint);
            plain = markdown;
            varray_charclear(&hint);
            return false;
        }

        if (!topic_to_markdown(topic, markdown)) {
            return false;
        }

        varray_char txt;
        varray_charinit(&txt);
        if (help_topictotext(&topic, &txt)) {
            plain = varray_to_string(txt);
        }
        varray_charclear(&txt);

        // Plain-text renderer skips MD_SHOW_SUBTOPICS; append the list for parity.
        for (unsigned int i = 0; i < topic.nblocks; ++i) {
            if (topic.content_blocks[i].type == MD_SHOW_SUBTOPICS) {
                append_subtopics_plain(topic, plain);
                break;
            }
        }

        if (plain.empty()) {
            plain = markdown;
        }

        return true;
#else
        (void) query;
        return false;
#endif
    }

    bool parse_help_directive(const std::string& code, std::string& query)
    {
        query.clear();

        std::size_t i = 0;
        while (i < code.size() && std::isspace(static_cast<unsigned char>(code[i]))) {
            ++i;
        }
        if (i >= code.size()) {
            return false;
        }

        if (code[i] == '?') {
            query = trim_ascii(code.substr(i + 1));
            return true;
        }

        constexpr const char* help_kw = "help";
        constexpr std::size_t help_len = 4;
        if (code.compare(i, help_len, help_kw) != 0) {
            return false;
        }

        std::size_t after = i + help_len;
        if (after < code.size() && !std::isspace(static_cast<unsigned char>(code[after]))) {
            // e.g. "helpful" — not a help directive
            return false;
        }

        query = trim_ascii(code.substr(after));
        return true;
    }
}

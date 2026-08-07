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

        bool starts_with_indent(const std::string& line)
        {
            return line.size() >= 4 && line.compare(0, 4, "    ") == 0;
        }

        bool is_tab_indented(const std::string& line)
        {
            return !line.empty() && line[0] == '\t';
        }

        bool is_code_indented(const std::string& line)
        {
            return starts_with_indent(line) || is_tab_indented(line);
        }

        bool is_blank_line(const std::string& line)
        {
            return line.find_first_not_of(" \t") == std::string::npos;
        }

        std::string dedent_code_line(const std::string& line)
        {
            if (starts_with_indent(line)) {
                return line.substr(4);
            }
            if (is_tab_indented(line)) {
                return line.substr(1);
            }
            return line;
        }

        /** True if line opens/closes a markdown fence (```...). */
        bool is_fence_line(const std::string& line, std::string& info)
        {
            info.clear();
            std::size_t i = 0;
            while (i < line.size() && (line[i] == ' ' || line[i] == '\t')) {
                ++i;
            }
            if (line.compare(i, 3, "```") != 0) {
                return false;
            }
            info = trim_ascii(line.substr(i + 3));
            return true;
        }

        /**
         * Jupyter highlights fenced code by language; Morpho help uses indented
         * blocks with no language. Convert those to ```morpho fences.
         * Leave fences that already name a language alone; unlabeled ``` become morpho.
         */
        std::string fence_code_as_morpho(const std::string& md)
        {
            std::vector<std::string> lines;
            std::size_t start = 0;
            while (start < md.size()) {
                std::size_t end = md.find('\n', start);
                if (end == std::string::npos) {
                    lines.push_back(md.substr(start));
                    break;
                }
                lines.push_back(md.substr(start, end - start));
                start = end + 1;
                if (start == md.size()) {
                    // Trailing newline → empty final line omitted; OK.
                    break;
                }
            }
            if (md.empty()) {
                return md;
            }

            std::string out;
            out.reserve(md.size() + 64);
            bool in_fence = false;
            bool morpho_fence = false;

            for (std::size_t i = 0; i < lines.size(); ++i) {
                std::string fence_info;
                if (is_fence_line(lines[i], fence_info)) {
                    if (!in_fence) {
                        in_fence = true;
                        morpho_fence = fence_info.empty() || fence_info == "morpho";
                        if (fence_info.empty()) {
                            std::size_t pad = 0;
                            while (pad < lines[i].size()
                                   && (lines[i][pad] == ' ' || lines[i][pad] == '\t')) {
                                ++pad;
                            }
                            out.append(lines[i], 0, pad);
                            out += "```morpho\n";
                        } else {
                            out += lines[i];
                            out += '\n';
                        }
                    } else {
                        // Pair with jupyterlab-morpho language.ts tokenTable:
                        // Lab drops a final unstyled char in highlighted fences.
                        if (morpho_fence && (out.size() < 2 || out[out.size() - 2] != '\n')) {
                            out += '\n';
                        }
                        in_fence = false;
                        morpho_fence = false;
                        out += lines[i];
                        out += '\n';
                    }
                    continue;
                }

                if (in_fence) {
                    out += lines[i];
                    out += '\n';
                    continue;
                }

                if (is_code_indented(lines[i])) {
                    std::size_t j = i;
                    while (j < lines.size()) {
                        std::string dummy;
                        if (is_fence_line(lines[j], dummy)) {
                            break;
                        }
                        if (is_code_indented(lines[j])) {
                            ++j;
                            continue;
                        }
                        if (is_blank_line(lines[j])) {
                            std::size_t k = j + 1;
                            while (k < lines.size() && is_blank_line(lines[k])) {
                                ++k;
                            }
                            if (k < lines.size() && is_code_indented(lines[k])) {
                                j = k;
                                continue;
                            }
                        }
                        break;
                    }

                    out += "```morpho\n";
                    for (std::size_t n = i; n < j; ++n) {
                        if (is_blank_line(lines[n])) {
                            out += '\n';
                        } else {
                            out += dedent_code_line(lines[n]);
                            out += '\n';
                        }
                    }
                    // Pair with jupyterlab-morpho language.ts tokenTable:
                    // Lab drops a final unstyled char; trailing blank preserves it.
                    out += "\n```\n";
                    i = j - 1;
                    continue;
                }

                out += lines[i];
                out += '\n';
            }

            // Preserve whether the original ended without a trailing newline.
            if (!md.empty() && md.back() != '\n' && !out.empty() && out.back() == '\n') {
                out.pop_back();
            }
            return out;
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

            if (!out.empty()) {
                out = fence_code_as_morpho(out);
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

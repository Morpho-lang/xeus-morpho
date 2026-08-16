#############################################################################
# Copyright (c) 2023, Tim Atherton
#
# Distributed under the terms of the MIT license.
#
# The full license is in the file LICENSE, distributed with this software.
#############################################################################

"""Protocol tests for the xmorpho Jupyter kernel via jupyter_kernel_test.

Requires an installed ``xmorpho`` kernelspec (see README / CONTRIBUTING) and
Morpho 0.6 available to that binary.
"""

from __future__ import annotations

import unittest

import jupyter_kernel_test
from jupyter_kernel_test import TIMEOUT, ensure_sync, validate_message


class XMorphoKernelTests(jupyter_kernel_test.KernelTests):
    kernel_name = "xmorpho"
    language_name = "morpho"
    file_extension = ".morpho"

    # Print streams to stdout live (so long runs show progress). Leave
    # code_execute_result unset so test_execute_result is skipped.
    code_hello_world = 'print "hello, world"'

    code_generate_error = "var = 1"

    # Exact match sets are fragile (help topics vary by Morpho install).
    # test_completion still validates complete_reply; see test_complete_keyword.
    completion_samples = [{"text": "fo"}]

    complete_code_samples = [
        'print "hi"',
        "var x = 1",
        "help Matrix",
        "Matrix?",
    ]
    incomplete_code_samples = [
        "print (",
        "fn foo(",
        "{",
        "if true {",
    ]
    # is_complete only tracks bracket balance; it never returns "invalid".

    code_inspect_sample = "Matrix"

    def test_complete_keyword(self) -> None:
        """Keyword completion includes Morpho keywords such as ``for``."""
        self.flush_channels()
        msg_id = self.kc.complete("fo")
        reply = self.get_non_kernel_info_reply(timeout=TIMEOUT)
        validate_message(reply, "complete_reply", msg_id)
        assert reply is not None
        self.assertEqual(reply["content"]["status"], "ok")
        self.assertIn("for", reply["content"]["matches"])
        self.assertNotIn("quit", reply["content"]["matches"])

    def test_help_blank_lists_topics(self) -> None:
        """Empty ``help`` looks up the help index and lists topics (CLI)."""
        self.flush_channels()
        reply, output_msgs = self.execute_helper(code="help")
        self.assertEqual(reply["content"]["status"], "ok")
        found = False
        for msg in output_msgs:
            if msg["msg_type"] != "execute_result":
                continue
            found = True
            text = msg["content"]["data"].get("text/plain", "")
            self.assertTrue(
                "Topics" in text or "help" in text.lower(),
                "expected help index / topic list",
            )
        self.assertTrue(found, "execute_result message not found for blank help")

    def test_help_single_line_only(self) -> None:
        """A cell with extra lines after ``help`` is compiled, not treated as help."""
        self.flush_channels()
        reply, output_msgs = self.execute_helper(code="help Matrix\nprint 1")
        help_result = any(
            m["msg_type"] == "execute_result"
            and "text/markdown" in m["content"].get("data", {})
            for m in output_msgs
        )
        self.assertFalse(help_result, "multi-line cell must not be a help directive")
        self.assertIn(reply["content"]["status"], ("ok", "error"))

    def test_compile_error_has_line(self) -> None:
        """Compile errors include Morpho line/column like the CLI."""
        self.flush_channels()
        reply, _output_msgs = self.execute_helper(code="var = 1")
        self.assertEqual(reply["content"]["status"], "error")
        tb = "\n".join(reply["content"].get("traceback") or [])
        self.assertIn("line", tb.lower())

    def test_inspect_hint(self) -> None:
        """Unknown inspect queries still show Morpho's did-you-mean hint."""
        self.flush_channels()
        msg_id = self.kc.inspect("Matrx", 5)
        reply = self.get_non_kernel_info_reply(timeout=TIMEOUT)
        validate_message(reply, "inspect_reply", msg_id)
        assert reply is not None
        self.assertEqual(reply["content"]["status"], "ok")
        self.assertTrue(reply["content"]["found"])
        data = reply["content"].get("data") or {}
        text = data.get("text/plain", "")
        self.assertTrue(len(text) > 0, "expected inspect hint text")

    def test_silent_execute(self) -> None:
        """``silent`` suppresses streams / display / execute_result."""
        self.flush_channels()
        msg_id = self.kc.execute(code='print "secret-silent"', silent=True)
        reply = self.get_non_kernel_info_reply(timeout=TIMEOUT)
        validate_message(reply, "execute_reply", msg_id)
        assert reply is not None
        self.assertEqual(reply["content"]["status"], "ok")

        busy_msg = ensure_sync(self.kc.iopub_channel.get_msg)(timeout=1)
        validate_message(busy_msg, "status", msg_id)
        self.assertEqual(busy_msg["content"]["execution_state"], "busy")

        leaked = False
        while True:
            msg = ensure_sync(self.kc.iopub_channel.get_msg)(timeout=TIMEOUT)
            validate_message(msg, msg["msg_type"], msg_id)
            if msg["msg_type"] == "status":
                self.assertEqual(msg["content"]["execution_state"], "idle")
                break
            if msg["msg_type"] in ("stream", "execute_result", "display_data", "error"):
                leaked = True
        self.assertFalse(leaked, "silent execute leaked iopub output")

    def test_jupyter_display_mime(self) -> None:
        """``JupyterDisplay`` publishes morphoview MIME without the morphoview package."""
        self.flush_channels()
        code = 'JupyterDisplay("S 1 3 W test o 1 v 0 0 0 0 0 1 p 0 d 1")'
        reply, output_msgs = self.execute_helper(code=code)
        self.assertEqual(reply["content"]["status"], "ok")
        found = False
        for msg in output_msgs:
            if msg["msg_type"] != "display_data":
                continue
            data = msg["content"].get("data") or {}
            if "application/vnd.morpho.morphoview" in data:
                found = True
                self.assertIn("S 1 3", data["application/vnd.morpho.morphoview"])
        self.assertTrue(found, "display_data with morphoview MIME not found")

    def test_help_execute_markdown(self) -> None:
        """``help`` / ``?`` cells publish markdown without compiling."""
        self.flush_channels()
        reply, output_msgs = self.execute_helper(code="help Matrix")
        self.assertEqual(reply["content"]["status"], "ok")

        found = False
        for msg in output_msgs:
            if msg["msg_type"] != "execute_result":
                continue
            found = True
            data = msg["content"]["data"]
            self.assertIn("text/plain", data)
            self.assertTrue(
                "text/markdown" in data or len(data["text/plain"]) > 0,
                "expected help text in execute_result",
            )
        self.assertTrue(found, "execute_result message not found for help")

    def test_topic_question_help(self) -> None:
        """Trailing ``Topic?`` is accepted as a help directive."""
        self.flush_channels()
        reply, output_msgs = self.execute_helper(code="Matrix?")
        self.assertEqual(reply["content"]["status"], "ok")
        self.assertTrue(
            any(m["msg_type"] == "execute_result" for m in output_msgs),
            "expected execute_result for Matrix?",
        )

    def test_stdin_readline(self) -> None:
        """``System.readline`` uses Jupyter's input_request / input_reply."""
        self.flush_channels()
        code = "print System.readline()"
        msg_id = self.kc.execute(code=code)

        stdin_msg = ensure_sync(self.kc.get_stdin_msg)(timeout=TIMEOUT)
        # Reply before any assertions so a failed check cannot leave the kernel blocked.
        self.assertEqual(stdin_msg["header"]["msg_type"], "input_request")
        self.assertEqual(stdin_msg["parent_header"].get("msg_id"), msg_id)
        # xeus currently sends ``pwd`` (bool); Jupyter schema expects ``password``.
        content = stdin_msg["content"]
        self.assertIn("prompt", content)
        self.kc.input("hello from stdin")

        reply = self.get_non_kernel_info_reply(timeout=TIMEOUT)
        validate_message(reply, "execute_reply", msg_id)
        assert reply is not None
        self.assertEqual(reply["content"]["status"], "ok")

        # Drain iopub until idle; look for the echoed line on stdout.
        busy_msg = ensure_sync(self.kc.iopub_channel.get_msg)(timeout=1)
        validate_message(busy_msg, "status", msg_id)
        self.assertEqual(busy_msg["content"]["execution_state"], "busy")

        found_stdout = False
        while True:
            msg = ensure_sync(self.kc.iopub_channel.get_msg)(timeout=TIMEOUT)
            validate_message(msg, msg["msg_type"], msg_id)
            if msg["msg_type"] == "status":
                self.assertEqual(msg["content"]["execution_state"], "idle")
                break
            if msg["msg_type"] == "execute_input":
                continue
            if msg["msg_type"] == "stream" and msg["content"].get("name") == "stdout":
                if "hello from stdin" in msg["content"].get("text", ""):
                    found_stdout = True

        self.assertTrue(found_stdout, "stdout with readline echo not found")


if __name__ == "__main__":
    unittest.main()

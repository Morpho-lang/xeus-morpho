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

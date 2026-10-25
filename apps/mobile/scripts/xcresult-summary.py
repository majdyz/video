"""Prints test cases and failure messages from `xcresulttool get test-results tests --compact` JSON (stdin). CI helper."""
import json
import sys


def walk(node, depth=0):
    kind = node.get("nodeType", "")
    result = node.get("result", "")
    if kind in ("Test Case", "Failure Message") or result == "Failed":
        print("%s%s: %s [%s] %s" % ("  " * depth, kind, node.get("name", ""), result, node.get("duration", "")))
    for child in node.get("children", []):
        walk(child, depth + 1)


for top in json.load(sys.stdin).get("testNodes", []):
    walk(top)

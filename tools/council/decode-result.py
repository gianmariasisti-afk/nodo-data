#!/usr/bin/env python3
"""Turn the browser's answer to window.__nodoCouncil.text() into the collection file pull.py reads.

The agent harness saves a long tool result to a file: a JSON array whose first element's "text" is the answer, either as
a JSON string literal or as plain text, sometimes followed by a note from the harness. The answer is
"SUMMARY=<json>\\n<collection>\\n<padding>". This checks the collection against the SHA-256 in the summary.

Usage: python3 tools/council/decode-result.py SAVED_RESULT OUT.json      prints the summary as JSON
"""
import hashlib, json, sys


def answer(raw):
    try:
        arr = json.loads(raw)
        text = arr[0]["text"] if isinstance(arr, list) else raw
    except (ValueError, KeyError, IndexError, TypeError):
        text = raw
    text = text.lstrip()
    if text.startswith('"'):
        text, _ = json.JSONDecoder().raw_decode(text)
    return text


def main(src, out):
    text = answer(open(src, encoding="utf-8").read())
    i = text.find("SUMMARY=")
    if i < 0:
        sys.exit("No SUMMARY= line in the saved result")
    head, _, rest = text[i + len("SUMMARY="):].partition("\n")
    summary = json.loads(head)
    payload, end = json.JSONDecoder().raw_decode(rest)
    body = rest[:end]
    if hashlib.sha256(body.encode("utf-8")).hexdigest() != summary.get("sha256"):
        sys.exit("SHA-256 of the collection does not match the summary: the answer was cut or altered")
    open(out, "w", encoding="utf-8").write(body)
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

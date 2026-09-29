#!/usr/bin/env python3
"""Agent capture hook for Claude Code.

Wired in .claude/settings.json to two events:
  UserPromptSubmit -> appends a PROMPT entry (the prompt, verbatim)
  Stop             -> appends a RESPONSE entry (the final text of the turn)

Writes one file per session to .agent-logs/YYYY-MM-DD_HH-MM-SS_<session-id>.md
in the 8x log format. Never blocks the agent: all errors go to
.claude/hooks/capture-errors.log and the hook always exits 0.
"""
import glob
import json
import os
import re
import sys
import time
import traceback
from datetime import datetime, timezone

AUTHOR = "hassan-muzaffar"
PROJECT = "higgsfield-rebuild"
TOOL = "claude-code"

ROOT = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
LOG_DIR = os.path.join(ROOT, ".agent-logs")
ERR_LOG = os.path.join(ROOT, ".claude", "hooks", "capture-errors.log")
# Gitignored list of personal terms to keep out of the public log (one regex per line).
REDACT_FILE = os.path.join(ROOT, ".claude", "redact.local")


def redact(text):
    try:
        with open(REDACT_FILE, encoding="utf-8") as f:
            patterns = [l.strip() for l in f if l.strip() and not l.startswith("#")]
    except OSError:
        return text
    for pattern in patterns:
        text = re.sub(pattern, "[REDACTED]", text, flags=re.I)
    return text


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def read_transcript(path):
    rows = []
    if not path or not os.path.exists(path):
        return rows
    with open(path, encoding="utf-8") as f:
        for line in f:
            try:
                rows.append(json.loads(line))
            except ValueError:
                pass
    return rows


def is_tool_result(row):
    content = (row.get("message") or {}).get("content")
    return isinstance(content, list) and any(
        b.get("type") == "tool_result" for b in content if isinstance(b, dict)
    )


def is_real_prompt(row):
    """A prompt the human typed (not meta, not a tool result, not a sidechain)."""
    return (
        row.get("type") == "user"
        and not row.get("isMeta")
        and not row.get("isSidechain")
        and not is_tool_result(row)
    )


def last_model(rows):
    for row in reversed(rows):
        if row.get("type") == "assistant" and not row.get("isSidechain"):
            model = (row.get("message") or {}).get("model")
            if model and model != "<synthetic>":
                return model
    return None


def configured_model():
    for path in (
        os.path.join(ROOT, ".claude", "settings.local.json"),
        os.path.join(ROOT, ".claude", "settings.json"),
        os.path.expanduser("~/.claude/settings.json"),
    ):
        try:
            with open(path) as f:
                model = json.load(f).get("model")
            if model:
                return model
        except (OSError, ValueError):
            pass
    return os.environ.get("ANTHROPIC_MODEL") or "unknown"


def final_response(rows):
    """Text the assistant produced after its last tool call in the current turn."""
    start = None
    for i in range(len(rows) - 1, -1, -1):
        if is_real_prompt(rows[i]):
            start = i
            break
    if start is None:
        return "", None
    parts, model = [], None
    for row in rows[start + 1:]:
        if row.get("isSidechain"):
            continue
        if row.get("type") == "user" and is_tool_result(row):
            parts = []
            continue
        if row.get("type") != "assistant":
            continue
        msg = row.get("message") or {}
        for block in msg.get("content") or []:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "tool_use":
                parts = []
            elif block.get("type") == "text" and block.get("text", "").strip():
                parts.append(block["text"])
        if msg.get("model") and msg.get("model") != "<synthetic>":
            model = msg["model"]
    return "\n\n".join(parts).strip(), model


def log_path(session_id):
    existing = glob.glob(os.path.join(LOG_DIR, f"*_{session_id}.md"))
    if existing:
        return existing[0]
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
    return os.path.join(LOG_DIR, f"{stamp}_{session_id}.md")


def write_entry(session_id, kind, model, body):
    os.makedirs(LOG_DIR, exist_ok=True)
    path = log_path(session_id)
    short = session_id[:8]
    ts = now_iso()

    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            text = f.read()
        _, front, rest = text.split("---\n", 2)
    else:
        front = ""
        rest = (
            f"\n# Session Log - {ts[:10]}\n\n"
            f"Session: `{short}` | Project: `{PROJECT}` | Author: `{AUTHOR}`\n\n---\n"
        )

    meta = dict(re.findall(r"^(\w+): (.*)$", front, flags=re.M))
    num = int(meta.get("total_exchanges", 0))
    if kind == "PROMPT":
        num += 1
        meta.setdefault("first_prompt_time", ts)
        meta["last_prompt_time"] = ts
    else:
        num = max(num, 1)
    meta["total_exchanges"] = str(num)
    meta["model"] = model

    # A session's first prompt only knows the settings alias (e.g. "opus");
    # once the response gives the full model ID, backfill that turn's PROMPT entry.
    if kind == "RESPONSE" and model.startswith("claude-"):
        rest = re.sub(
            rf"(\[LOG_ENTRY type=PROMPT num={num} session={short}\]\ntimestamp: [^\n]*\nmodel: )(?!claude-)[^\n]*",
            lambda m: m.group(1) + model,
            rest,
        )

    entry = (
        f"\n[LOG_ENTRY type={kind} num={num} session={short}]\n"
        f"timestamp: {ts}\n"
        f"model: {model}\n\n"
        f"{redact(body).rstrip()}\n\n"
    )

    header = (
        f"session_id: {session_id}\n"
        f"date: {meta.get('date', ts[:10])}\n"
        f"author: {AUTHOR}\n"
        f"model: {meta['model']}\n"
        f"tool: {TOOL}\n"
        f"project: {PROJECT}\n"
        f"total_exchanges: {meta['total_exchanges']}\n"
        f"first_prompt_time: {meta.get('first_prompt_time', ts)}\n"
        f"last_prompt_time: {meta.get('last_prompt_time', ts)}\n"
    )
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write("---\n" + header + "---\n" + rest + entry)
    os.replace(tmp, path)


def main():
    data = json.load(sys.stdin)
    event = data.get("hook_event_name")
    session_id = data.get("session_id") or "unknown-session"
    transcript = data.get("transcript_path")

    if event == "UserPromptSubmit":
        model = last_model(read_transcript(transcript)) or configured_model()
        write_entry(session_id, "PROMPT", model, data.get("prompt", ""))

    elif event == "Stop":
        # The transcript can lag the Stop event slightly; retry briefly.
        text, model = "", None
        for _ in range(10):
            text, model = final_response(read_transcript(transcript))
            if text:
                break
            time.sleep(0.3)
        if not text:
            text = data.get("last_assistant_message") or "(no final text response captured)"
        write_entry(session_id, "RESPONSE", model or configured_model(), text)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        os.makedirs(os.path.dirname(ERR_LOG), exist_ok=True)
        with open(ERR_LOG, "a") as f:
            f.write(f"{now_iso()}\n{traceback.format_exc()}\n")
    sys.exit(0)

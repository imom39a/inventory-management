#!/usr/bin/env python3
"""Mechanical inventory of Vue 3 single-file components.

Usage: python3 vue_inventory.py <src-dir> [--window N]

Prints a Markdown report of *leads* for the vue-audit skill. Everything here is
regex-based on purpose (stdlib only, no node toolchain needed), so every lead
must be confirmed by reading the code before it becomes a finding.
"""
import argparse
import hashlib
import re
import sys
from collections import defaultdict
from pathlib import Path

BLOCK_RE = re.compile(r"<(template|script|style)\b[^>]*>(.*?)</\1>", re.S)
INDEX_KEY_RE = re.compile(r'v-for="\(\s*\w+\s*,\s*(\w+)\s*\)\s+in[^"]*"[^>]*:key="\s*\1\s*"')
VIF_VFOR_RE = re.compile(r"<[^>]*\bv-for=[^>]*\bv-if=|<[^>]*\bv-if=[^>]*\bv-for=")
FUNC_DEF_RE = re.compile(
    r"^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)|^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>",
    re.M,
)
EAGER_VIEW_IMPORT_RE = re.compile(r"^import\s+(\w+)\s+from\s+['\"]([^'\"]+\.vue)['\"]", re.M)
SELECTOR_RE = re.compile(r"([^{}]+)\{([^{}]*)\}")
API_COUNTS = {
    "ref": r"\bref\(",
    "shallowRef": r"\bshallowRef\(",
    "reactive": r"\breactive\(",
    "computed": r"\bcomputed\(",
    "watch": r"\bwatch\(",
    "watchEffect": r"\bwatchEffect\(",
    "deep watch": r"deep:\s*true",
}
# Names too generic to signal duplication when they repeat across files.
GENERIC_NAMES = {"setup", "loadData", "fetchData", "handleClick", "close", "open", "onClose", "init"}


def line_of(text, offset):
    return text.count("\n", 0, offset) + 1


def normalize(line):
    return re.sub(r"\s+", " ", line.strip())


def analyze_file(path):
    text = path.read_text(encoding="utf-8", errors="replace")
    blocks = {"template": (0, ""), "script": (0, ""), "style": (0, "")}
    for m in BLOCK_RE.finditer(text):
        # Keep the first block of each kind; offset lets us map back to file lines.
        if not blocks[m.group(1)][1]:
            blocks[m.group(1)] = (m.start(2), m.group(2))
    t_off, template = blocks["template"]
    s_off, script = blocks["script"]
    _, style = blocks["style"]
    info = {
        "path": path,
        "lines": text.count("\n") + 1,
        "template_lines": template.count("\n"),
        "script_lines": script.count("\n"),
        "style_lines": style.count("\n"),
        "script_setup": "<script setup" in text,
        "api": {k: len(re.findall(p, script)) for k, p in API_COUNTS.items()},
        "index_keys": [line_of(text, t_off + m.start()) for m in INDEX_KEY_RE.finditer(template)],
        "vif_vfor": [line_of(text, t_off + m.start()) for m in VIF_VFOR_RE.finditer(template)],
        "functions": {},
        "selectors": {},
        "text": text,
    }
    for m in FUNC_DEF_RE.finditer(script):
        name = m.group(1) or m.group(2)
        info["functions"][name] = line_of(text, s_off + m.start())
    # Strip comments first, or a leading /* ... */ becomes part of the next selector.
    for m in SELECTOR_RE.finditer(re.sub(r"/\*.*?\*/", "", style, flags=re.S)):
        body = normalize(m.group(2))
        if not body:
            continue
        for sel in m.group(1).split(","):
            sel = normalize(sel)
            if sel and not sel.startswith("@"):
                info["selectors"][sel] = body
    return info


def shared_windows(infos, window):
    """Find runs of `window` consecutive near-identical lines shared by files."""
    index = defaultdict(set)
    for info in infos:
        lines = [normalize(l) for l in info["text"].splitlines()]
        # Skip trivial lines so closing tags and braces don't create matches.
        meaningful = [(i + 1, l) for i, l in enumerate(lines) if len(l) > 3 and l not in ("</div>", "}", "},", "})")]
        for j in range(len(meaningful) - window + 1):
            chunk = "\n".join(l for _, l in meaningful[j:j + window])
            digest = hashlib.md5(chunk.encode()).hexdigest()
            index[digest].add((str(info["path"]), meaningful[j][0]))
    pairs = defaultdict(list)
    for hits in index.values():
        files = defaultdict(list)
        for f, ln in hits:
            files[f].append(ln)
        if len(files) < 2:
            continue
        key = tuple(sorted(files))
        pairs[key].append({f: min(v) for f, v in files.items()})
    return pairs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("--window", type=int, default=6, help="lines per duplicate-run match")
    args = ap.parse_args()
    root = Path(args.src)
    vue_files = sorted(p for p in root.rglob("*.vue") if "node_modules" not in p.parts)
    if not vue_files:
        sys.exit(f"No .vue files under {root}")
    infos = [analyze_file(p) for p in vue_files]
    rel = lambda p: str(Path(p).relative_to(root.parent)) if root.parent in Path(p).parents else str(p)

    print(f"# Vue inventory: {root} ({len(infos)} files)\n")
    print("## Files (largest first)\n")
    print("| File | Lines | Tmpl | Script | Style | setup | ref | shallowRef | reactive | computed | watch | deep |")
    print("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for i in sorted(infos, key=lambda x: -x["lines"]):
        a = i["api"]
        print(f"| {rel(i['path'])} | {i['lines']} | {i['template_lines']} | {i['script_lines']} | {i['style_lines']} | "
              f"{'script setup' if i['script_setup'] else 'setup()'} | {a['ref']} | {a['shallowRef']} | {a['reactive']} | "
              f"{a['computed']} | {a['watch'] + a['watchEffect']} | {a['deep watch']} |")

    print("\n## Template leads\n")
    any_lead = False
    for i in infos:
        for ln in i["index_keys"]:
            print(f"- index used as :key — {rel(i['path'])}:{ln}"); any_lead = True
        for ln in i["vif_vfor"]:
            print(f"- v-if and v-for on one element — {rel(i['path'])}:{ln}"); any_lead = True
    if not any_lead:
        print("- none")

    print("\n## Router / loading leads\n")
    any_lead = False
    for p in sorted(root.rglob("*.[jt]s")):
        if "node_modules" in p.parts:
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        if "createRouter" not in text and "routes" not in text:
            continue
        for m in EAGER_VIEW_IMPORT_RE.finditer(text):
            if re.search(rf"component:\s*{m.group(1)}\b", text):
                print(f"- eager route component `{m.group(1)}` ({m.group(2)}) — {rel(p)}:{line_of(text, m.start())}")
                any_lead = True
    if not any_lead:
        print("- none")

    print("\n## Functions defined in more than one file\n")
    by_name = defaultdict(list)
    for i in infos:
        for name, ln in i["functions"].items():
            by_name[name].append(f"{rel(i['path'])}:{ln}")
    dupes = {n: locs for n, locs in by_name.items() if len(locs) > 1 and n not in GENERIC_NAMES}
    for name, locs in sorted(dupes.items(), key=lambda kv: -len(kv[1])):
        print(f"- `{name}` ×{len(locs)}: " + ", ".join(locs))
    if not dupes:
        print("- none")

    print("\n## CSS selectors with identical rules in more than one file\n")
    by_rule = defaultdict(list)
    for i in infos:
        for sel, body in i["selectors"].items():
            by_rule[(sel, body)].append(rel(i["path"]))
    shared = [(sel, files) for (sel, _), files in by_rule.items() if len(files) > 1]
    for sel, files in sorted(shared, key=lambda x: -len(x[1]))[:40]:
        print(f"- `{sel}` ×{len(files)}: " + ", ".join(files))
    if not shared:
        print("- none")
    elif len(shared) > 40:
        print(f"- ... and {len(shared) - 40} more")

    print(f"\n## Shared runs of {args.window}+ near-identical lines (file pairs)\n")
    pairs = shared_windows(infos, args.window)
    if not pairs:
        print("- none")
    for files, matches in sorted(pairs.items(), key=lambda kv: -len(kv[1]))[:25]:
        sample = matches[0]
        where = ", ".join(f"{rel(f)}:{sample[f]}" for f in files)
        print(f"- {len(matches)} matching windows across {len(files)} files — first at {where}")


if __name__ == "__main__":
    main()

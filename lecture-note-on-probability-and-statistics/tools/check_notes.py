#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""講義ノートの機械的な整合性チェック。

検査項目:
  1. 脚注 <sup>※</sup>（＋数式内 ^\text{※}）と note-side の個数一致
  2. MathJax デリミタの均衡と本文の句読点
  3. title／h1、h2・h3 の安定 ID、SVG の基本属性
  4. 全ページのローカルリンクとフラグメント
  5. 索引ラベルとリンク先、索引語ハイライトの成立
  6. CDN バージョンと固有スクリプトの配置
  7. UTF-8・LF・末尾空白・最終改行

失敗があれば終了コード 1 を返す。
"""

import glob
import html
import os
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)

TITLE_SUFFIX = " — 確率統計学 講義ノート"
MATHJAX_CDN = "https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-chtml.js"
D3_CDN = "https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"
TEXT_EXTENSIONS = {".css", ".html", ".js", ".json", ".md", ".py", ".svg", ".txt", ".yaml", ".yml"}
TEXT_FILENAMES = {".editorconfig", ".gitattributes"}
SKIP_DIRS = {".agents", ".claude", ".git", ".tmp-chrome", ".tmp-chrome-test", "__pycache__"}

errors = []


def read_text(path, *, preserve_newlines=False):
    newline = "" if preserve_newlines else None
    with open(path, encoding="utf-8", newline=newline) as f:
        return f.read()


def note_files():
    return ["index.html"] + sorted(glob.glob("notes/*/index.html"))


def project_text_files():
    paths = []
    for directory, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [name for name in dirnames if name not in SKIP_DIRS]
        for name in filenames:
            path = Path(directory, name)
            if path.suffix.lower() in TEXT_EXTENSIONS or name in TEXT_FILENAMES:
                paths.append(path.relative_to(ROOT).as_posix())
    return sorted(paths)


def main_section(text):
    match = re.search(r"<main\b[^>]*>(.*?)</main>", text, flags=re.S | re.I)
    return match.group(1) if match else text


def plain_text(fragment):
    fragment = re.sub(r"<script\b.*?</script>", "", fragment, flags=re.S | re.I)
    fragment = re.sub(r"<style\b.*?</style>", "", fragment, flags=re.S | re.I)
    fragment = re.sub(r"<[^>]+>", "", fragment)
    return re.sub(r"\s+", " ", html.unescape(fragment)).strip()


def check_footnotes():
    for path in note_files():
        main = main_section(read_text(path))
        sup = len(re.findall(r"<sup>※</sup>", main))
        math_sup = main.count("^\\text{※}")
        side = len(re.findall(r'class="note-side"', main))
        if sup + math_sup != side:
            errors.append(
                f"[footnote] {path}: ※={sup}+数式{math_sup} だが note-side={side}（不一致）"
            )


def check_math_delimiters():
    # aligned の改行 \\[6pt] などを除外するため、直前が \ でないものだけを数える。
    def count_delimiter(text, char):
        return len(re.findall(r"(?<!\\)\\" + re.escape(char), text))

    for path in note_files():
        text = read_text(path)
        inline_open = count_delimiter(text, "(")
        inline_close = count_delimiter(text, ")")
        display_open = count_delimiter(text, "[")
        display_close = count_delimiter(text, "]")
        if inline_open != inline_close:
            errors.append(
                f"[math] {path}: インライン \\( {inline_open} 個 / \\) {inline_close} 個（不均衡）"
            )
        if display_open != display_close:
            errors.append(
                f"[math] {path}: ディスプレイ \\[ {display_open} 個 / \\] {display_close} 個（不均衡）"
            )


def check_punctuation():
    for path in note_files():
        main = main_section(read_text(path))
        main = re.sub(r"<script\b.*?</script>", "", main, flags=re.S | re.I)
        if "、" in main:
            errors.append(
                f"[punct] {path}: 本文に読点「、」が {main.count('、')} 個（仕様は「，」）"
            )


def check_titles_and_headings():
    kebab = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
    for path in note_files():
        text = read_text(path)
        title_match = re.search(r"<title>(.*?)</title>", text, flags=re.S | re.I)
        h1_matches = re.findall(r"<h1\b[^>]*>(.*?)</h1>", text, flags=re.S | re.I)
        if not title_match:
            errors.append(f"[title] {path}: title がない")
        if len(h1_matches) != 1:
            errors.append(f"[title] {path}: h1 が {len(h1_matches)} 個（1 個必要）")
        if title_match and len(h1_matches) == 1:
            title = plain_text(title_match.group(1))
            if title.endswith(TITLE_SUFFIX):
                title = title[: -len(TITLE_SUFFIX)]
            h1 = plain_text(h1_matches[0])
            if title != h1:
                errors.append(f"[title] {path}: title「{title}」と h1「{h1}」が不一致")

        for match in re.finditer(r"<h([23])\b([^>]*)>", text, flags=re.I):
            level, attrs = match.groups()
            id_match = re.search(r'\bid="([^"]+)"', attrs)
            line = text.count("\n", 0, match.start()) + 1
            if not id_match:
                errors.append(f"[heading] {path}:{line}: h{level} に id がない")
            elif not kebab.fullmatch(id_match.group(1)):
                errors.append(
                    f"[heading] {path}:{line}: id=\"{id_match.group(1)}\" が英語ケバブケースでない"
                )


def resolve_local_target(source, raw_url):
    parts = urlsplit(html.unescape(raw_url))
    if parts.scheme or parts.netloc or raw_url.startswith(("/", "data:", "mailto:", "javascript:")):
        return None, parts.fragment
    relative = unquote(parts.path)
    target = Path(source).parent / relative if relative else Path(source)
    if target.is_dir() or relative.endswith("/"):
        target /= "index.html"
    return target, unquote(parts.fragment)


def check_local_links():
    id_cache = {}
    for source in note_files():
        text = read_text(source)
        for match in re.finditer(r'(?:href|src)="([^"]+)"', text):
            raw_url = match.group(1)
            target, fragment = resolve_local_target(source, raw_url)
            if target is None:
                continue
            normalized = Path(os.path.normpath(target.as_posix()))
            if not normalized.exists():
                errors.append(f"[link] {source} -> {raw_url}（解決できない）")
                continue
            if fragment and normalized.suffix.lower() == ".html":
                key = normalized.as_posix()
                if key not in id_cache:
                    target_text = read_text(normalized)
                    id_cache[key] = set(re.findall(r'\bid="([^"]+)"', target_text))
                if fragment not in id_cache[key]:
                    errors.append(f"[fragment] {source} -> {raw_url}（id が存在しない）")


def extract_note_links(fragment):
    return re.findall(r'href="\./notes/([^"/]+)/"', fragment)


def index_directory_labels(text):
    blocks = [
        (r'<ol class="toc">(.*?)</ol>', ""),
        (r'<ul class="appendix-list">(.*?)</ul>', "A"),
        (r'<ul class="appendix-list reading-list">(.*?)</ul>', "R"),
    ]
    mapping = {}
    for pattern, prefix in blocks:
        match = re.search(pattern, text, flags=re.S)
        if not match:
            errors.append(f"[index] 目次ブロック {prefix or '本編'} が見つからない")
            continue
        for number, directory in enumerate(extract_note_links(match.group(1)), start=1):
            mapping[directory] = f"{prefix}{number}"
            if not prefix and not directory.startswith(f"{number:02d}-"):
                errors.append(
                    f"[index] 本編 [{number}] のリンク先 notes/{directory}/ が番号と不一致"
                )
    return mapping


def term_exists(term, target_text):
    main = main_section(target_text)
    main = re.sub(r"<(?:nav|script|style|svg)\b.*?</(?:nav|script|style|svg)>", "", main, flags=re.S | re.I)
    visible = plain_text(main)
    if re.fullmatch(r"[\x21-\x7e]+", term):
        return re.search(rf"(?<![A-Za-z0-9]){re.escape(term)}(?![A-Za-z0-9])", visible, flags=re.I) is not None
    return term in visible


def check_index():
    text = read_text("index.html")
    mapping = index_directory_labels(text)
    existing = {Path(path).parent.name for path in glob.glob("notes/*/index.html")}
    if set(mapping) != existing:
        for directory in sorted(existing - set(mapping)):
            errors.append(f"[index] notes/{directory}/ が目次にない")
        for directory in sorted(set(mapping) - existing):
            errors.append(f"[index] 目次の notes/{directory}/ が存在しない")

    term_start = text.find('<div class="term-index">')
    term_block = text[term_start:] if term_start >= 0 else ""
    for match in re.finditer(
        r'<a href="\./notes/([^"/]+)/">\[([^\]]+)\]</a>', term_block
    ):
        directory, label = match.groups()
        expected = mapping.get(directory)
        if expected is None:
            errors.append(f"[index] [{label}] のリンク先 notes/{directory}/ が目次にない")
        elif label != expected:
            errors.append(
                f"[index] notes/{directory}/ は [{expected}] だが索引では [{label}]"
            )

    aliases = {"R2": "決定係数"}
    target_cache = {}
    for item in re.findall(r"<li>(.*?)</li>", term_block, flags=re.S):
        head = plain_text(item).split("──", 1)[0]
        term = re.split(r"[（(]", head, maxsplit=1)[0].strip()
        term = aliases.get(term, term)
        if not term:
            continue
        for directory in extract_note_links(item):
            target = f"notes/{directory}/index.html"
            if target not in target_cache:
                target_cache[target] = read_text(target)
            if not term_exists(term, target_cache[target]):
                errors.append(f"[highlight] 索引語「{term}」が {target} の本文にない")


def check_scripts_and_svgs():
    for path in note_files():
        text = read_text(path)
        head_match = re.search(r"<head>(.*?)</head>", text, flags=re.S | re.I)
        head = head_match.group(1) if head_match else ""
        sources = re.findall(r'<script\b[^>]*\bsrc="([^"]+)"[^>]*></script>', text, flags=re.I)
        for source in sources:
            if "mathjax@" in source and source != MATHJAX_CDN:
                errors.append(f"[cdn] {path}: MathJax が 3.2.2 固定でない ({source})")
            if "d3@" in source and source != D3_CDN:
                errors.append(f"[cdn] {path}: D3 が 7.9.0 固定でない ({source})")

        head_sources = re.findall(r'<script\b[^>]*\bsrc="([^"]+)"[^>]*></script>', head, flags=re.I)
        if any("term-highlight.js" in source for source in head_sources):
            if "term-highlight.js" not in head_sources[-1]:
                errors.append(f"[script] {path}: term-highlight.js が head 内の最後でない")
        body = text[head_match.end():] if head_match else text
        for tag in re.findall(r'<script\b[^>]*\bsrc="[^"]+"[^>]*></script>', body, flags=re.I):
            errors.append(f"[script] {path}: 固有スクリプトが head 外にある ({plain_text(tag) or tag})")

        without_icon = re.sub(r'<link\b[^>]*rel="icon"[^>]*>', "", text, flags=re.I)
        for match in re.finditer(r"<svg\b([^>]*)>", without_icon, flags=re.I):
            attrs = match.group(1)
            line = without_icon.count("\n", 0, match.start()) + 1
            if not re.search(r'\bviewBox="[^"]+"', attrs, flags=re.I):
                errors.append(f"[svg] {path}:{line}: viewBox がない")
            hidden = re.search(r'\baria-hidden="true"', attrs, flags=re.I)
            if not hidden:
                if not re.search(r'\brole="img"', attrs, flags=re.I):
                    errors.append(f"[svg] {path}:{line}: role=\"img\" がない")
                if not re.search(r'\baria-label="[^"]+"', attrs, flags=re.I):
                    errors.append(f"[svg] {path}:{line}: aria-label がない")


def check_accessibility():
    live_required = {
        "notes/07-marginal-probability/index.html",
        "notes/12-central-limit-theorem/index.html",
        "notes/13-unbiased-variance/index.html",
        "notes/14-linear-regression/index.html",
        "notes/appendix-binomial-approximations/index.html",
        "notes/appendix-p-value-z-value-calculator/index.html",
    }
    greek = re.compile(r"[\u0370-\u03ff]")
    for path in note_files():
        normalized_path = Path(path).as_posix()
        text = read_text(path)
        label_targets = set(re.findall(r'<label\b[^>]*\bfor="([^"]+)"', text, flags=re.I))
        for match in re.finditer(r"<(input|select|textarea)\b([^>]*)>", text, flags=re.S | re.I):
            tag_name, attrs = match.groups()
            if re.search(r'\btype="hidden"', attrs, flags=re.I):
                continue
            id_match = re.search(r'\bid="([^"]+)"', attrs, flags=re.I)
            control_id = id_match.group(1) if id_match else ""
            named = bool(
                re.search(r'\baria-(?:label|labelledby)="[^"]+"', attrs, flags=re.I)
                or (control_id and control_id in label_targets)
            )
            prefix = text[: match.start()]
            wrapped = prefix.lower().rfind("<label") > prefix.lower().rfind("</label>")
            if not named and not wrapped:
                line = text.count("\n", 0, match.start()) + 1
                identity = f"#{control_id}" if control_id else tag_name.lower()
                errors.append(f"[a11y] {path}:{line}: {identity} にアクセシブルな名前がない")

        for match in re.finditer(r'\baria-label="([^"]+)"', text, flags=re.I):
            if greek.search(match.group(1)):
                line = text.count("\n", 0, match.start()) + 1
                errors.append(f"[a11y] {path}:{line}: aria-label にギリシャ文字がある")

        if normalized_path in live_required and not re.search(
            r'\baria-live="polite"', text, flags=re.I
        ):
            errors.append(f"[a11y] {path}: 動的結果を通知する aria-live=\"polite\" がない")


def check_file_format():
    for path in project_text_files():
        try:
            text = read_text(path, preserve_newlines=True)
        except UnicodeDecodeError:
            errors.append(f"[format] {path}: UTF-8 として読めない")
            continue
        if text.startswith("\ufeff"):
            errors.append(f"[format] {path}: UTF-8 BOM がある")
        if "\r" in text:
            errors.append(f"[format] {path}: 改行が LF に統一されていない")
        trailing = [
            number
            for number, line in enumerate(text.splitlines(), start=1)
            if line.endswith((" ", "\t"))
        ]
        if trailing:
            shown = ", ".join(map(str, trailing[:5]))
            suffix = "…" if len(trailing) > 5 else ""
            errors.append(f"[format] {path}: 末尾空白がある行 {shown}{suffix}")
        if text and not text.endswith("\n"):
            errors.append(f"[format] {path}: 最終改行がない")


def main():
    check_footnotes()
    check_math_delimiters()
    check_punctuation()
    check_titles_and_headings()
    check_local_links()
    check_index()
    check_scripts_and_svgs()
    check_accessibility()
    check_file_format()

    if errors:
        print(f"NG: {len(errors)} 件の問題が見つかりました\n")
        for error in errors:
            print("  " + error)
        return 1
    print("OK: すべての検査に合格しました")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())

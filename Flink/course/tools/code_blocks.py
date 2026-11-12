"""Разворачивает теги кода в уроках. Код берётся из solutions/ и из исходников Flink на закреплённом теге.

  <div data-code="lesson-03/src/.../X.java" data-lines="10-30"></div>   файл снапшота целиком или диапазон строк
  <div data-diff="lesson-03/build.gradle.kts lesson-04/build.gradle.kts"></div>   разница между снапшотами
  <pre data-lang="bash" data-title="терминал">команды</pre>   код прямо в уроке, data-output для вывода
  <div data-src="flink:flink-runtime/src/.../X.java" data-lines="10-30" data-must="triggerCheckpoint"></div>
      цитата из исходников со ссылкой на тег. Если строки data-must нет в диапазоне, сборка падает.
"""
import difflib
import html
import pathlib
import re
import sys
import urllib.request

from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import get_lexer_by_name

from course_files import COURSE, SOLUTIONS

SOURCE_CACHE = COURSE / "sources"
SOURCE_REPOS = {
    "flink": ("apache/flink", "release-2.2.1"),
    "kafka": ("apache/flink-connector-kafka", "v5.0.0"),
    "operator": ("apache/flink-kubernetes-operator", "release-1.16.1"),
    "cdc": ("apache/flink-cdc", "release-3.7.0"),
}
LANG_BY_SUFFIX = {
    ".java": "java", ".kts": "kotlin", ".yml": "yaml", ".yaml": "yaml", ".sql": "sql", ".sh": "bash",
    ".json": "json", ".properties": "properties", ".md": "markdown", "": "bash", ".scala": "scala",
}
DIFF_CLASSES = {"+": "diff-add", "-": "diff-del", "@": "diff-hunk"}
COPY_BUTTON = '<button class="copy-btn" type="button">Копировать</button>'


def attributes(tag_text):
    return dict(re.findall(r'data-([a-z]+)="([^"]*)"', tag_text))


def highlighted(source, lang):
    return highlight(source, get_lexer_by_name(lang), HtmlFormatter(nowrap=True, classprefix="pyg-"))


def lang_of(path):
    return LANG_BY_SUFFIX.get(pathlib.Path(path).suffix, "text")


def code_figure(caption_html, body_html, extra_class=""):
    return (f'<figure class="code-file {extra_class}"><figcaption>{caption_html}{COPY_BUTTON}</figcaption>'
            f'<pre><code>{body_html}</code></pre></figure>')


def read_solution(relative_path):
    path = SOLUTIONS / relative_path
    if not path.exists():
        sys.exit(f"Нет файла снапшота: {path}")
    return path.read_text(encoding="utf8")


def slice_lines(text, line_range):
    if not line_range:
        return text
    start, end = (int(n) for n in line_range.split("-"))
    return "\n".join(text.splitlines()[start - 1:end]) + "\n"


def dedent_lines(text):
    lines = text.splitlines()
    margin = min((len(line) - len(line.lstrip()) for line in lines if line.strip()), default=0)
    return "\n".join(line[margin:] for line in lines) + "\n"


def render_code_tag(match):
    attrs = attributes(match.group(0))
    source = slice_lines(read_solution(attrs["code"]), attrs.get("lines"))
    suffix = f" (строки {attrs['lines']})" if attrs.get("lines") else ""
    caption = html.escape(attrs["code"].split("/", 1)[1] + suffix)
    return code_figure(f"<span>{caption}</span>", highlighted(source, lang_of(attrs["code"])))


def diff_line(line):
    css = DIFF_CLASSES.get(line[:1])
    return f'<span class="{css}">{html.escape(line)}</span>' if css else html.escape(line) + "\n"


def render_diff_tag(match):
    before_path, after_path = match.group(1).split()
    before = read_solution(before_path).splitlines() if (SOLUTIONS / before_path).exists() else []
    lines = list(difflib.unified_diff(before, read_solution(after_path).splitlines(), lineterm="", n=3))[2:]
    if not lines:
        sys.exit(f"Пустой diff: {match.group(1)}")
    caption = html.escape("что изменилось в " + after_path.split("/", 1)[1])
    return code_figure(f"<span>{caption}</span>", "".join(diff_line(line) for line in lines))


def render_inline_pre(match):
    attrs_text, body = match.group(1), match.group(2)
    attrs = attributes(attrs_text)
    source = html.unescape(body).strip("\n") + "\n"
    extra = "code-output" if "data-output" in attrs_text else ""
    caption = html.escape(attrs.get("title", attrs.get("lang", "")))
    return code_figure(f"<span>{caption}</span>", highlighted(source, attrs.get("lang", "text")), extra)


def render_translation_code(match):
    attrs = attributes(match.group(1))
    source = slice_lines(read_solution(attrs["code"]), attrs.get("lines"))
    return (f'<div class="translation-code"><span class="translation-label">КОД</span>'
            f'<pre><code>{highlighted(source, lang_of(attrs["code"]))}</code></pre></div>')


def read_upstream_source(repo_key, path):
    """Файл исходников с закреплённого тега. Скачанное лежит в sources/, повторная сборка работает без сети."""
    repo, tag = SOURCE_REPOS[repo_key]
    cached = SOURCE_CACHE / repo_key / path
    if not cached.exists():
        with urllib.request.urlopen(f"https://raw.githubusercontent.com/{repo}/{tag}/{path}", timeout=30) as response:
            content = response.read()
        cached.parent.mkdir(parents=True, exist_ok=True)
        cached.write_bytes(content)
    return cached.read_text(encoding="utf8")


def render_source_tag(match):
    attrs = attributes(match.group(0))
    repo_key, path = attrs["src"].split(":", 1)
    repo, tag = SOURCE_REPOS[repo_key]
    snippet = slice_lines(read_upstream_source(repo_key, path), attrs["lines"])
    if html.unescape(attrs["must"]) not in snippet:
        sys.exit(f"В {path}:{attrs['lines']} нет строки «{attrs['must']}». Проверь номера строк.")
    start, end = attrs["lines"].split("-")
    url = f"https://github.com/{repo}/blob/{tag}/{path}#L{start}-L{end}"
    title = html.escape(f"{repo}@{tag} · {pathlib.Path(path).name}, строки {start}-{end}")
    caption = f'<a href="{url}" target="_blank" rel="noopener">{title}</a>'
    return code_figure(caption, highlighted(dedent_lines(snippet), lang_of(path)), "source-code")


def expand_code(text):
    text = re.sub(r'<div\s+data-src="[^"]*"[^>]*>\s*</div>', render_source_tag, text)
    text = re.sub(r'<div class="translation-code"([^>]*data-code="[^"]*"[^>]*)>\s*</div>', render_translation_code, text)
    text = re.sub(r'<div\s+data-code="[^"]*"[^>]*>\s*</div>', render_code_tag, text)
    text = re.sub(r'<div\s+data-diff="([^"]*)"[^>]*>\s*</div>', render_diff_tag, text)
    return re.sub(r'<pre\s+([^>]*data-lang="[^"]*"[^>]*)>(.*?)</pre>', render_inline_pre, text, flags=re.S)

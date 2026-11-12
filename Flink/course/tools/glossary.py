"""Глоссарий урока: подсказки к первому упоминанию термина на каждой вкладке и общая страница терминов.

  <dl class="glossary"><dt data-match="чекпоинт|checkpoint">Чекпоинт (checkpoint)</dt><dd>...</dd></dl>
  data-match перечисляет основы слова через |. Без него ищется само название термина.
"""
import html
import re

TERM_SKIP_TAGS = {"pre", "code", "a", "h1", "h2", "h3", "h4", "button", "dt", "dd", "dl", "script", "style", "svg", "kbd",
                  "figcaption"}
VOID_TAGS = {"br", "hr", "img", "input", "meta", "link", "source", "line", "circle", "rect", "path", "polygon", "ellipse", "use"}
TAG_NAME = re.compile(r"</?\s*([a-zA-Z0-9-]+)")


def strip_tags(text):
    return re.sub(r"<[^>]+>", "", text)


def glossary_entries(text):
    entries = []
    for dt_attrs, title, definition in re.findall(r"<dt([^>]*)>(.*?)</dt>\s*<dd>(.*?)</dd>", text, flags=re.S):
        match_attr = re.search(r'data-match="([^"]*)"', dt_attrs)
        plain_title = strip_tags(title).strip()
        stems = match_attr.group(1).split("|") if match_attr else [plain_title]
        entries.append({"title": plain_title, "definition": definition.strip(), "stems": stems})
    return entries


def term_pattern(stem):
    """Русская основа ловит любые окончания, латиница ищется целым словом."""
    escaped = re.escape(stem)
    if re.search("[а-яё]$", stem, flags=re.I):
        return rf"(?<![\w-]){escaped}[а-яё]*"
    return rf"(?<![\w-]){escaped}(?![\w])"


def tooltip_span(entry, text):
    definition = html.escape(strip_tags(entry["definition"]), quote=True)
    return f'<span class="term" data-definition="{definition}">{text}</span>'


class TermWrapper:
    """Проходит HTML по токенам и оборачивает первое упоминание каждого термина вне кода, ссылок и заголовков."""

    def __init__(self, entries):
        self.pending = [(e, re.compile("|".join(term_pattern(s) for s in e["stems"]), flags=re.I)) for e in entries]
        self.skip_stack = []

    def wrap(self, panel_html):
        return "".join(self.visit(token) for token in re.split(r"(<[^>]+>)", panel_html))

    def visit(self, token):
        if token.startswith("<"):
            self.track(token)
            return token
        if self.skip_stack or not token.strip():
            return token
        return self.wrap_first_term(token)

    def track(self, token):
        name = TAG_NAME.match(token)
        tag = name.group(1).lower() if name else None
        if not tag or tag in VOID_TAGS or token.endswith("/>"):
            return
        if token.startswith("</"):
            if self.skip_stack and self.skip_stack[-1] == tag:
                self.skip_stack.pop()
        elif tag in TERM_SKIP_TAGS or 'class="term"' in token or self.skip_stack:
            self.skip_stack.append(tag)

    def wrap_first_term(self, token):
        """Один термин на текстовый токен: вложенный термин внутри только что обёрнутого не появится."""
        for pair in self.pending:
            entry, pattern = pair
            found = pattern.search(token)
            if found:
                self.pending.remove(pair)
                return token[:found.start()] + tooltip_span(entry, found.group(0)) + token[found.end():]
        return token


def add_tooltips(panel_html, entries):
    return TermWrapper(entries).wrap(panel_html)


def global_glossary_page(all_entries):
    unique = {}
    for entry in all_entries:
        unique.setdefault(entry["title"].lower(), entry)
    rows = "".join(f'<dt>{e["title"]}</dt><dd>{e["definition"]}</dd>' for _, e in sorted(unique.items()))
    return ('<section class="page" id="glossary"><div class="page-inner">'
            '<h1 class="lesson-title">Общий глоссарий</h1>'
            f'<p class="lesson-lead">Все термины курса, {len(unique)} штук. Определения те же, что во всплывающих подсказках.</p>'
            '<input class="glossary-search" id="glossary-search" type="search" placeholder="Найти термин" aria-label="Поиск по глоссарию">'
            f'<dl class="glossary" id="global-glossary">{rows}</dl></div></section>')

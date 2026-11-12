#!/usr/bin/env python3
"""Проверяет уроки: стиль текста, структуру, ссылки на исходники и документацию.

Запуск из папки course:  python3 tools/lint_prose.py          быстрые проверки
                         python3 tools/lint_prose.py --links  ещё и открывает все внешние ссылки
"""
import json
import re
import sys
import urllib.request

from course_files import TABS, assemble, load_lessons, load_pages

BANNED = ["ключев", "стоит отметить", "важно отметить", "давайте", "погрузимся", "по сути", "на самом деле", "не просто",
          "является ключ", "играет роль", "в современном мире", "таким образом", "итак,"]
NOT_BUT = re.compile(r"\bне\s[^,.;!?]{1,60},\s+а\s|,\s+а\s+не\s", re.I)
REQUIRED_ELEMENTS = {
    "квиз": r'class="quiz-container',
    "блок перевода кода": r'class="translation-block',
    "кнопка ответа": r'class="reveal-answer',
}
MIN_SOURCES = 2
MIN_DOC_LINKS = 2
MIN_GLOSSARY = 8
DOCS_HOST = "nightlies.apache.org/flink"


def prose_of(text):
    text = re.sub(r"<(pre|script|style|svg|code|kbd)\b.*?</\1>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<!--.*?-->", " ", text, flags=re.S)
    text = re.sub(r"<[^>]+>", " ", text).replace("Документация:", " ")
    return re.sub(r"&[a-z]+;", " ", text)


def context(text, index):
    return " ".join(text[max(0, index - 35):index + 35].split())


def style_errors(prose):
    errors = [f"тире «{s.strip()}»: {context(prose, prose.index(s))}" for s in ("—", " – ", " -- ") if s in prose]
    errors += [f"двоеточие в тексте: {context(prose, m.start())}" for m in re.finditer(r"[^\s\d]:(\s|$)", prose)]
    lowered = prose.lower()
    errors += [f"штамп «{w}»: {context(lowered, lowered.index(w))}" for w in BANNED if w in lowered]
    errors += [f"конструкция «не X, а Y»: {context(prose, m.start())}" for m in NOT_BUT.finditer(prose)]
    return errors


def count_errors(text):
    counts = {
        "цитат из исходников": (len(re.findall(r"data-src=", text)), MIN_SOURCES),
        "ссылок на документацию": (len(set(re.findall(rf'href="(https://{re.escape(DOCS_HOST)}[^"]*)"', text))), MIN_DOC_LINKS),
        "терминов в глоссарии": (len(re.findall(r"<dt[ >]", text)), MIN_GLOSSARY),
    }
    return [f"{name} {found}, нужно минимум {need}" for name, (found, need) in counts.items() if found < need]


def steps_errors(text):
    errors = []
    for steps in re.findall(r"data-steps='([^']*)'", text):
        try:
            json.loads(steps)
        except ValueError as error:
            errors.append(f"data-steps не JSON: {error}")
    return errors


def structure_errors(lesson, text):
    errors = [] if tuple(lesson.panels) == TABS else [f"вкладки {list(lesson.panels)}, ожидаются {list(TABS)}"]
    errors += [f"нет элемента: {name}" for name, pattern in REQUIRED_ELEMENTS.items() if not re.search(pattern, text)]
    return errors + count_errors(text) + steps_errors(text)


def duplicate_ids(documents):
    seen, errors = {}, []
    for name, text in documents:
        for element_id in set(re.findall(r'\bid="([^"]+)"', text)):
            if element_id in seen:
                errors.append(f'id="{element_id}" есть в {seen[element_id]} и {name}')
            seen[element_id] = name
    return errors


def broken_links(documents):
    urls = sorted({u for _, text in documents for u in re.findall(r'href="(https?://[^"#]+)', text)})
    errors = []
    for url in urls:
        request = urllib.request.Request(url, headers={"User-Agent": "flink-course-link-check"})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                if response.status >= 400:
                    errors.append(f"{response.status} {url}")
        except Exception as error:  # Любая сетевая ошибка значит, что ссылку надо проверить руками.
            errors.append(f"{error} {url}")
    print(f"Проверено внешних ссылок: {len(urls)}")
    return errors


def main():
    lessons = [(lesson, assemble(lesson.header, lesson.panels)) for lesson in load_lessons()]
    documents = [(lesson.name, text) for lesson, text in lessons] + [(path.name, text) for path, text in load_pages()]
    errors = [f"{name}: {e}" for name, text in documents for e in style_errors(prose_of(text))]
    errors += [f"{lesson.name}: {e}" for lesson, text in lessons for e in structure_errors(lesson, text)]
    errors += duplicate_ids(documents) + (broken_links(documents) if "--links" in sys.argv else [])
    print("\n".join([*errors, f"Файлов: {len(documents)}, замечаний: {len(errors)}"]))
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()

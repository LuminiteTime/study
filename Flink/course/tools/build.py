#!/usr/bin/env python3
"""Собирает course/index.html: страницы, уроки, стили и скрипты в одном файле, который открывается без сервера.

Запуск из папки course:  npm run build  (или python3 tools/build.py)
"""
from code_blocks import expand_code
from course_files import COURSE, assemble, load_lessons, load_pages, read, script_files, style_files, vendor_files
from glossary import add_tooltips, global_glossary_page, glossary_entries


def lesson_html(lesson):
    panels = {tab: expand_code(body) for tab, body in lesson.panels.items()}
    entries = glossary_entries(panels["glossary"])
    panels = {tab: body if tab == "glossary" else add_tooltips(body, entries) for tab, body in panels.items()}
    return assemble(lesson.header, panels), entries


def inline_scripts():
    """Каждый файл отдельным модулем: у модуля своя область видимости, порядок выполнения как в списке."""
    vendor = "".join(f"<script>\n{read(path)}</script>\n" for path in vendor_files())
    return vendor + "".join(f'<script type="module">\n{read(path)}</script>\n' for path in script_files())


def build():
    sections, all_entries = [], []
    sections += [expand_code(text) for _, text in load_pages()]
    lessons = load_lessons()
    for lesson in lessons:
        html, entries = lesson_html(lesson)
        sections.append(html)
        all_entries += entries
    sections.append(global_glossary_page(all_entries))
    page = (read(COURSE / "templates" / "page.html")
            .replace("{styles}", "\n".join(read(path) for path in style_files()))
            .replace("{content}", "\n".join(sections))
            .replace("{scripts}", inline_scripts()))
    (COURSE / "index.html").write_text(page, encoding="utf8")
    viz_count = sum(1 for path in script_files() if path.parent.name == "viz")
    print(f"Собрано уроков: {len(lessons)}, терминов: {len(all_entries)}, визуализаций: {viz_count}")


if __name__ == "__main__":
    build()

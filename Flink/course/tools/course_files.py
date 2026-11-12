"""Где лежат исходники курса и как из папки урока собирается его HTML.

Урок это папка lessons/NN-slug. В _header.html открывающий тег section и шапка, остальные файлы это вкладки.
Длинную вкладку можно разрезать на theory-1.html, theory-2.html и так далее, они склеиваются по порядку имён.
"""
import pathlib
from dataclasses import dataclass

COURSE = pathlib.Path(__file__).resolve().parent.parent
SOLUTIONS = COURSE.parent / "solutions"
LESSONS = COURSE / "lessons"
PAGES = COURSE / "pages"
TABS = ("theory", "practice", "task", "answer", "glossary")
PAGE_ORDER = ("home.html", "spark-to-flink.html")
SCRIPT_ORDER = ("core", "diagram", "progress", "chrome", "widgets", "tooltip", "quiz", "chat", "flow", "router")
# Библиотеки для схем: D3 рисует шкалы и раскладку, GSAP ведёт анимации. Подключаются обычными скриптами до модулей.
VENDOR_SCRIPTS = ("d3/dist/d3.min.js", "gsap/dist/gsap.min.js", "gsap/dist/MotionPathPlugin.min.js")


@dataclass
class Lesson:
    folder: pathlib.Path
    header: str
    panels: dict

    @property
    def name(self):
        return self.folder.name


def read(path):
    return path.read_text(encoding="utf8")


def tab_files(folder, tab):
    return sorted(folder.glob(f"{tab}.html")) or sorted(folder.glob(f"{tab}-*.html"))


def load_lesson(folder):
    panels = {tab: "".join(read(f) for f in tab_files(folder, tab)) for tab in TABS if tab_files(folder, tab)}
    return Lesson(folder, read(folder / "_header.html"), panels)


def load_lessons():
    return [load_lesson(folder) for folder in sorted(LESSONS.glob("[0-9]*/"))]


def load_pages():
    return [(PAGES / name, read(PAGES / name)) for name in PAGE_ORDER]


def assemble(header, panels):
    """Шапка, контейнер вкладок, панели и подвал. Вкладки и подвал наполняет scripts/chrome.js."""
    body = "".join(f'<div class="lesson-panel" data-tab="{tab}">\n{html}</div>\n' for tab, html in panels.items())
    return f'{header}<div class="lesson-tabs" role="tablist"></div>\n{body}<div class="lesson-footer"></div>\n</div></section>\n'


def style_files():
    base = [COURSE / "styles" / name for name in ("tokens.css", "base.css", "layout.css", "lesson.css")]
    return base + sorted((COURSE / "styles" / "components").glob("*.css"))


def vendor_files():
    return [COURSE / "node_modules" / name for name in VENDOR_SCRIPTS]


def script_files():
    return [COURSE / "scripts" / f"{name}.js" for name in SCRIPT_ORDER] + sorted((COURSE / "viz").glob("*.js"))

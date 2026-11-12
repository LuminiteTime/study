#!/usr/bin/env python3
"""Лимиты размера рукописных файлов курса и снапшотов. Большой файл трудно читать и человеку, и модели с ограниченным контекстом.

Не проверяются сгенерированные и чужие файлы: index.html, скачанные исходники Flink, node_modules, сборка Gradle, дашборды Grafana.
"""
import sys

from course_files import COURSE, SOLUTIONS

MAX_LINES = 300
MAX_BYTES = 40_000
CHECKED_SUFFIXES = {".py", ".js", ".css", ".html", ".java", ".kts", ".sh", ".sql", ".yml", ".yaml", ".md", ".properties"}
SKIPPED_PARTS = {"sources", "node_modules", "build", ".gradle", "data", "dashboards"}
GENERATED = {COURSE / "index.html"}


def checked_files():
    for root in (COURSE, SOLUTIONS):
        for path in root.rglob("*"):
            relative = path.relative_to(root).parts
            if path.suffix in CHECKED_SUFFIXES and path.is_file() and path not in GENERATED and not SKIPPED_PARTS & set(relative):
                yield path


def violations(path):
    data = path.read_bytes()
    lines = data.count(b"\n") + (not data.endswith(b"\n") and bool(data))
    found = []
    if lines > MAX_LINES:
        found.append(f"{lines} строк, лимит {MAX_LINES}")
    if len(data) > MAX_BYTES:
        found.append(f"{len(data) // 1000} КБ, лимит {MAX_BYTES // 1000} КБ")
    return found


def main():
    files = list(checked_files())
    errors = [f"{path.relative_to(COURSE.parent)}: {problem}" for path in files for problem in violations(path)]
    print("\n".join([*errors, f"Проверено файлов: {len(files)}, превышений: {len(errors)}"]))
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()

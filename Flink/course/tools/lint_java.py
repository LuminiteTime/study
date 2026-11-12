#!/usr/bin/env python3
"""Checkstyle по коду всех снапшотов solutions/lesson-*/src. Нужна Java 17 в PATH или JAVA_HOME.

Jar скачивается один раз в tools/.cache. Правила лежат рядом, в checkstyle.xml.
"""
import hashlib
import os
import pathlib
import subprocess
import sys
import urllib.request

from course_files import COURSE, SOLUTIONS

VERSION = "12.3.1"
JAR_URL = f"https://github.com/checkstyle/checkstyle/releases/download/checkstyle-{VERSION}/checkstyle-{VERSION}-all.jar"
# Скачанный jar запускается, поэтому сверяем хеш. При смене VERSION обновить и его.
JAR_SHA256 = "4ecdfa8504452e1557d2e2c364085f0ae5703b67ec9c759976ca378d41cb8f7a"
CACHE = COURSE / "tools" / ".cache"
CONFIG = COURSE / "tools" / "checkstyle.xml"


def checkstyle_jar():
    jar = CACHE / f"checkstyle-{VERSION}-all.jar"
    if not jar.exists():
        with urllib.request.urlopen(JAR_URL, timeout=120) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != JAR_SHA256:
            sys.exit(f"Хеш {JAR_URL} не совпал с ожидаемым, jar не сохранён.")
        CACHE.mkdir(parents=True, exist_ok=True)
        jar.write_bytes(data)
    return jar


def java():
    home = os.environ.get("JAVA_HOME")
    return str(pathlib.Path(home) / "bin" / "java") if home else "java"


def main():
    sources = sorted(str(path) for path in SOLUTIONS.glob("lesson-*/src"))
    result = subprocess.run([java(), "-jar", str(checkstyle_jar()), "-c", str(CONFIG), *sources],
                            capture_output=True, text=True, check=False)
    if result.returncode and not result.stdout.strip():
        sys.exit(f"Checkstyle не запустился:\n{result.stderr}")
    problems = [line for line in result.stdout.splitlines() if line.startswith("[")]
    print("\n".join([*problems, f"Снапшотов: {len(sources)}, замечаний Checkstyle: {len(problems)}"]))
    sys.exit(1 if problems or result.returncode else 0)


if __name__ == "__main__":
    main()

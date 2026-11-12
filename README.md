# study.luminais.tech

Открытые курсы для разработчиков. Каждый курс ведёт один проект от первого запуска до прода, объяснения сверены с исходниками и документацией.

Сайт: <https://study.luminais.tech/>

| Курс | Папка | Адрес |
| --- | --- | --- |
| Flink в проде: Apache Flink 2.2 для Java-разработчика, 21 урок | [`Flink/`](Flink) | [/flink/](https://study.luminais.tech/flink/) |

## Устройство репозитория

- `home/` главная страница с каталогом курсов, статика без сборки.
- `Flink/course/` исходники курса: уроки, стили, схемы, сборщик и линтеры. Подробности в `Flink/course/package.json`.
- `Flink/solutions/lesson-NN/` снапшоты проекта PayGuard после каждого урока.
- `.github/workflows/ci.yml` линтеры и сборка на каждый push и pull request, выкладка на GitHub Pages из `main`.

## Сборка курса локально

Нужны Node.js 24, Python 3.12 и Java 17 (только для `lint:java`).

```bash
cd Flink/course
npm ci
python3 -m pip install -r requirements.txt
npm run check      # линтеры и сборка index.html
npm run lint:java  # Checkstyle по снапшотам
```

Собранный `Flink/course/index.html` открывается в браузере без сервера.

## Новый курс

Папка курса кладётся в корень рядом с `Flink/`, в каталог `home/index.html` добавляется строка, в шаг `Assemble site` в CI добавляется копирование собранного курса в `_site/<slug>/`.

## Лицензия

[MIT](LICENSE). В `Flink/course/sources/` лежат фрагменты исходников Apache Flink, коннектора Flink для Kafka, Flink CDC и Flink Kubernetes Operator, на которые ссылаются уроки. Они распространяются под Apache License 2.0, заголовки лицензии сохранены в каждом файле. Курс встраивает [D3](https://d3js.org/) (ISC) и [GSAP](https://gsap.com/) ([стандартная лицензия GSAP](https://gsap.com/standard-license/)).

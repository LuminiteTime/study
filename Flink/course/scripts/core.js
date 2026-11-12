/* Общие помощники. Каждый скрипт курса и каждая схема подключаются отдельным модулем и берут их из window.Course.
   Схемы рисуются через Course.diagram (scripts/diagram.js) поверх D3 и GSAP. */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/** Создаёт HTML-элемент с классом и текстом. */
function html(name, className, text) {
  const node = document.createElement(name);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

window.Course = { $, $$, html };

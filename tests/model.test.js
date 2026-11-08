/**
 * Автоматические проверки модели диаграммы и экспорта BPMN.
 * Запуск: в браузере — tests/index.html; из командной строки —
 *   jsc -e "load('src/model.js'); load('src/bpmn-export.js'); load('tests/model.test.js')"
 *   node tests/run.js
 */
(function (global) {
  'use strict';

  const BPMN = global.BPMN || (typeof require === 'function'
    ? Object.assign({}, require('../src/model.js'), require('../src/bpmn-export.js'))
    : null);
  const { DiagramModel, toBpmnXml } = BPMN;
  const log = typeof print === 'function' ? print : console.log.bind(console);

  const results = [];

  function test(name, fn) {
    try {
      fn();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error: error.message });
    }
  }

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Утверждение не выполнено');
    }
  }

  function assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(`${message || 'Значения не равны'}: ожидалось ${expected}, получено ${actual}`);
    }
  }

  // ---------------------------------------------------------------- тесты модели

  test('T01 Добавление элемента создаёт узел с размерами типа', () => {
    const m = new DiagramModel();
    const node = m.addNode('task', 100, 100, 'Задача 1');
    assertEqual(m.nodes.size, 1, 'Число элементов');
    assertEqual(node.width, 120, 'Ширина задачи');
    assertEqual(node.name, 'Задача 1', 'Название');
  });

  test('T02 Неизвестный тип элемента отклоняется', () => {
    const m = new DiagramModel();
    let thrown = false;
    try {
      m.addNode('pool', 0, 0);
    } catch (e) {
      thrown = true;
    }
    assert(thrown, 'Ожидалось исключение');
  });

  test('T03 Поток между элементами создаётся', () => {
    const m = new DiagramModel();
    const a = m.addNode('startEvent', 0, 0);
    const b = m.addNode('task', 100, 0);
    const flow = m.addFlow(a.id, b.id);
    assert(flow !== null, 'Поток должен быть создан');
    assertEqual(m.flows.size, 1, 'Число потоков');
  });

  test('T04 Петля (элемент сам на себя) запрещена', () => {
    const m = new DiagramModel();
    const a = m.addNode('task', 0, 0);
    assertEqual(m.addFlow(a.id, a.id), null, 'Петля');
  });

  test('T05 Поток из конечного события запрещён', () => {
    const m = new DiagramModel();
    const end = m.addNode('endEvent', 0, 0);
    const t = m.addNode('task', 100, 0);
    assertEqual(m.addFlow(end.id, t.id), null, 'Из endEvent');
  });

  test('T06 Поток в начальное событие запрещён', () => {
    const m = new DiagramModel();
    const start = m.addNode('startEvent', 0, 0);
    const t = m.addNode('task', 100, 0);
    assertEqual(m.addFlow(t.id, start.id), null, 'В startEvent');
  });

  test('T07 Дублирующий поток не создаётся', () => {
    const m = new DiagramModel();
    const a = m.addNode('task', 0, 0);
    const b = m.addNode('task', 100, 0);
    m.addFlow(a.id, b.id);
    assertEqual(m.addFlow(a.id, b.id), null, 'Дубль');
    assertEqual(m.flows.size, 1, 'Число потоков');
  });

  test('T08 Удаление элемента удаляет связанные потоки', () => {
    const m = new DiagramModel();
    const a = m.addNode('startEvent', 0, 0);
    const b = m.addNode('task', 100, 0);
    const c = m.addNode('endEvent', 200, 0);
    m.addFlow(a.id, b.id);
    m.addFlow(b.id, c.id);
    m.removeNode(b.id);
    assertEqual(m.nodes.size, 2, 'Число элементов');
    assertEqual(m.flows.size, 0, 'Потоки удалены каскадно');
  });

  test('T09 Валидация пустой диаграммы — предупреждение', () => {
    const m = new DiagramModel();
    const issues = m.validate();
    assertEqual(issues.length, 1, 'Одно сообщение');
    assertEqual(issues[0].level, 'warn', 'Уровень');
  });

  test('T10 Валидация без конечного события — ошибка', () => {
    const m = new DiagramModel();
    m.addNode('startEvent', 0, 0);
    const issues = m.validate();
    assert(issues.some((i) => i.level === 'error' && /конечное/.test(i.message)), 'Нет ошибки о конечном событии');
  });

  test('T11 Корректная диаграмма проходит валидацию', () => {
    const m = new DiagramModel();
    const a = m.addNode('startEvent', 0, 0);
    const b = m.addNode('task', 100, 0);
    const c = m.addNode('endEvent', 200, 0);
    m.addFlow(a.id, b.id);
    m.addFlow(b.id, c.id);
    const issues = m.validate();
    assertEqual(issues.length, 1, 'Одно сообщение');
    assertEqual(issues[0].level, 'ok', 'Ошибок нет');
  });

  test('T12 Сериализация и восстановление из JSON', () => {
    const m = new DiagramModel();
    const a = m.addNode('startEvent', 10, 20, 'Старт');
    const b = m.addNode('endEvent', 300, 20, 'Финиш');
    m.addFlow(a.id, b.id, 'далее');
    const copy = DiagramModel.fromJSON(JSON.parse(JSON.stringify(m.toJSON())));
    assertEqual(copy.nodes.size, 2, 'Элементы восстановлены');
    assertEqual(copy.flows.size, 1, 'Потоки восстановлены');
    assertEqual(copy.nodes.get(a.id).name, 'Старт', 'Название восстановлено');
  });

  test('T13 Некорректный JSON отклоняется', () => {
    let thrown = false;
    try {
      DiagramModel.fromJSON({ foo: 'bar' });
    } catch (e) {
      thrown = true;
    }
    assert(thrown, 'Ожидалось исключение');
  });

  // ---------------------------------------------------------------- тесты экспорта

  test('T14 Экспорт BPMN XML содержит процесс, элементы и потоки', () => {
    const m = new DiagramModel();
    const a = m.addNode('startEvent', 0, 0, 'Старт');
    const b = m.addNode('userTask', 100, 0, 'Согласовать <документ>');
    const c = m.addNode('endEvent', 200, 0);
    m.addFlow(a.id, b.id);
    m.addFlow(b.id, c.id);
    const xml = toBpmnXml(m);
    assert(xml.startsWith('<?xml'), 'XML-заголовок');
    assert(xml.includes('<bpmn:process id="Process_1"'), 'Элемент process');
    assert(xml.includes('<bpmn:userTask'), 'Пользовательская задача');
    assert(xml.includes('&lt;документ&gt;'), 'Экранирование спецсимволов');
    assert((xml.match(/<bpmn:sequenceFlow /g) || []).length === 2, 'Два потока');
    assert(xml.includes('<bpmndi:BPMNShape'), 'Графическая информация BPMNDI');
    assert(xml.includes('<di:waypoint'), 'Точки потоков');
  });

  // ---------------------------------------------------------------- отчёт

  const passed = results.filter((r) => r.ok).length;
  for (const r of results) {
    log(`${r.ok ? 'OK  ' : 'FAIL'}  ${r.name}${r.ok ? '' : ' — ' + r.error}`);
  }
  log(`Итого: ${passed} из ${results.length} проверок пройдено`);
  global.__testResults = results;
})(typeof window !== 'undefined' ? window : globalThis);

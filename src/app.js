/**
 * Пользовательский интерфейс конструктора BPMN: палитра, холст SVG,
 * панель свойств, сохранение/загрузка и экспорт.
 */
(function () {
  'use strict';

  const { DiagramModel, NODE_TYPES, toBpmnXml, anchorPoint } = window.BPMN;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const STORAGE_KEY = 'bpmn-constructor.diagram';

  const canvas = document.getElementById('canvas');
  const layerNodes = document.getElementById('layer-nodes');
  const layerFlows = document.getElementById('layer-flows');
  const statusEl = document.getElementById('status');

  let model = new DiagramModel();
  let mode = 'select';            // 'select' | 'connect'
  let selected = null;            // { kind: 'node' | 'flow', id }
  let connectSource = null;       // id элемента-источника в режиме соединения
  let dragState = null;           // { id, dx, dy }

  // ------------------------------------------------------------ утилиты

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      el.setAttribute(key, value);
    }
    return el;
  }

  /** Координаты события мыши в системе координат SVG. */
  function canvasPoint(evt) {
    const rect = canvas.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  }

  function snap(value) {
    return Math.round(value / 10) * 10;
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ------------------------------------------------------------ отрисовка

  function shapeFor(node) {
    const w = node.width;
    const h = node.height;
    switch (node.type) {
      case 'startEvent':
        return [svgEl('circle', { cx: 0, cy: 0, r: w / 2, class: 'shape-event' })];
      case 'endEvent':
        return [svgEl('circle', { cx: 0, cy: 0, r: w / 2, class: 'shape-event end' })];
      case 'intermediateEvent':
        return [
          svgEl('circle', { cx: 0, cy: 0, r: w / 2, class: 'shape-event' }),
          svgEl('circle', { cx: 0, cy: 0, r: w / 2 - 4, class: 'shape-event' })
        ];
      case 'task':
        return [svgEl('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 8, class: 'shape-task' })];
      case 'userTask':
        return [
          svgEl('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 8, class: 'shape-task' }),
          svgEl('circle', { cx: -w / 2 + 12, cy: -h / 2 + 11, r: 4, class: 'shape-icon' }),
          svgEl('path', { d: `M ${-w / 2 + 5} ${-h / 2 + 22} q 7 -8 14 0`, class: 'shape-icon' })
        ];
      case 'exclusiveGateway':
      case 'parallelGateway': {
        const half = w / 2;
        const poly = svgEl('polygon', {
          points: `0,${-half} ${half},0 0,${half} ${-half},0`,
          class: 'shape-gateway'
        });
        const sign = svgEl('text', { x: 0, y: 8, class: 'shape-label' });
        sign.textContent = node.type === 'exclusiveGateway' ? '×' : '+';
        return [poly, sign];
      }
      default:
        return [];
    }
  }

  function labelFor(node) {
    const text = svgEl('text', { class: 'label' });
    const isTask = node.type === 'task' || node.type === 'userTask';
    const words = (node.name || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    for (const word of words) {
      if ((current + ' ' + word).trim().length > 16 && current) {
        lines.push(current);
        current = word;
      } else {
        current = (current + ' ' + word).trim();
      }
    }
    if (current) {
      lines.push(current);
    }
    const shown = lines.slice(0, 3);
    const startY = isTask ? -(shown.length - 1) * 7 : node.height / 2 + 14;
    shown.forEach((line, i) => {
      const tspan = svgEl('tspan', { x: 0, y: startY + i * 14 });
      tspan.textContent = line;
      text.appendChild(tspan);
    });
    return text;
  }

  function renderNode(node) {
    const g = svgEl('g', {
      class: 'node',
      'data-id': node.id,
      transform: `translate(${node.x}, ${node.y})`
    });
    for (const shape of shapeFor(node)) {
      g.appendChild(shape);
    }
    g.appendChild(labelFor(node));
    if (selected && selected.kind === 'node' && selected.id === node.id) {
      g.classList.add('selected');
    }
    if (connectSource === node.id) {
      g.classList.add('connect-source');
    }
    return g;
  }

  function renderFlow(flow) {
    const source = model.nodes.get(flow.sourceRef);
    const target = model.nodes.get(flow.targetRef);
    const p1 = anchorPoint(source, target);
    const p2 = anchorPoint(target, source);
    const d = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
    const g = svgEl('g', { class: 'flow', 'data-id': flow.id });
    g.appendChild(svgEl('path', { d, class: 'hit' }));
    g.appendChild(svgEl('path', { d }));
    if (flow.name) {
      const label = svgEl('text', { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 - 6 });
      label.textContent = flow.name;
      g.appendChild(label);
    }
    if (selected && selected.kind === 'flow' && selected.id === flow.id) {
      g.classList.add('selected');
    }
    return g;
  }

  function render() {
    layerNodes.replaceChildren(...[...model.nodes.values()].map(renderNode));
    layerFlows.replaceChildren(...[...model.flows.values()].map(renderFlow));
    renderProperties();
    renderStats();
    renderValidation();
  }

  function renderProperties() {
    const form = document.getElementById('props-form');
    const empty = document.getElementById('props-empty');
    const item = selected
      ? (selected.kind === 'node' ? model.nodes.get(selected.id) : model.flows.get(selected.id))
      : null;
    if (!item) {
      form.classList.add('hidden');
      empty.classList.remove('hidden');
      return;
    }
    form.classList.remove('hidden');
    empty.classList.add('hidden');
    document.getElementById('prop-id').value = item.id;
    document.getElementById('prop-type').value = selected.kind === 'node'
      ? NODE_TYPES[item.type].bpmn
      : 'sequenceFlow';
    document.getElementById('prop-name').value = item.name || '';
    document.getElementById('prop-doc').value = item.documentation || '';
  }

  function renderStats() {
    document.getElementById('stat-nodes').textContent = model.nodes.size;
    document.getElementById('stat-flows').textContent = model.flows.size;
  }

  function renderValidation() {
    const list = document.getElementById('validation');
    list.replaceChildren(...model.validate().map((issue) => {
      const li = document.createElement('li');
      li.className = issue.level;
      li.textContent = issue.message;
      return li;
    }));
  }

  // ------------------------------------------------------------ режимы

  function setMode(newMode) {
    mode = newMode;
    connectSource = null;
    document.getElementById('btn-select').classList.toggle('active', mode === 'select');
    document.getElementById('btn-connect').classList.toggle('active', mode === 'connect');
    canvas.classList.toggle('connect-mode', mode === 'connect');
    setStatus(mode === 'connect'
      ? 'Режим соединения: щёлкните элемент-источник, затем элемент-цель'
      : 'Режим выделения');
    render();
  }

  function select(kind, id) {
    selected = kind ? { kind, id } : null;
    render();
  }

  function deleteSelected() {
    if (!selected) {
      return;
    }
    if (selected.kind === 'node') {
      model.removeNode(selected.id);
    } else {
      model.removeFlow(selected.id);
    }
    selected = null;
    setStatus('Элемент удалён');
    render();
  }

  // ------------------------------------------------------------ палитра (drag & drop)

  document.querySelectorAll('.palette-item').forEach((item) => {
    item.addEventListener('dragstart', (evt) => {
      evt.dataTransfer.setData('text/bpmn-type', item.dataset.type);
      evt.dataTransfer.effectAllowed = 'copy';
    });
  });

  canvas.addEventListener('dragover', (evt) => {
    evt.preventDefault();
    evt.dataTransfer.dropEffect = 'copy';
  });

  canvas.addEventListener('drop', (evt) => {
    evt.preventDefault();
    const type = evt.dataTransfer.getData('text/bpmn-type');
    if (!NODE_TYPES[type]) {
      return;
    }
    const point = canvasPoint(evt);
    const node = model.addNode(type, snap(point.x), snap(point.y));
    select('node', node.id);
    setStatus(`Добавлен элемент ${NODE_TYPES[type].bpmn} (${node.id})`);
  });

  // ------------------------------------------------------------ холст: выделение, перемещение, соединение

  canvas.addEventListener('mousedown', (evt) => {
    const nodeEl = evt.target.closest('.node');
    const flowEl = evt.target.closest('.flow');
    if (nodeEl) {
      const id = nodeEl.dataset.id;
      if (mode === 'connect') {
        if (!connectSource) {
          connectSource = id;
          setStatus('Источник выбран, щёлкните элемент-цель');
          render();
        } else {
          const flow = model.addFlow(connectSource, id);
          setStatus(flow ? `Создан поток ${flow.id}` : 'Такой поток недопустим');
          connectSource = null;
          if (flow) {
            select('flow', flow.id);
          } else {
            render();
          }
        }
        return;
      }
      const node = model.nodes.get(id);
      const point = canvasPoint(evt);
      dragState = { id, dx: point.x - node.x, dy: point.y - node.y, moved: false };
      select('node', id);
    } else if (flowEl) {
      select('flow', flowEl.dataset.id);
    } else {
      connectSource = null;
      select(null);
    }
  });

  canvas.addEventListener('mousemove', (evt) => {
    if (!dragState) {
      return;
    }
    const point = canvasPoint(evt);
    model.moveNode(dragState.id, snap(point.x - dragState.dx), snap(point.y - dragState.dy));
    dragState.moved = true;
    render();
  });

  window.addEventListener('mouseup', () => {
    if (dragState && dragState.moved) {
      setStatus('Элемент перемещён');
    }
    dragState = null;
  });

  canvas.addEventListener('dblclick', (evt) => {
    const nodeEl = evt.target.closest('.node');
    const flowEl = evt.target.closest('.flow');
    const item = nodeEl ? model.nodes.get(nodeEl.dataset.id)
      : flowEl ? model.flows.get(flowEl.dataset.id) : null;
    if (!item) {
      return;
    }
    const name = window.prompt('Название элемента', item.name || '');
    if (name !== null) {
      item.name = name.trim();
      render();
    }
  });

  // ------------------------------------------------------------ панель свойств

  document.getElementById('prop-name').addEventListener('input', (evt) => {
    const item = selected && (selected.kind === 'node'
      ? model.nodes.get(selected.id) : model.flows.get(selected.id));
    if (item) {
      item.name = evt.target.value;
      layerNodes.replaceChildren(...[...model.nodes.values()].map(renderNode));
      layerFlows.replaceChildren(...[...model.flows.values()].map(renderFlow));
      renderValidation();
    }
  });

  document.getElementById('prop-doc').addEventListener('input', (evt) => {
    const item = selected && (selected.kind === 'node'
      ? model.nodes.get(selected.id) : model.flows.get(selected.id));
    if (item) {
      item.documentation = evt.target.value;
    }
  });

  // ------------------------------------------------------------ кнопки панели инструментов

  document.getElementById('btn-select').addEventListener('click', () => setMode('select'));
  document.getElementById('btn-connect').addEventListener('click', () => setMode('connect'));
  document.getElementById('btn-delete').addEventListener('click', deleteSelected);

  document.getElementById('btn-save').addEventListener('click', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(model.toJSON()));
    setStatus('Диаграмма сохранена в localStorage');
  });

  document.getElementById('btn-load').addEventListener('click', () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setStatus('Сохранённая диаграмма не найдена');
      return;
    }
    try {
      model = DiagramModel.fromJSON(JSON.parse(raw));
      selected = null;
      render();
      setStatus('Диаграмма загружена');
    } catch (error) {
      setStatus(`Ошибка загрузки: ${error.message}`);
    }
  });

  document.getElementById('btn-export-xml').addEventListener('click', () => {
    download('diagram.bpmn', toBpmnXml(model), 'application/xml');
    setStatus('Экспортирован файл diagram.bpmn (BPMN 2.0 XML)');
  });

  document.getElementById('btn-export-json').addEventListener('click', () => {
    download('diagram.json', JSON.stringify(model.toJSON(), null, 2), 'application/json');
    setStatus('Экспортирован файл diagram.json');
  });

  document.getElementById('file-import').addEventListener('change', (evt) => {
    const file = evt.target.files[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        model = DiagramModel.fromJSON(JSON.parse(reader.result));
        selected = null;
        render();
        setStatus(`Импортирован файл ${file.name}`);
      } catch (error) {
        setStatus(`Ошибка импорта: ${error.message}`);
      }
    };
    reader.readAsText(file);
    evt.target.value = '';
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (model.nodes.size === 0 || window.confirm('Очистить холст?')) {
      model.clear();
      selected = null;
      render();
      setStatus('Холст очищен');
    }
  });

  // ------------------------------------------------------------ клавиатура

  window.addEventListener('keydown', (evt) => {
    const inField = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
    if (inField) {
      return;
    }
    if (evt.key === 'Delete' || evt.key === 'Backspace') {
      deleteSelected();
    } else if (evt.key.toLowerCase() === 'v') {
      setMode('select');
    } else if (evt.key.toLowerCase() === 'c') {
      setMode('connect');
    } else if (evt.key === 'Escape') {
      connectSource = null;
      select(null);
    }
  });

  // ------------------------------------------------------------ стартовая диаграмма

  function demoDiagram() {
    const start = model.addNode('startEvent', 120, 200, 'Заявка получена');
    const check = model.addNode('userTask', 300, 200, 'Проверить заявку');
    const gateway = model.addNode('exclusiveGateway', 480, 200, 'Корректна?');
    const process = model.addNode('task', 660, 120, 'Обработать заявку');
    const reject = model.addNode('task', 660, 290, 'Отклонить заявку');
    const end = model.addNode('endEvent', 860, 200, 'Процесс завершён');
    model.addFlow(start.id, check.id);
    model.addFlow(check.id, gateway.id);
    model.addFlow(gateway.id, process.id, 'да');
    model.addFlow(gateway.id, reject.id, 'нет');
    model.addFlow(process.id, end.id);
    model.addFlow(reject.id, end.id);
  }

  demoDiagram();
  render();
  setStatus('Готово. Перетащите элементы из палитры на холст');
})();

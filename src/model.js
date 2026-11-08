/**
 * Модель диаграммы BPMN: элементы (узлы) и потоки управления.
 * Модуль не зависит от DOM и может использоваться в тестах (Node.js).
 */
(function (global) {
  'use strict';

  /** Описание поддерживаемых типов элементов BPMN 2.0. */
  const NODE_TYPES = {
    startEvent: { label: 'Начало', bpmn: 'startEvent', width: 36, height: 36 },
    endEvent: { label: 'Конец', bpmn: 'endEvent', width: 36, height: 36 },
    intermediateEvent: { label: 'Событие', bpmn: 'intermediateThrowEvent', width: 36, height: 36 },
    task: { label: 'Задача', bpmn: 'task', width: 120, height: 70 },
    userTask: { label: 'Пользовательская задача', bpmn: 'userTask', width: 120, height: 70 },
    exclusiveGateway: { label: '', bpmn: 'exclusiveGateway', width: 50, height: 50 },
    parallelGateway: { label: '', bpmn: 'parallelGateway', width: 50, height: 50 }
  };

  let counter = 0;

  /** Генерирует уникальный идентификатор элемента с заданным префиксом. */
  function nextId(prefix) {
    counter += 1;
    return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
  }

  class DiagramModel {
    constructor() {
      this.nodes = new Map();
      this.flows = new Map();
      this.processId = 'Process_1';
      this.processName = 'Бизнес-процесс';
    }

    /** Добавляет элемент указанного типа в точку (x, y) — центр элемента. */
    addNode(type, x, y, name) {
      const def = NODE_TYPES[type];
      if (!def) {
        throw new Error(`Неизвестный тип элемента: ${type}`);
      }
      const node = {
        id: nextId(def.bpmn.charAt(0).toUpperCase() + def.bpmn.slice(1)),
        type,
        x: Math.round(x),
        y: Math.round(y),
        width: def.width,
        height: def.height,
        name: name !== undefined ? name : def.label,
        documentation: ''
      };
      this.nodes.set(node.id, node);
      return node;
    }

    /** Соединяет два элемента потоком управления. Возвращает null, если поток недопустим. */
    addFlow(sourceId, targetId, name) {
      if (sourceId === targetId) {
        return null;
      }
      if (!this.nodes.has(sourceId) || !this.nodes.has(targetId)) {
        return null;
      }
      const source = this.nodes.get(sourceId);
      const target = this.nodes.get(targetId);
      if (source.type === 'endEvent' || target.type === 'startEvent') {
        return null; // из конечного события и в начальное событие потоки не ведут
      }
      for (const flow of this.flows.values()) {
        if (flow.sourceRef === sourceId && flow.targetRef === targetId) {
          return null; // такой поток уже существует
        }
      }
      const flow = {
        id: nextId('Flow'),
        sourceRef: sourceId,
        targetRef: targetId,
        name: name || ''
      };
      this.flows.set(flow.id, flow);
      return flow;
    }

    /** Удаляет элемент вместе со связанными потоками. */
    removeNode(id) {
      if (!this.nodes.delete(id)) {
        return false;
      }
      for (const [flowId, flow] of this.flows) {
        if (flow.sourceRef === id || flow.targetRef === id) {
          this.flows.delete(flowId);
        }
      }
      return true;
    }

    removeFlow(id) {
      return this.flows.delete(id);
    }

    moveNode(id, x, y) {
      const node = this.nodes.get(id);
      if (node) {
        node.x = Math.round(x);
        node.y = Math.round(y);
      }
    }

    clear() {
      this.nodes.clear();
      this.flows.clear();
    }

    /** Проверяет модель на типовые ошибки построения BPMN-диаграммы. */
    validate() {
      const issues = [];
      const nodes = [...this.nodes.values()];
      const starts = nodes.filter((n) => n.type === 'startEvent');
      const ends = nodes.filter((n) => n.type === 'endEvent');

      if (nodes.length === 0) {
        issues.push({ level: 'warn', message: 'Диаграмма пуста' });
        return issues;
      }
      if (starts.length === 0) {
        issues.push({ level: 'error', message: 'Отсутствует начальное событие' });
      }
      if (ends.length === 0) {
        issues.push({ level: 'error', message: 'Отсутствует конечное событие' });
      }
      for (const node of nodes) {
        const incoming = [...this.flows.values()].filter((f) => f.targetRef === node.id).length;
        const outgoing = [...this.flows.values()].filter((f) => f.sourceRef === node.id).length;
        if (node.type !== 'startEvent' && incoming === 0) {
          issues.push({ level: 'warn', message: `«${node.name || node.id}»: нет входящих потоков` });
        }
        if (node.type !== 'endEvent' && outgoing === 0) {
          issues.push({ level: 'warn', message: `«${node.name || node.id}»: нет исходящих потоков` });
        }
        if (node.type.endsWith('Gateway') && incoming + outgoing < 3) {
          issues.push({ level: 'warn', message: `Шлюз ${node.id}: менее трёх потоков` });
        }
      }
      if (issues.length === 0) {
        issues.push({ level: 'ok', message: 'Ошибок не обнаружено' });
      }
      return issues;
    }

    toJSON() {
      return {
        version: 1,
        processId: this.processId,
        processName: this.processName,
        nodes: [...this.nodes.values()],
        flows: [...this.flows.values()]
      };
    }

    static fromJSON(data) {
      const model = new DiagramModel();
      if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.flows)) {
        throw new Error('Некорректный формат файла диаграммы');
      }
      model.processId = data.processId || model.processId;
      model.processName = data.processName || model.processName;
      for (const node of data.nodes) {
        if (!NODE_TYPES[node.type]) {
          throw new Error(`Неизвестный тип элемента: ${node.type}`);
        }
        model.nodes.set(node.id, { ...node });
      }
      for (const flow of data.flows) {
        if (model.nodes.has(flow.sourceRef) && model.nodes.has(flow.targetRef)) {
          model.flows.set(flow.id, { ...flow });
        }
      }
      return model;
    }
  }

  const api = { NODE_TYPES, DiagramModel };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.BPMN = Object.assign(global.BPMN || {}, api);
  }
})(typeof window !== 'undefined' ? window : globalThis);

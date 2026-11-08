/**
 * Экспорт модели диаграммы в формат BPMN 2.0 XML (семантика + BPMNDI).
 */
(function (global) {
  'use strict';

  const NODE_TYPES = (typeof module !== 'undefined' && module.exports)
    ? require('./model.js').NODE_TYPES
    : global.BPMN.NODE_TYPES;

  function escapeXml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Точка на границе элемента, ближайшая к центру другого элемента. */
  function anchorPoint(node, towards) {
    const dx = towards.x - node.x;
    const dy = towards.y - node.y;
    const hw = node.width / 2;
    const hh = node.height / 2;
    if (dx === 0 && dy === 0) {
      return { x: node.x, y: node.y };
    }
    const scale = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
    return { x: node.x + dx * scale, y: node.y + dy * scale };
  }

  function toBpmnXml(model) {
    const data = model.toJSON();
    const lines = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push('<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"');
    lines.push('  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"');
    lines.push('  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"');
    lines.push('  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"');
    lines.push('  id="Definitions_1" targetNamespace="http://bpmn-constructor.local/schema">');
    lines.push(`  <bpmn:process id="${escapeXml(data.processId)}" name="${escapeXml(data.processName)}" isExecutable="false">`);

    for (const node of data.nodes) {
      const tag = NODE_TYPES[node.type].bpmn;
      const incoming = data.flows.filter((f) => f.targetRef === node.id);
      const outgoing = data.flows.filter((f) => f.sourceRef === node.id);
      lines.push(`    <bpmn:${tag} id="${escapeXml(node.id)}" name="${escapeXml(node.name)}">`);
      if (node.documentation) {
        lines.push(`      <bpmn:documentation>${escapeXml(node.documentation)}</bpmn:documentation>`);
      }
      for (const f of incoming) {
        lines.push(`      <bpmn:incoming>${escapeXml(f.id)}</bpmn:incoming>`);
      }
      for (const f of outgoing) {
        lines.push(`      <bpmn:outgoing>${escapeXml(f.id)}</bpmn:outgoing>`);
      }
      lines.push(`    </bpmn:${tag}>`);
    }
    for (const flow of data.flows) {
      lines.push(`    <bpmn:sequenceFlow id="${escapeXml(flow.id)}" name="${escapeXml(flow.name)}" `
        + `sourceRef="${escapeXml(flow.sourceRef)}" targetRef="${escapeXml(flow.targetRef)}" />`);
    }
    lines.push('  </bpmn:process>');

    lines.push('  <bpmndi:BPMNDiagram id="BPMNDiagram_1">');
    lines.push(`    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${escapeXml(data.processId)}">`);
    const byId = new Map(data.nodes.map((n) => [n.id, n]));
    for (const node of data.nodes) {
      lines.push(`      <bpmndi:BPMNShape id="${escapeXml(node.id)}_di" bpmnElement="${escapeXml(node.id)}">`);
      lines.push(`        <dc:Bounds x="${node.x - node.width / 2}" y="${node.y - node.height / 2}" `
        + `width="${node.width}" height="${node.height}" />`);
      lines.push('      </bpmndi:BPMNShape>');
    }
    for (const flow of data.flows) {
      const source = byId.get(flow.sourceRef);
      const target = byId.get(flow.targetRef);
      const p1 = anchorPoint(source, target);
      const p2 = anchorPoint(target, source);
      lines.push(`      <bpmndi:BPMNEdge id="${escapeXml(flow.id)}_di" bpmnElement="${escapeXml(flow.id)}">`);
      lines.push(`        <di:waypoint x="${Math.round(p1.x)}" y="${Math.round(p1.y)}" />`);
      lines.push(`        <di:waypoint x="${Math.round(p2.x)}" y="${Math.round(p2.y)}" />`);
      lines.push('      </bpmndi:BPMNEdge>');
    }
    lines.push('    </bpmndi:BPMNPlane>');
    lines.push('  </bpmndi:BPMNDiagram>');
    lines.push('</bpmn:definitions>');
    return lines.join('\n');
  }

  const api = { toBpmnXml, anchorPoint, escapeXml };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.BPMN = Object.assign(global.BPMN || {}, api);
  }
})(typeof window !== 'undefined' ? window : globalThis);

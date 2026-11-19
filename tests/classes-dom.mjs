// React 클라이언트 컴포넌트를 브라우저 없이 돌리기 위한 최소 문서 모형이다.
const elementListeners = new WeakMap();

function listenersOf(node) {
  let list = elementListeners.get(node);
  if (!list) {
    list = new Map();
    elementListeners.set(node, list);
  }
  return list;
}

function ancestorPath(node) {
  const path = [];
  while (node) {
    path.push(node);
    node = node.parentNode;
  }
  return path;
}

function adopt(parent, child) {
  if (child.parentNode) child.parentNode.removeChild(child);
  child.parentNode = parent;
  child.ownerDocument = parent.ownerDocument || parent;
  return child;
}

export function createDomNode(kind, tag = "") {
  const node = {
    nodeType: kind,
    nodeName:
      kind === 1
        ? String(tag).toUpperCase()
        : kind === 3
          ? "#text"
          : "#comment",
    tagName: kind === 1 ? String(tag).toUpperCase() : "",
    namespaceURI: "http://www.w3.org/1999/xhtml",
    ownerDocument: null,
    parentNode: null,
    childNodes: [],
    style: {
      setProperty(name, value) {
        this[name] = value;
      },
      getPropertyValue(name) {
        return this[name] || "";
      },
      removeProperty(name) {
        delete this[name];
      },
    },
    className: "",
    id: "",
    value: "",
    checked: false,
    selected: false,
    defaultSelected: false,
    disabled: false,
    get options() {
      const options = [];
      const visit = (current) => {
        if (current !== this && current.tagName === "OPTION")
          options.push(current);
        for (const child of current.childNodes || []) visit(child);
      };
      visit(this);
      return options;
    },
    type: "",
    name: "",
    tabIndex: 0,
    nodeValue: kind === 1 ? null : "",
    attributes: [],
    get textContent() {
      if (this.nodeType !== 1) return this.nodeValue || "";
      return (this.childNodes || [])
        .map((child) => child.textContent || "")
        .join("");
    },
    set textContent(value) {
      const text = value == null ? "" : String(value);
      if (this.nodeType !== 1) {
        this.nodeValue = text;
        return;
      }
      this.childNodes = [];
      if (!text) return;
      const child = createDomNode(3);
      child.nodeValue = text;
      child.parentNode = this;
      child.ownerDocument = this.ownerDocument;
      this.childNodes.push(child);
    },
    get lastChild() {
      return this.childNodes[this.childNodes.length - 1] || null;
    },
    setAttribute(name, value) {
      const text = String(value);
      const found = this.attributes.find((item) => item.name === name);
      if (found) found.value = text;
      else this.attributes.push({ name, value: text });
      if (name === "id") this.id = text;
      if (name === "class") this.className = text;
      if (name === "value") this.value = text;
      if (name === "type") this.type = text;
      if (name === "name") this.name = text;
      if (name === "disabled") this.disabled = true;
    },
    setAttributeNS(_namespace, name, value) {
      this.setAttribute(name, value);
    },
    getAttribute(name) {
      return this.attributes.find((item) => item.name === name)?.value ?? null;
    },
    removeAttribute(name) {
      this.attributes = this.attributes.filter((item) => item.name !== name);
      if (name === "disabled") this.disabled = false;
    },
    hasAttribute(name) {
      return this.attributes.some((item) => item.name === name);
    },
    appendChild(child) {
      adopt(this, child);
      this.childNodes.push(child);
      return child;
    },
    insertBefore(child, before) {
      adopt(this, child);
      const index = this.childNodes.indexOf(before);
      if (index < 0) this.childNodes.push(child);
      else this.childNodes.splice(index, 0, child);
      return child;
    },
    removeChild(child) {
      const index = this.childNodes.indexOf(child);
      if (index >= 0) this.childNodes.splice(index, 1);
      child.parentNode = null;
      return child;
    },
    addEventListener(type, fn) {
      const map = listenersOf(this);
      const list = map.get(type) || [];
      list.push(fn);
      map.set(type, list);
    },
    removeEventListener(type, fn) {
      const map = listenersOf(this);
      map.set(
        type,
        (map.get(type) || []).filter((item) => item !== fn),
      );
    },
    dispatchEvent(event) {
      event.target = event.target || this;
      event.currentTarget = this;
      event.bubbles = event.bubbles !== false;
      event.cancelable = true;
      event.defaultPrevented = Boolean(event.defaultPrevented);
      event.timeStamp = Date.now();
      event.preventDefault = () => {
        event.defaultPrevented = true;
      };
      event.stopPropagation = () => {
        event._stopped = true;
      };
      const path = ancestorPath(this);
      for (const item of path) {
        if (event._stopped) break;
        event.currentTarget = item;
        for (const fn of listenersOf(item).get(event.type) || []) fn(event);
      }
      return !event.defaultPrevented;
    },
    focus() {
      if (this.ownerDocument) this.ownerDocument.activeElement = this;
    },
    blur() {},
    scrollIntoView() {},
    getBoundingClientRect() {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 100,
        bottom: 44,
        width: 100,
        height: 44,
      };
    },
    contains(other) {
      let current = other;
      while (current) {
        if (current === this) return true;
        current = current.parentNode;
      }
      return false;
    },
    querySelector(selector) {
      return findNode(this, (item) => matches(item, selector));
    },
    querySelectorAll(selector) {
      const found = [];
      walk(this, (item) => {
        if (matches(item, selector)) found.push(item);
      });
      return found;
    },
    get firstChild() {
      return this.childNodes[0] || null;
    },
    get nextSibling() {
      const siblings = this.parentNode?.childNodes || [];
      return siblings[siblings.indexOf(this) + 1] || null;
    },
  };
  return node;
}

function matches(node, selector) {
  if (selector === "button") return node.tagName === "BUTTON";
  if (selector.startsWith("#")) return node.id === selector.slice(1);
  return false;
}

function walk(node, visit) {
  visit(node);
  for (const child of node.childNodes || []) walk(child, visit);
}

function findNode(node, predicate) {
  let found = null;
  walk(node, (item) => {
    if (!found && predicate(item)) found = item;
  });
  return found;
}

export function textOf(node) {
  if (!node) return "";
  if (node.nodeType === 3 || node.nodeType === 8) return node.nodeValue || "";
  return (node.childNodes || []).map(textOf).join("");
}

export function installClassDom() {
  const document = createDomNode(9, "#document");
  document.nodeName = "#document";
  document.tagName = "";
  const html = createDomNode(1, "html");
  const head = createDomNode(1, "head");
  const body = createDomNode(1, "body");
  document.documentElement = html;
  document.head = head;
  document.body = body;
  document.childNodes = [html];
  html.parentNode = document;
  html.ownerDocument = document;
  head.ownerDocument = document;
  body.ownerDocument = document;
  html.childNodes = [head, body];
  head.parentNode = html;
  body.parentNode = html;
  document.activeElement = body;
  document.visibilityState = "visible";
  document.oninput = null;
  document.onchange = null;
  document.onclick = null;
  document.defaultView = null;
  document.createElement = (tag) => {
    const element = createDomNode(1, tag);
    element.ownerDocument = document;
    return element;
  };
  document.createElementNS = (_namespace, tag) => document.createElement(tag);
  document.createTextNode = (value) => {
    const text = createDomNode(3);
    text.nodeValue = String(value);
    text.textContent = text.nodeValue;
    text.ownerDocument = document;
    return text;
  };
  document.createComment = (value) => {
    const comment = createDomNode(8);
    comment.nodeValue = String(value);
    comment.textContent = comment.nodeValue;
    comment.ownerDocument = document;
    return comment;
  };
  document.getElementById = (id) =>
    findNode(
      html,
      (node) => node.id === id || node.getAttribute?.("id") === id,
    );
  document.addEventListener = () => {};
  document.removeEventListener = () => {};
  const window = {
    document,
    navigator: { userAgent: "node" },
    location: {
      href: "http://127.0.0.1/admin/classes",
      origin: "http://127.0.0.1",
      protocol: "http:",
    },
    HTMLElement: class HTMLElement {},
    HTMLIFrameElement: class HTMLIFrameElement {},
    Node: class Node {},
    Event: class Event {},
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    requestAnimationFrame(callback) {
      return setTimeout(() => callback(Date.now()), 0);
    },
    cancelAnimationFrame(id) {
      clearTimeout(id);
    },
    scrollTo() {},
    addEventListener() {},
    removeEventListener() {},
    getSelection: () => null,
  };
  window.window = window;
  window.self = window;
  window.top = window;
  document.defaultView = window;
  const globals = {
    window,
    document,
    HTMLElement: window.HTMLElement,
    Node: window.Node,
    Event: window.Event,
    requestAnimationFrame: window.requestAnimationFrame,
    cancelAnimationFrame: window.cancelAnimationFrame,
    getComputedStyle: window.getComputedStyle,
  };
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  return document;
}

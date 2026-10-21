/**
 * Minimal DOM, just enough to execute the real modules/residents.js in Node.
 *
 * The Residents module manipulates a lot of elements, but every block in
 * setupFormEventListeners() is guarded by an existence check, so the tests only
 * need to build the handful of elements they care about. cloneNode() and
 * replaceChild() behave the way a browser does, which is the whole point: it is
 * the clone-and-replace pattern that once left the file input detached.
 */

const vm = require('node:vm');

class El {
  constructor(tag, id) {
    this.tagName = tag;
    this.id = id || '';
    this.parentNode = null;
    this.children = [];
    this._handlers = {};
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.files = null;
    this.type = '';
    this.clickCount = 0;
    this.src = '';
    this.disabled = false;
    this.onerror = null;
    this._classes = new Set();
    const self = this;
    this.classList = {
      add(...names) { names.forEach((n) => self._classes.add(n)); },
      remove(...names) { names.forEach((n) => self._classes.delete(n)); },
      contains(name) { return self._classes.has(name); },
    };
  }

  get className() {
    return Array.from(this._classes).join(' ');
  }

  set className(value) {
    this._classes = new Set(String(value).split(/\s+/).filter(Boolean));
  }

  cloneNode() {
    const copy = new El(this.tagName, this.id);
    copy.value = this.value;
    copy.textContent = this.textContent;
    copy.innerHTML = this.innerHTML;
    copy.type = this.type;
    copy.src = this.src;
    copy.disabled = this.disabled;
    copy._classes = new Set(this._classes);
    return copy;
  }

  appendChild(node) {
    node.parentNode = this;
    this.children.push(node);
    return node;
  }

  replaceChild(node, oldNode) {
    const index = this.children.indexOf(oldNode);
    if (index === -1) throw new Error('replaceChild: node is not a child');
    this.children.splice(index, 1, node);
    node.parentNode = this;
    oldNode.parentNode = null; // the original is now detached
    return oldNode;
  }

  addEventListener(type, handler) {
    (this._handlers[type] || (this._handlers[type] = [])).push(handler);
  }

  dispatch(type) {
    const event = { target: this };
    (this._handlers[type] || []).slice().forEach((handler) => handler.call(this, event));
  }

  click() {
    // A detached input never opens a file picker. This is the browser rule the
    // bug depended on, so model it: only a connected element can be opened.
    if (!this.isConnected) return;
    this.clickCount += 1;
    this.dispatch('click');
  }

  get isConnected() {
    let node = this;
    while (node) {
      if (node === root) return true;
      node = node.parentNode;
    }
    return false;
  }
}

let root = new El('document');

function walk(node, out) {
  if (node.id) out.push(node);
  node.children.forEach((child) => walk(child, out));
  return out;
}

const document = {
  getElementById: (id) => walk(root, []).find((el) => el.id === id) || null,
  addEventListener: () => {},
  createElement: (tag) => new El(tag),
};

/**
 * Build a document containing the photo controls of both the Register and the
 * Edit Resident forms, laid out as siblings the way the markup does.
 */
function createDom() {
  root = new El('document');

  const registerWrap = new El('div', 'registerPhoto');
  root.appendChild(registerWrap);
  registerWrap.appendChild(new El('button', 'chooseFileBtn'));
  registerWrap.appendChild(new El('span', 'fileName'));
  const photoUpload = new El('input', 'photoUpload');
  photoUpload.type = 'file';
  registerWrap.appendChild(photoUpload);
  registerWrap.appendChild(new El('div', 'photoPlaceholder'));

  const editWrap = new El('div', 'editPhoto');
  root.appendChild(editWrap);
  editWrap.appendChild(new El('img', 'editAvatar'));
  const editPhotoUpload = new El('input', 'editPhotoUpload');
  editPhotoUpload.type = 'file';
  editWrap.appendChild(editPhotoUpload);
  editWrap.appendChild(new El('button', 'replacePhotoBtn'));

  return { root, document, photoUpload, editPhotoUpload };
}

/** The View Resident page fields window.viewResident() writes to. */
const VIEW_FIELDS = [
  'viewResidentView', 'residentsListView', 'addResidentView', 'editResidentView',
  'exportResidentsView', 'viewResidentId', 'viewFullName', 'viewPurok', 'viewStatusBadge', 'viewAvatar',
  'viewFirstName', 'viewMiddleName', 'viewLastName', 'viewSuffix', 'viewBirthDate',
  'viewAge', 'viewGender', 'viewCivilStatus', 'viewBirthPlace', 'viewOccupation',
  'viewNationality', 'viewVoterStatus', 'viewResidentStatus', 'viewHouseNo',
  'viewStreet', 'viewPurokDetail', 'viewMobile', 'viewEmail', 'viewEmergencyPerson',
  'viewEmergencyRelation', 'viewEmergencyContact', 'editFromViewBtn',
];

/**
 * Build a document containing the View Resident page, matching the ids and
 * element kinds used by modules/resisdents.html.
 */
function createViewDom() {
  root = new El('document');

  const container = new El('div', 'viewResidentContainer');
  root.appendChild(container);

  for (const id of VIEW_FIELDS) {
    const tag = id === 'viewAvatar' ? 'img' : (id === 'editFromViewBtn' ? 'button' : 'div');
    container.appendChild(new El(tag, id));
  }

  return { root, document, container };
}

/**
 * Evaluate a source file in a sandbox that exposes the shim, and return the
 * sandbox so tests can reach the module's functions.
 */
function loadModule(source, { alerts = [], fetch: fetchImpl } = {}) {
  const sandbox = {
    document,
    console,
    alert: (message) => alerts.push(String(message)),
    // Resolves synchronously; the caller awaits a tick for the promise chain.
    FileReader: class {
      readAsDataURL(file) {
        this.result = file.__dataUrl;
        this.onload({ target: this });
      }
    },
    setTimeout: (fn) => fn(),
    fetch: fetchImpl || (() => Promise.resolve({ ok: false })),
    URLSearchParams,
    Promise, Date, Math, JSON, Object, Array, String, Number, RegExp, Error,
    encodeURIComponent,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'resisdents.js' });

  if (typeof sandbox.setupFormEventListeners !== 'function') {
    throw new Error('setupFormEventListeners() is not reachable in the sandbox');
  }
  return sandbox;
}

module.exports = { createDom, createViewDom, loadModule, El, VIEW_FIELDS };

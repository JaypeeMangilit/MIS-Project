/**
 * Regression tests for the Residents photo controls.
 *
 *   node --test tests/
 *
 * These exist because the "Choose File" button silently stopped opening the file
 * picker: the handler captured the original input, which setupFormEventListeners()
 * then detached with replaceChild(), and clicking a detached input does nothing.
 * The resident was saved with no photo and nothing appeared to fail.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createDom, loadModule } = require('./mini-dom');

// The live module is modules/resisdents.js (sidebar.js loads that file).
// modules/residents.js is a stale duplicate that the browser never executes, so
// tests must not default to it.
const MODULE = process.env.RESIDENTS_JS || path.resolve(__dirname, '..', 'modules', 'resisdents.js');
const source = fs.readFileSync(MODULE, 'utf8');

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Wire up the module and call setupFormEventListeners(), as initResidentsModule() does. */
function setup() {
  const dom = createDom();
  const alerts = [];
  const sandbox = loadModule(source, { alerts });
  sandbox.setupFormEventListeners();
  return { dom, alerts, live: (id) => dom.document.getElementById(id) };
}

test('Choose File opens the file input that is in the DOM', () => {
  const { dom, live } = setup();
  const original = dom.photoUpload;              // the element as built, before the clone
  const liveInput = live('photoUpload');

  assert.ok(live('chooseFileBtn'), 'Choose File button should be wired');
  assert.ok(liveInput.isConnected, 'the live input should be in the DOM');
  assert.equal(original.isConnected, false, 'the original should have been detached by the clone-and-replace');
  assert.notEqual(liveInput, original, 'the live input should be the replacement, not the original');

  live('chooseFileBtn').click();

  assert.equal(liveInput.clickCount, 1, 'the button must open the live input');
  assert.equal(original.clickCount, 0, 'the button must not open the detached original');
});

test('a detached file input cannot open the picker', () => {
  const { dom, live } = setup();
  const detached = dom.photoUpload;

  assert.equal(detached.isConnected, false, 'the original is detached after the clone-and-replace');

  const before = live('photoUpload').clickCount;
  detached.click();

  assert.equal(detached.clickCount, 0, 'a detached input never opens the picker');
  assert.equal(live('photoUpload').clickCount, before, 'clicking the detached original must not open the live picker');
});

test('Replace resident photo opens the file input that is in the DOM', () => {
  const { dom, live } = setup();
  const original = dom.editPhotoUpload;
  const liveInput = live('editPhotoUpload');

  assert.ok(live('replacePhotoBtn'), 'Replace resident photo button should be wired');
  assert.ok(liveInput.isConnected, 'the live edit input should be in the DOM');
  assert.equal(original.isConnected, false, 'the original should have been detached by the clone-and-replace');
  assert.notEqual(liveInput, original, 'the live edit input should be the replacement, not the original');

  live('replacePhotoBtn').click();

  assert.equal(liveInput.clickCount, 1, 'the button must open the live edit input');
  assert.equal(original.clickCount, 0, 'the button must not open the detached original');
});

test('a valid PNG is read as base64, previewed and named', async () => {
  const { live } = setup();
  const input = live('photoUpload');

  input.files = [
    { name: 'resident.png', type: 'image/png', size: 70, __dataUrl: 'data:image/png;base64,VALIDPNG' },
  ];
  input.dispatch('change');
  await tick();

  assert.match(live('photoPlaceholder').innerHTML, /data:image\/png;base64,VALIDPNG/,
    'the chosen photo should be previewed');
  assert.equal(live('fileName').textContent, 'resident.png',
    'the chosen file name should be shown');
});

test('a GIF is rejected, the control cleared and the preview reset', async () => {
  const { live, alerts } = setup();
  const input = live('photoUpload');

  input.files = [{ name: 'resident.gif', type: 'image/gif', size: 43, __dataUrl: 'data:image/gif;base64,BAD' }];
  input.dispatch('change');
  await tick();

  assert.ok(alerts.some((a) => /Accepted formats/.test(a)), 'the rejection should be reported');
  assert.equal(input.value, '', 'the control should be cleared so a bad file cannot be submitted');
  assert.match(live('photoPlaceholder').innerHTML, /Upload Photo/,
    'the preview should fall back to the placeholder');
});

test('a PNG larger than 2MB is rejected', async () => {
  const { live, alerts } = setup();
  const input = live('photoUpload');

  input.files = [
    { name: 'big.png', type: 'image/png', size: 3 * 1024 * 1024, __dataUrl: 'data:image/png;base64,BIG' },
  ];
  input.dispatch('change');
  await tick();

  assert.ok(alerts.some((a) => /Accepted formats/.test(a)), 'an oversize photo should be reported');
});

test('the module source keeps the photo controls wired to the live elements', () => {
  // Guards against the clone-and-replace pattern reintroducing a stale reference.
  assert.match(source, /newChooseFileBtn\.addEventListener\('click', \(\) => newPhotoUpload\.click\(\)\)/,
    'the register button must open newPhotoUpload, not the detached original');
  assert.match(source, /newReplaceBtn\.addEventListener\('click', \(\) => newEditPhotoUpload\.click\(\)\)/,
    'the edit button must open newEditPhotoUpload, not the detached original');
});

test('the API persists a photo only after the row is written', () => {
  const api = fs.readFileSync(path.resolve(__dirname, '..', 'api', 'residents.php'), 'utf8');
  const postAt = api.indexOf("case 'POST'");
  const putAt = api.indexOf("case 'PUT'");
  assert.ok(postAt !== -1 && putAt !== -1, 'both cases should be present');

  const postCase = api.slice(postAt, putAt);
  const insertAt = postCase.indexOf('insertRecord($insertSql');
  const storeAt = postCase.indexOf('storeResidentPhoto($photoPayload)');

  assert.ok(insertAt !== -1 && storeAt !== -1, 'the POST case should insert then store');
  assert.ok(insertAt < storeAt,
    'the photo must be written to disk only after the row is inserted');
  assert.ok(!/INSERT INTO residents \([^)]*profile_image/s.test(postCase),
    'profile_image must not be written in the same statement that creates the row');

  const putCase = api.slice(putAt);
  const updateAt = putCase.indexOf('executeStatement($sql, $params');
  const putStoreAt = putCase.indexOf('storeResidentPhoto($photoPayload)');
  assert.ok(updateAt !== -1 && putStoreAt !== -1, 'the PUT case should update then store');
  assert.ok(updateAt < putStoreAt,
    'the photo must be written to disk only after the row is updated');
});

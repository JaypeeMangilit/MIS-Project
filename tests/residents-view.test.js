/**
 * Regression tests for the View Resident page (modules/resisdents.js).
 *
 *   node --test tests/
 *
 * The page is opened by the eye icon in the residents table, which calls
 * window.viewResident(id). These tests drive that function directly and assert
 * on the fields it writes, so the page is checked against the live module
 * rather than the stale modules/residents.js copy.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { createViewDom, loadModule, VIEW_FIELDS } = require('./mini-dom');

const MODULE = process.env.RESIDENTS_JS || path.resolve(__dirname, '..', 'modules', 'resisdents.js');
const source = fs.readFileSync(MODULE, 'utf8');
const markup = fs.readFileSync(path.resolve(__dirname, '..', 'modules', 'resisdents.html'), 'utf8');

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A resident as the API returns it: id as a string, age already derived. */
const RESIDENT = {
  id: '7',
  first_name: 'Maria',
  middle_name: 'Santos',
  last_name: 'Dela Cruz',
  suffix: 'Jr',
  birth_date: '1995-03-15',
  age: 31,
  gender: 'Female',
  civil_status: 'Single',
  place_of_birth: 'Quezon City',
  occupation: 'Public School Teacher',
  nationality: 'Filipino',
  voter_status: 'Registered',
  resident_status: 'Active',
  house_no: '12',
  street_name: 'Mabini Street',
  purok: 'Purok 1',
  mobile_number: '09171234567',
  email: 'maria.delacruz@example.com',
  emergency_person: 'Juan Dela Cruz',
  emergency_relation: 'Spouse',
  emergency_contact: '09181234567',
  profile_image: 'uploads/residents/maria.png',
};

/** Build the View page and a module sandbox whose fetch returns `payload`. */
function viewPage(payload, { ok = true } = {}) {
  const dom = createViewDom();
  const alerts = [];
  const sandbox = loadModule(source, {
    alerts,
    fetch: () => Promise.resolve({ ok, json: () => Promise.resolve(payload) }),
  });
  return { dom, alerts, sandbox, live: (id) => dom.document.getElementById(id) };
}

test('the view page writes the stored photo to the avatar', async () => {
  const { sandbox, live } = viewPage(RESIDENT);

  await sandbox.viewResident(7);
  await tick();

  assert.equal(live('viewAvatar').src, 'uploads/residents/maria.png',
    'the avatar should show the resident\'s stored photo');
});

test('a resident without a photo falls back to the local default avatar', async () => {
  const resident = { ...RESIDENT, profile_image: null };
  const { sandbox, live } = viewPage(resident);

  await sandbox.viewResident(7);
  await tick();

  assert.equal(live('viewAvatar').src, 'Images/Anoymous.jpg',
    'a resident with no photo should show the default avatar');
});

test('a broken default avatar falls back to an inline silhouette', async () => {
  const resident = { ...RESIDENT, profile_image: null };
  const { sandbox, live } = viewPage(resident);

  await sandbox.viewResident(7);
  await tick();

  // Simulate the default avatar file failing to load.
  live('viewAvatar').onerror();

  assert.match(live('viewAvatar').src, /^data:image\/svg\+xml/,
    'a missing default avatar should be replaced by an inline placeholder');
  assert.equal(live('viewAvatar').onerror, null,
    'the error handler must not loop');
});

test('the view page shows the API-derived age', async () => {
  const { sandbox, live } = viewPage(RESIDENT);

  await sandbox.viewResident(7);
  await tick();

  assert.equal(live('viewAge').textContent, '31 years old',
    'the age returned by the API should be displayed');
});

test('a resident with no stored age falls back to the local calculation', async () => {
  const resident = { ...RESIDENT, age: null };
  const { sandbox, live } = viewPage(resident);

  await sandbox.viewResident(7);
  await tick();

  const expected = new Date().getFullYear() - 1995;
  assert.equal(live('viewAge').textContent, `${expected} years old`,
    'age should still be shown when the stored value is null');
});

test('every field matches the resident that was requested', async () => {
  const { sandbox, live } = viewPage(RESIDENT);

  await sandbox.viewResident(7);
  await tick();

  const expected = {
    viewFullName: 'Dela Cruz, Maria S.',
    viewFirstName: 'Maria',
    viewMiddleName: 'Santos',
    viewLastName: 'Dela Cruz',
    viewSuffix: 'Jr',
    viewGender: 'Female',
    viewCivilStatus: 'Single',
    viewBirthPlace: 'Quezon City',
    viewOccupation: 'Public School Teacher',
    viewNationality: 'Filipino',
    viewVoterStatus: 'Registered',
    viewResidentStatus: 'Active',
    viewHouseNo: '12',
    viewStreet: 'Mabini Street',
    viewPurokDetail: 'Purok 1',
    viewMobile: '09171234567',
    viewEmail: 'maria.delacruz@example.com',
    viewEmergencyPerson: 'Juan Dela Cruz',
    viewEmergencyRelation: 'Spouse',
    viewEmergencyContact: '09181234567',
  };

  for (const [id, value] of Object.entries(expected)) {
    assert.equal(live(id).textContent, value, `#${id} should show the resident's data`);
  }

  assert.equal(live('viewPurok').textContent, 'Purok 1 • Mabini Street',
    'the summary should show purok and street');
  assert.equal(live('viewStatusBadge').textContent, 'Active Resident');
  assert.equal(live('viewResidentView').classList.contains('active'), true,
    'the view page should become the active view');
});

test('missing optional fields render as a placeholder, not blank', async () => {
  const sparse = {
    id: '9', first_name: 'Juan', last_name: 'Dela Cruz',
    birth_date: '1991-08-14', gender: 'Male', resident_status: 'Active',
  };
  const { sandbox, live } = viewPage(sparse);

  await sandbox.viewResident(9);
  await tick();

  for (const id of ['viewMiddleName', 'viewSuffix', 'viewEmail', 'viewOccupation', 'viewEmergencyPerson']) {
    assert.equal(live(id).textContent, '—', `#${id} should show the placeholder`);
  }
});

test('a failed lookup reports the error instead of failing silently', async () => {
  const { sandbox, live, alerts } = viewPage({ success: false, offline: true }, { ok: false });

  await sandbox.viewResident(404);
  await tick();

  assert.equal(live('viewFullName').textContent, 'Resident not found');
  assert.ok(alerts.some((a) => /Unable to load this resident/.test(a)),
    'the failure should be reported to the user');
});

test('the edit button is re-enabled once the record has loaded', async () => {
  const { sandbox, live } = viewPage(RESIDENT);

  await sandbox.viewResident(7);
  await tick();

  assert.equal(live('editFromViewBtn').disabled, false,
    'the edit button should be usable after the record loads');
});

test('the markup carries the layout hooks the stylesheet needs', () => {
  for (const hook of ['card-personal', 'card-address', 'card-emergency']) {
    assert.ok(markup.includes(hook), `the markup should mark the ${hook} card`);
  }
  assert.ok(!markup.includes('placehold.co'),
    'the avatar should not depend on an external placeholder service');
  for (const id of VIEW_FIELDS) {
    assert.ok(markup.includes(`id="${id}"`), `the markup should contain #${id}`);
  }
});

test('the live module is the one sidebar.js loads', () => {
  const sidebar = fs.readFileSync(path.resolve(__dirname, '..', 'sidebar.js'), 'utf8');
  const residents = sidebar.match(/residents:\s*\{[\s\S]*?\}/);
  assert.ok(residents, 'sidebar.js should configure a residents module');
  assert.match(residents[0], /scriptFile:\s*'modules\/resisdents\.js'/,
    'the live module must be resisdents.js');
});

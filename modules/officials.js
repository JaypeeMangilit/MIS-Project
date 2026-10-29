// officials.js - Barangay Officials, backed by brgy49_db (barangay_officials).
//
// The list, the search box, the term filter, the Add form and the Edit form all
// read and write through api/officials.php. There is no in-memory sample data.
// Archive moves a row to archived_barangay_officials; it never deletes it.
//
// Wrapped in an IIFE on purpose: the sidebar router re-injects this file on every
// visit, and a second top-level const/let would throw "Identifier ... has already
// been declared" so the whole script would never run (see sidebar.js).

(function () {
    'use strict';

    const API_URL = 'api/officials.php';

    // State
    let currentFilters = { search: '', termStart: '', status: '', position: '' };
    let currentView = 'list';        // 'list' | 'form'
    let editingId = null;            // null = Add, otherwise the id being edited
    let officialsCache = [];         // last rows loaded, used to prefill the Edit form
    let termOptions = [];
    let newPhotoBase64 = null;       // only set when a new file is chosen
    let searchTimer = null;
    let pendingEditId = null;        // id waiting behind the Confirm Edit dialog
    function canEditOfficial() {
        return window.currentUserCanEdit !== false;
    }

    // ------------------------------------------------------------------
    // API
    // ------------------------------------------------------------------
    async function apiCall(query, options) {
        const config = Object.assign({ headers: { 'Content-Type': 'application/json' } }, options || {});
        let response;
        try {
            response = await fetch(API_URL + (query || ''), config);
        } catch (networkError) {
            throw new Error('Could not reach the server. Check that it is running and try again.');
        }

        const text = await response.text();
        let payload;
        try {
            payload = text ? JSON.parse(text) : {};
        } catch (parseError) {
            throw new Error('The server returned an unexpected response (' + response.status + ').');
        }

        if (payload.success === false) {
            throw new Error(payload.message || 'The request could not be completed.');
        }
        if (!response.ok) {
            throw new Error('The request failed (' + response.status + ').');
        }
        return payload;
    }

    // ------------------------------------------------------------------
    // Init
    // ------------------------------------------------------------------
    function initOfficialsModule() {
        currentView = 'list';
        currentFilters = { search: '', termStart: '' };
        editingId = null;
        newPhotoBase64 = null;

        showListView();
        setupEventListeners();
        setupFormEventListeners();
        setupModalClose();
        updateFilterButtonLabel();
        loadTermOptions();

        if (window.applyModuleReadOnly) {
            window.applyModuleReadOnly({
                addBtnId: 'addOfficialBtn',
                saveBtnIds: ['saveOfficialBtn'],
                editSelectors: ['.action-btn[onclick*="editOfficial"]'],
            });
        }
    }

    function setupEventListeners() {
        // Search - debounced, so typing does not fire a request per keystroke.
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            const freshSearch = searchInput.cloneNode(true);
            searchInput.parentNode.replaceChild(freshSearch, searchInput);
            freshSearch.value = currentFilters.search;
            freshSearch.addEventListener('input', function (e) {
                const typed = e.target.value;
                clearTimeout(searchTimer);
                searchTimer = setTimeout(function () {
                    currentFilters.search = typed.trim();
                    loadOfficialsGrid();
                }, 300);
            });
        }

        // Filter by term
        // The two list filters and the batch archive dropdown.
        const statusFilterBtn = document.getElementById('statusFilterBtn');
        if (statusFilterBtn) {
            statusFilterBtn.addEventListener('click', toggleStatusDropdown);
        }

        const positionFilterBtn = document.getElementById('positionFilterBtn');
        if (positionFilterBtn) {
            positionFilterBtn.addEventListener('click', togglePositionDropdown);
        }

        const batchArchiveBtn = document.getElementById('batchArchiveBtn');
        if (batchArchiveBtn) {
            batchArchiveBtn.addEventListener('click', toggleBatchArchiveDropdown);
        }

        // Close any open dropdown when clicking elsewhere.
        document.addEventListener('click', function (event) {
            if (event.target.closest && event.target.closest('.dropdown-anchor')) return;
            document.querySelectorAll('.term-dropdown.open').forEach(function (open) {
                open.classList.remove('open');
            });
        });

        const filterBtn = document.getElementById('filterBtn');
        if (filterBtn) {
            const freshFilterBtn = filterBtn.cloneNode(true);
            filterBtn.parentNode.replaceChild(freshFilterBtn, filterBtn);
            freshFilterBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                toggleTermDropdown();
            });
        }

        // Clicking anywhere else closes whichever toolbar dropdown is open
        document.addEventListener('click', function (e) {
            [['termDropdown', '#filterBtn'], ['exportDropdown', '#exportBtn']].forEach(function (pair) {
                const dropdown = document.getElementById(pair[0]);
                if (!dropdown || !dropdown.classList.contains('open')) return;
                if (dropdown.contains(e.target)) return;
                if (e.target.closest && e.target.closest(pair[1])) return;
                dropdown.classList.remove('open');
            });
        });

        // Add official
        const addBtn = document.getElementById('addOfficialBtn');
        if (addBtn) {
            const freshAddBtn = addBtn.cloneNode(true);
            addBtn.parentNode.replaceChild(freshAddBtn, addBtn);
            freshAddBtn.addEventListener('click', function () {
                if (!canEditOfficial()) {
                    notify('You do not have permission to add officials.');
                    return;
                }
                showOfficialForm(null);
            });
        }

        // Export List
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            const freshExportBtn = exportBtn.cloneNode(true);
            exportBtn.parentNode.replaceChild(freshExportBtn, exportBtn);
            freshExportBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                toggleExportDropdown();
            });
        }
    }

    /**
     * Term length for an Elected official, in years.
     *
     * A 4-year term starting 2023-07-01 ends 2026-06-30 - four years less one day, so
     * the end date never overlaps the start of the next term.
     */
    const ELECTED_TERM_YEARS = 4;

    /**
     * Term End Date for an Elected official: Term Start Date plus the term length, less
     * one day.
     *
     * The minus-one-day is deliberate and matches the data already in the table
     * (2023-07-01 -> 2026-06-30): a term ends the day before its anniversary, so it never
     * overlaps the start of the next term.
     *
     * The day is clamped for shorter months, so 2024-02-29 + 4 years becomes 2028-02-28
     * rather than rolling into March.
     *
     * @return string|null YYYY-MM-DD, or null when the input is not a valid date.
     */
    function addYears(dateString, years) {
        const raw = String(dateString || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;

        const parts = raw.split('-').map(Number);
        const year = parts[0] + years;
        const month = parts[1];
        const day = parts[2];

        // Clamp to the last real day of the target month.
        const lastDay = new Date(year, month, 0).getDate();
        const clampedDay = Math.min(day, lastDay);

        // Back off one day from the anniversary.
        const end = new Date(year, month - 1, clampedDay);
        end.setDate(end.getDate() - 1);

        const mm = String(end.getMonth() + 1).padStart(2, '0');
        const dd = String(end.getDate()).padStart(2, '0');

        return end.getFullYear() + '-' + mm + '-' + dd;
    }

    /**
     * Fill Term End Date from Term Start Date when the type is Elected.
     *
     * Only runs on user interaction, never while the Edit form is being populated, so a
     * stored term is never overwritten by a recalculation.
     */
    function syncTermEnd() {
        const typeField = document.getElementById('officialType');
        const startField = document.getElementById('termStart');
        const endField = document.getElementById('termEnd');
        if (!typeField || !startField || !endField) return;

        if ((typeField.value || 'Elected') !== 'Elected') return;
        if (!startField.value) return;

        endField.value = addYears(startField.value, ELECTED_TERM_YEARS);
    }

    function setupFormEventListeners() {
        ['backToListBtn', 'cancelAddBtn'].forEach(function (id) {
            const btn = document.getElementById(id);
            if (!btn) return;
            const fresh = btn.cloneNode(true);
            btn.parentNode.replaceChild(fresh, btn);
            fresh.addEventListener('click', function () {
                showListView();
            });
        });

        const saveBtn = document.getElementById('saveOfficialBtn');
        if (saveBtn) {
            const freshSave = saveBtn.cloneNode(true);
            saveBtn.parentNode.replaceChild(freshSave, saveBtn);
            freshSave.addEventListener('click', function () {
                saveOfficial();
            });
        }

        // Term End Date follows Term Start Date for an Elected official (4 years).
        const termStartField = document.getElementById('termStart');
        if (termStartField) {
            termStartField.addEventListener('change', syncTermEnd);
        }

        // Age follows Birthdate, so it is recomputed on both change and input.
        const birthdateField = document.getElementById('birthdate');
        if (birthdateField) {
            birthdateField.addEventListener('change', syncOfficialAge);
            birthdateField.addEventListener('input', syncOfficialAge);
        }

        const moveInDateField = document.getElementById('moveInDate');
        const lengthOfResidenceField = document.getElementById('lengthOfResidence');
        if (moveInDateField && lengthOfResidenceField) {
            const freshMoveIn = moveInDateField.cloneNode(true);
            moveInDateField.parentNode.replaceChild(freshMoveIn, moveInDateField);
            freshMoveIn.addEventListener('change', function () {
                lengthOfResidenceField.value = calculateLengthOfResidence(this.value);
            });
        }

        const officialTypeField = document.getElementById('officialType');
        if (officialTypeField) {
            officialTypeField.addEventListener('change', function () {
                // Switching to Elected fills the term end; switching to Appointed
                // leaves whatever the user entered alone.
                if ((officialTypeField.value || 'Elected') === 'Elected') {
                    syncTermEnd();
                }
            });
        }

        // Status option buttons (Active / Inactive)
        document.querySelectorAll('.status-option-new, .status-option').forEach(function (btn) {
            const fresh = btn.cloneNode(true);
            btn.parentNode.replaceChild(fresh, btn);
            fresh.addEventListener('click', function () {
                document.querySelectorAll('.status-option-new, .status-option').forEach(function (b) {
                    b.classList.remove('active');
                });
                fresh.classList.add('active');
                const statusField = document.getElementById('officialStatus');
                if (statusField) statusField.value = fresh.getAttribute('data-status');
            });
        });

        // Photo upload
        const uploadBtn = document.getElementById('uploadPhotoBtn');
        if (uploadBtn) {
            const freshUploadBtn = uploadBtn.cloneNode(true);
            uploadBtn.parentNode.replaceChild(freshUploadBtn, uploadBtn);
            freshUploadBtn.addEventListener('click', function () {
                const input = document.getElementById('photoUpload');
                if (input) input.click();
            });
        }

        const photoUpload = document.getElementById('photoUpload');
        if (photoUpload) {
            const freshPhotoUpload = photoUpload.cloneNode(true);
            photoUpload.parentNode.replaceChild(freshPhotoUpload, photoUpload);
            freshPhotoUpload.addEventListener('change', function () {
                const file = this.files && this.files[0];
                if (!file) {
                    newPhotoBase64 = null;
                    renderPhotoPlaceholder(null);
                    return;
                }
                if (file.size > 2 * 1024 * 1024) {
                    this.value = '';
                    alert('The photo must be 2MB or smaller.');
                    return;
                }
                const reader = new FileReader();
                reader.onload = function (event) {
                    newPhotoBase64 = event.target.result;
                    renderPhotoPlaceholder(newPhotoBase64);
                };
                reader.readAsDataURL(file);
            });
        }
    }

    function setupModalClose() {
        document.querySelectorAll('.modal-close').forEach(function (btn) {
            const fresh = btn.cloneNode(true);
            btn.parentNode.replaceChild(fresh, btn);
            fresh.addEventListener('click', function () {
                document.querySelectorAll('.modal').forEach(function (modal) {
                    modal.classList.remove('active');
                });
            });
        });

        // Confirm Edit dialog: Yes, Edit / Cancel / clicking the backdrop
        const confirmEditBtn = document.getElementById('confirmEditBtn');
        if (confirmEditBtn) {
            const freshConfirm = confirmEditBtn.cloneNode(true);
            confirmEditBtn.parentNode.replaceChild(freshConfirm, confirmEditBtn);
            freshConfirm.addEventListener('click', function () {
                proceedWithEdit();
            });
        }

        const cancelEditConfirmBtn = document.getElementById('cancelEditConfirmBtn');
        if (cancelEditConfirmBtn) {
            const freshCancel = cancelEditConfirmBtn.cloneNode(true);
            cancelEditConfirmBtn.parentNode.replaceChild(freshCancel, cancelEditConfirmBtn);
            freshCancel.addEventListener('click', function () {
                closeEditConfirmModal();
            });
        }

        const editConfirmModal = document.getElementById('editConfirmModal');
        if (editConfirmModal && !editConfirmModal.dataset.bound) {
            // Bound once: initOfficialsModule runs again on every visit.
            editConfirmModal.dataset.bound = '1';
            editConfirmModal.addEventListener('click', function (e) {
                if (e.target === editConfirmModal) closeEditConfirmModal();
            });
        }
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------
    function showListView() {
        currentView = 'list';
        editingId = null;

        const listView = document.getElementById('officialsListView');
        const formView = document.getElementById('addOfficialView');
        const breadcrumb = document.getElementById('breadcrumb');
        const pageTitle = document.getElementById('pageTitle');

        if (listView) listView.classList.add('active');
        if (formView) formView.classList.remove('active');
        if (breadcrumb) breadcrumb.textContent = 'Barangay Officials';
        if (pageTitle) pageTitle.textContent = 'Barangay Officials';

        loadOfficialsGrid();
    }

    /** official = null opens the Add form, a row opens the Edit form prefilled. */
    function showOfficialForm(official) {
        currentView = 'form';
        editingId = official ? String(official.id) : null;

        const listView = document.getElementById('officialsListView');
        const formView = document.getElementById('addOfficialView');
        const breadcrumb = document.getElementById('breadcrumb');
        const pageTitle = document.getElementById('pageTitle');
        const saveLabel = document.getElementById('saveOfficialBtnLabel');
        const bannerTitle = document.getElementById('formBannerTitle');
        const bannerText = document.getElementById('formBannerText');

        if (listView) listView.classList.remove('active');
        if (formView) formView.classList.add('active');

        if (official) {
            if (breadcrumb) breadcrumb.textContent = 'Barangay Officials / Edit Official';
            if (pageTitle) pageTitle.textContent = 'Edit Official';
            if (saveLabel) saveLabel.textContent = 'Update Official Record';
            if (bannerTitle) bannerTitle.textContent = 'Edit Official Record';
            if (bannerText) bannerText.textContent = 'Update the details for ' + displayName(official) +
                ' — designation, contact details and committee chairmanship.';
            fillForm(official);
        } else {
            if (breadcrumb) breadcrumb.textContent = 'Barangay Officials / Add New Official';
            if (pageTitle) pageTitle.textContent = 'Add New Official';
            if (saveLabel) saveLabel.textContent = 'Save Official Record';
            if (bannerTitle) bannerTitle.textContent = 'Register Elected or Appointed Official';
            if (bannerText) bannerText.textContent = 'Add a new official to the barangay directory, including their designation, contact details, and committee chairmanship.';
            resetForm();
        }
    }

    function fillForm(official) {
        resetForm();

        setValue('firstName', official.first_name);
        setValue('middleName', official.middle_name);
        setValue('lastName', official.last_name);
        setValue('suffix', official.suffix);
        setValue('gender', official.gender);
        setValue('birthdate', toDateInput(official.birth_date));
        syncOfficialAge();
        // A position saved before the form was narrowed must still display its real
        // value rather than a blank, so it is added as a temporary option.
        const positionSelect = document.getElementById('position');
        if (positionSelect && official.position) {
            const hasOption = Array.prototype.some.call(positionSelect.options, function (option) {
                return option.value === official.position;
            });
            if (!hasOption) {
                const option = document.createElement('option');
                option.value = official.position;
                option.textContent = official.position + ' (current)';
                positionSelect.appendChild(option);
            }
        }
        setValue('position', official.position);
        setValue('committee', official.committee);
        setValue('termStart', toDateInput(official.term_start));
        setValue('termEnd', toDateInput(official.term_end));
        setValue('mobile', official.mobile_number);
        setValue('email', official.email);
        setValue('address', official.address);
        setValue('moveInDate', toDateInput(official.move_in_date));
        setValue('lengthOfResidence', calculateLengthOfResidence(toDateInput(official.move_in_date)));
        setValue('officialType', official.official_type || 'Elected');

        const status = official.status || 'Active';
        const statusField = document.getElementById('officialStatus');
        if (statusField) statusField.value = status;
        document.querySelectorAll('.status-option-new, .status-option').forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-status') === status);
        });

        if (official.profile_image) {
            renderPhotoPlaceholder(official.profile_image);
        }
    }

    function setValue(id, value) {
        const field = document.getElementById(id);
        if (field) field.value = value === null || value === undefined ? '' : value;
    }

    /**
     * Age in whole years for a "YYYY-MM-DD" birth date, or null when the date is
     * empty, impossible, or still in the future.
     *
     * Completed years only: the year is dropped by one when this year's birthday has
     * not happened yet. Mirrors residentAgeFromBirthDate() in api/residents.php.
     */
    function calculateAgeFromBirthDate(birthDate) {
        const raw = String(birthDate || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;

        const parts = raw.split('-').map(Number);
        const birth = new Date(parts[0], parts[1] - 1, parts[2]);
        // Reject impossible dates such as 2001-02-30, which Date would roll over.
        if (birth.getFullYear() !== parts[0] || birth.getMonth() !== parts[1] - 1 || birth.getDate() !== parts[2]) {
            return null;
        }

        var today = new Date();
        if (birth.getTime() > today.getTime()) return null;

        var age = today.getFullYear() - birth.getFullYear();
        var monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        return age;
    }

    function calculateLengthOfResidence(moveInDate) {
        if (!moveInDate) return 'Not provided';
        const today = new Date();
        const start = new Date(moveInDate);
        if (isNaN(start.getTime()) || start > today) return 'Not provided';
        let years = today.getFullYear() - start.getFullYear();
        let months = today.getMonth() - start.getMonth();
        let days = today.getDate() - start.getDate();
        if (days < 0) {
            months--;
            const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
            days += prevMonth.getDate();
        }
        if (months < 0) {
            years--;
            months += 12;
        }
        if (years < 0) return 'Not provided';
        if (years === 0 && months === 0 && days === 0) return 'Today';
        const parts = [];
        if (years > 0) parts.push(years + ' year' + (years !== 1 ? 's' : ''));
        if (months > 0) parts.push(months + ' month' + (months !== 1 ? 's' : ''));
        if (days > 0) parts.push(days + ' day' + (days !== 1 ? 's' : ''));
        return parts.join(' and ');
    }

    /** Recompute the read-only Age box from the Birthdate box. */
    function syncOfficialAge() {
        const field = document.getElementById('age');
        if (!field) return;
        const age = calculateAgeFromBirthDate(value('birthdate'));
        field.value = age === null ? '' : String(age);
    }

    /**
     * A read-only dropdown that displays a value straight from the database.
     *
     * Used on the list cards and the View page, where the status and the position
     * are shown but must not be changed. `disabled` keeps the browser from opening
     * it and from submitting it.
     */
    function readOnlySelect(name, value, options) {
        const attrs = ' name="' + name + '" disabled readonly aria-label="'
            + name.replace(/_/g, ' ') + '"';
        let html = '<select' + attrs + '>';
        options.forEach(function (option) {
            const selected = option === value ? ' selected' : '';
            html += '<option value="' + escapeHtml(option) + '"' + selected + '>'
                + escapeHtml(option) + '</option>';
        });
        return html + '</select>';
    }

    /**
     * The position options the form offers, plus the positions saved before the form
     * was narrowed. The read-only dropdowns have to list every value that can be in
     * the database, or a legacy record would silently display the wrong option.
     */
    const OFFICIAL_POSITION_OPTIONS = [
        'Secretary', 'Captain', 'Councilor/Kagawad',
        'Punong Barangay', 'Barangay Kagawad', 'SK Chairman',
        'Barangay Secretary', 'Barangay Treasurer'
    ];

    /** Status options, matching $OFFICIAL_STATUSES in the API. */
    const OFFICIAL_STATUS_OPTIONS = ['Active', 'Inactive'];

    /**
     * Batch archive. The dropdown lists every official currently in the grid; ticking
     * boxes picks the ones to archive, and the button moves them all in one go.
     */
    let batchSelection = [];

    function renderBatchArchiveDropdown() {
        const dropdown = document.getElementById('batchArchiveDropdown');
        if (!dropdown) return;

        const rows = officialsCache || [];
        if (rows.length === 0) {
            dropdown.innerHTML = '<div class="term-empty">No officials to archive</div>';
            return;
        }

        const allChecked = batchSelection.length === rows.length;
        let html = '<label class="batch-option batch-option-all">' +
                   '<input type="checkbox" id="batchSelectAll"' + (allChecked ? ' checked' : '') + '> ' +
                   '<span>Select all (' + rows.length + ')</span></label>';

        html += rows.map(function (official) {
            const checked = batchSelection.indexOf(String(official.id)) !== -1 ? ' checked' : '';
            return '<label class="batch-option">' +
                   '<input type="checkbox" class="batch-checkbox" data-id="' + official.id + '"' + checked + '> ' +
                   '<span>' + escapeHtml(displayName(official)) + '</span>' +
                   '<em>' + escapeHtml(official.position || '') + '</em>' +
                   '</label>';
        }).join('');

        html += '<button type="button" class="batch-apply" id="batchArchiveApply"' +
                (batchSelection.length === 0 ? ' disabled' : '') + '>Archive selected (0)</button>';

        dropdown.innerHTML = html;

        const applyBtn = document.getElementById('batchArchiveApply');
        const syncApply = function () {
            if (!applyBtn) return;
            applyBtn.textContent = 'Archive selected (' + batchSelection.length + ')';
            applyBtn.disabled = batchSelection.length === 0;
        };

        const selectAll = document.getElementById('batchSelectAll');
        if (selectAll) {
            selectAll.addEventListener('change', function () {
                batchSelection = selectAll.checked ? rows.map(function (o) { return String(o.id); }) : [];
                renderBatchArchiveDropdown();
            });
        }

        dropdown.querySelectorAll('.batch-checkbox').forEach(function (box) {
            box.addEventListener('change', function () {
                const id = box.getAttribute('data-id');
                const at = batchSelection.indexOf(id);
                if (box.checked && at === -1) batchSelection.push(id);
                if (!box.checked && at !== -1) batchSelection.splice(at, 1);
                syncApply();
            });
        });

        if (applyBtn) {
            applyBtn.addEventListener('click', function () {
                archiveSelected(batchSelection);
            });
        }
    }

    function toggleBatchArchiveDropdown() {
        const dropdown = document.getElementById('batchArchiveDropdown');
        if (!dropdown) return;
        const wasOpen = dropdown.classList.contains('open');
        closeAllDropdowns();
        if (!wasOpen) {
            renderBatchArchiveDropdown();
            dropdown.classList.add('open');
        }
    }

    /** Archive every id in the list, one request each, reporting what happened. */
    async function archiveSelected(ids) {
        if (!ids || ids.length === 0) {
            alert('Select at least one official to archive.');
            return;
        }

        const names = (officialsCache || []).filter(function (o) {
            return ids.indexOf(String(o.id)) !== -1;
        }).map(function (o) { return displayName(o); });

        if (!confirm('Archive ' + ids.length + ' official(s)?\n\n' + names.join('\n') +
                     '\n\nEach record is moved to the archive and can be restored from there.')) {
            return;
        }

        let done = 0;
        let failed = 0;
        for (let i = 0; i < ids.length; i++) {
            try {
                const result = await apiCall('?id=' + encodeURIComponent(ids[i]), { method: 'DELETE' });
                if (result && result.success) done++; else failed++;
            } catch (error) {
                failed++;
            }
        }

        batchSelection = [];
        alert(failed === 0
            ? done + ' official(s) archived.'
            : done + ' archived, ' + failed + ' failed.');
        loadOfficialsGrid();
    }

    /** Age as it appears on the list card. */
    function ageLabel(official) {
        const age = calculateAgeFromBirthDate(toDateInput(official.birth_date));
        return age === null ? 'Age: —' : 'Age: ' + age;
    }

    /** SQL Server returns dates as "2023-07-01 00:00:00.0000000". */
    function toDateInput(value) {
        if (!value) return '';
        return String(value).substring(0, 10);
    }

    function resetForm() {
        document.querySelectorAll('#addOfficialView input, #addOfficialView select').forEach(function (input) {
            if (input.type !== 'file') input.value = '';
        });

        // Age is derived, so it is emptied along with the Birthdate it came from.
        const ageField = document.getElementById('age');
        if (ageField) ageField.value = '';

        // Remove any "(current)" option added while editing a legacy position.
        const positionSelect = document.getElementById('position');
        if (positionSelect) {
            Array.prototype.slice.call(positionSelect.options).forEach(function (option) {
                if (option.textContent.indexOf('(current)') !== -1) {
                    positionSelect.removeChild(option);
                }
            });
        }

        document.querySelectorAll('.status-option-new, .status-option').forEach(function (btn) {
            btn.classList.remove('active');
            if (btn.getAttribute('data-status') === 'Active') btn.classList.add('active');
        });
        const statusField = document.getElementById('officialStatus');
        if (statusField) statusField.value = 'Active';

        const typeField = document.getElementById('officialType');
        if (typeField) typeField.value = 'Elected';

        const photoUpload = document.getElementById('photoUpload');
        if (photoUpload) photoUpload.value = '';
        newPhotoBase64 = null;
        renderPhotoPlaceholder(null);

        document.querySelectorAll('#addOfficialView .form-group-new, #addOfficialView .form-group').forEach(function (group) {
            group.classList.remove('error');
            const errorMsg = group.querySelector('.error-message');
            if (errorMsg) errorMsg.remove();
        });
    }

    function renderPhotoPlaceholder(source) {
        const placeholder = document.getElementById('photoPlaceholder');
        if (!placeholder) return;

        if (source) {
            placeholder.innerHTML = '<img src="' + escapeHtml(source) + '" alt="Official photo preview">';
            return;
        }

        placeholder.innerHTML =
            '<svg width="32" height="32" viewBox="0 0 32 32" fill="none">' +
            '<circle cx="16" cy="16" r="12" stroke="#5F7385" stroke-width="2"/>' +
            '<path d="M16 12V20M12 16H20" stroke="#5F7385" stroke-width="2" stroke-linecap="round"/>' +
            '</svg>';
    }

    // ------------------------------------------------------------------
    // Grid
    // ------------------------------------------------------------------
    async function loadOfficialsGrid() {
        const grid = document.getElementById('officialsGrid');
        if (grid) {
            grid.innerHTML = '<div class="no-results">Loading officials...</div>';
        }

        const params = new URLSearchParams();
        if (currentFilters.search) params.set('search', currentFilters.search);
        if (currentFilters.termStart) params.set('term_start', currentFilters.termStart);
        if (currentFilters.status) params.set('status', currentFilters.status);
        if (currentFilters.position) params.set('position', currentFilters.position);

        try {
            const query = params.toString();
            const result = await apiCall(query ? '?' + query : '');
            officialsCache = Array.isArray(result.data) ? result.data : [];
            renderOfficialsGrid(officialsCache);

            // The term-expiry sweep runs server-side on this read, so it can move rows
            // out of the list without anybody clicking Archive. Say so when it does.
            const autoArchived = Array.isArray(result.auto_archived) ? result.auto_archived : [];
            if (autoArchived.length > 0) {
                const names = autoArchived.map(function (official) {
                    return official.name + ' (' + official.official_id + ')';
                }).join(', ');

                alert(
                    'Term ended - automatically archived ' + autoArchived.length +
                    ' official' + (autoArchived.length === 1 ? '' : 's') + ':\n\n' +
                    names + '\n\nTheir records were moved to the archive table.'
                );
            }
        } catch (error) {
            officialsCache = [];
            if (grid) {
                grid.innerHTML = '<div class="no-results">' + escapeHtml(error.message) + '</div>';
            }
        }
    }

    function renderOfficialsGrid(officials) {
        const grid = document.getElementById('officialsGrid');
        if (!grid) return;

        if (!officials || officials.length === 0) {
            grid.innerHTML = '<div class="no-results">No officials found</div>';
            return;
        }

        grid.innerHTML = officials.map(function (official) {
            const name = displayName(official);
            const avatar = official.profile_image
                ? '<img src="' + escapeHtml(official.profile_image) + '" alt="' + escapeHtml(name) + '">'
                : escapeHtml(initials(official));
            const status = official.status || 'Active';

            return '' +
                '<div class="official-card">' +
                    '<div class="status-badge ' + status.toLowerCase() + '">' + escapeHtml(status) + '</div>' +
                    '<div class="avatar-container">' +
                        '<div class="official-avatar">' + avatar + '</div>' +
                    '</div>' +
                    '<div class="official-name">' + escapeHtml(name) + '</div>' +
                    '<div class="official-position">' + escapeHtml(official.position || '') + '</div>' +
                    '<div class="official-term">' +
                        '<img src="Images/Term_Icon.svg" alt="Calendar" class="term-icon-img">' +
                        '<span class="term-label">Term:</span>' +
                        '<span class="term-text">' + escapeHtml(termLabel(official)) + '</span>' +
                    '</div>' +
                    '<div class="official-residence">' +
                        '<span class="residence-text">' + escapeHtml(calculateLengthOfResidence(toDateInput(official.move_in_date))) + '</span>' +
                    '</div>' +
                    '<div class="official-contact">' +
                        '<div class="contact-item">' +
                            '<img src="Images/Contact_Icon.svg" alt="Phone" class="contact-icon-img">' +
                            '<span class="contact-text">' + escapeHtml(official.mobile_number || '—') + '</span>' +
                        '</div>' +
                        '<div class="contact-item">' +
                            '<img src="Images/Email_Icon.svg" alt="Email" class="contact-icon-img">' +
                            '<span class="contact-text">' + escapeHtml(official.email || '—') + '</span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="card-actions">' +
                        (canEditOfficial() ? '<button class="action-btn edit" onclick="window.editOfficial(' + official.id + ')">Edit</button>' : '') +
                        '<button class="action-btn archive" onclick="window.archiveOfficial(' + official.id + ')">Archive</button>' +
                    '</div>' +
                '</div>';
        }).join('');
    }

    /** "Hon. Roberto Santos" for elected officials, "Elena Valdez" for appointed ones. */
    function displayName(official) {
        let name = [official.first_name, official.last_name].filter(Boolean).join(' ');
        if (official.suffix) name += ' ' + official.suffix;
        if ((official.official_type || 'Elected') === 'Elected') {
            name = 'Hon. ' + name;
        }
        return name.trim();
    }

    /** "2023 - 2026" for elected officials, "Appointed: 2023" for appointed ones. */
    function termLabel(official) {
        const start = toDateInput(official.term_start);
        const end = toDateInput(official.term_end);
        const startYear = start ? start.substring(0, 4) : '';
        const endYear = end ? end.substring(0, 4) : '';

        if ((official.official_type || 'Elected') === 'Appointed') {
            return startYear ? 'Appointed: ' + startYear : 'Appointed';
        }
        if (startYear && endYear) return startYear + ' - ' + endYear;
        return startYear || endYear || '—';
    }

    /** Longhand date as shown on the View page, e.g. "January 1, 2026". */
    function longDate(value) {
        const raw = toDateInput(value);
        if (!raw) return '';
        const parts = raw.split('-').map(Number);
        const date = new Date(parts[0], parts[1] - 1, parts[2]);
        if (isNaN(date.getTime())) return raw;
        return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }

    /** Term with the specific month and date, e.g. "January 1, 2026 - December 31, 2029". */
    function termDateLabel(official) {
        const start = longDate(official.term_start);
        const end = longDate(official.term_end);
        if ((official.official_type || 'Elected') === 'Appointed') {
            return start ? 'Appointed: ' + start : 'Appointed';
        }
        if (start && end) return start + ' - ' + end;
        return start || end || '—';
    }

    function initials(official) {
        const combined = ((official.first_name || '').charAt(0) + (official.last_name || '').charAt(0)).toUpperCase();
        return combined || 'NA';
    }

    // ------------------------------------------------------------------
    // Term filter
    // ------------------------------------------------------------------
    async function loadTermOptions() {
        try {
            const result = await apiCall('?terms=1');
            termOptions = Array.isArray(result.data) ? result.data : [];
        } catch (error) {
            termOptions = [];
        }
        renderTermDropdown();
    }

    function renderTermDropdown() {
        const dropdown = document.getElementById('termDropdown');
        if (!dropdown) return;

        let html = '<button type="button" class="term-option' + (currentFilters.termStart ? '' : ' active') +
                   '" data-term="">All Terms</button>';

        if (termOptions.length === 0) {
            html += '<div class="term-empty">No terms recorded yet</div>';
        } else {
            html += termOptions.map(function (term) {
                const active = String(term.term_start) === String(currentFilters.termStart) ? ' active' : '';
                return '<button type="button" class="term-option' + active + '" data-term="' +
                       escapeHtml(term.term_start) + '">' + escapeHtml(term.label) + '</button>';
            }).join('');
        }

        dropdown.innerHTML = html;

        dropdown.querySelectorAll('.term-option').forEach(function (option) {
            option.addEventListener('click', function () {
                currentFilters.termStart = option.getAttribute('data-term') || '';
                updateFilterButtonLabel();
                dropdown.classList.remove('open');
                loadOfficialsGrid();
            });
        });
    }

    function toggleTermDropdown() {
        const dropdown = document.getElementById('termDropdown');
        if (!dropdown) return;
        const wasOpen = dropdown.classList.contains('open');
        closeAllDropdowns();
        if (!wasOpen) {
            renderTermDropdown();
            dropdown.classList.add('open');
        }
    }

    function toggleStatusDropdown() {
        const dropdown = document.getElementById('statusDropdown');
        if (!dropdown) return;
        const wasOpen = dropdown.classList.contains('open');
        closeAllDropdowns();
        if (!wasOpen) {
            renderListFilter('statusDropdown', 'All Statuses', currentFilters.status,
                OFFICIAL_STATUS_FILTERS, 'status');
            dropdown.classList.add('open');
        }
    }

    function togglePositionDropdown() {
        const dropdown = document.getElementById('positionDropdown');
        if (!dropdown) return;
        const wasOpen = dropdown.classList.contains('open');
        closeAllDropdowns();
        if (!wasOpen) {
            renderListFilter('positionDropdown', 'All Positions', currentFilters.position,
                OFFICIAL_POSITION_FILTERS, 'position');
            dropdown.classList.add('open');
        }
    }

    /** Options for the two list filters. */
    const OFFICIAL_STATUS_FILTERS = ['Active', 'Inactive'];
    const OFFICIAL_POSITION_FILTERS = [
        'Secretary', 'Captain', 'Councilor/Kagawad',
        'Punong Barangay', 'Barangay Kagawad', 'SK Chairman',
        'Barangay Secretary', 'Barangay Treasurer'
    ];

    /**
     * Render one of the list filter dropdowns. Both work exactly like the term
     * dropdown: an "All ..." entry plus one entry per value.
     *
     * @param {string} dropdownId  the dropdown element
     * @param {string} allLabel    label for the unfiltered entry
     * @param {string} current     the active filter value ('' = unfiltered)
     * @param {string[]} options   every value the database can hold
     * @param {string} dataAttr    attribute carrying the value on each button
     */
    function renderListFilter(dropdownId, allLabel, current, options, dataAttr) {
        const dropdown = document.getElementById(dropdownId);
        if (!dropdown) return;

        let html = '<button type="button" class="term-option' + (current ? '' : ' active') +
                   '" data-' + dataAttr + '="">' + escapeHtml(allLabel) + '</button>';
        html += options.map(function (option) {
            const active = option === current ? ' active' : '';
            return '<button type="button" class="term-option' + active + '" data-' + dataAttr + '="' +
                   escapeHtml(option) + '">' + escapeHtml(option) + '</button>';
        }).join('');

        dropdown.innerHTML = html;

        dropdown.querySelectorAll('.term-option').forEach(function (btn) {
            btn.addEventListener('click', function () {
                dropdown.classList.remove('open');
                applyListFilter(dataAttr, btn.getAttribute('data-' + dataAttr));
            });
        });
    }

    /** Store a filter value, relabel its button and reload the grid. */
    function applyListFilter(kind, value) {
        if (kind === 'status') currentFilters.status = value;
        if (kind === 'position') currentFilters.position = value;
        updateFilterButtonLabel();
        loadOfficialsGrid();
    }

    /** Show the status / position filter values on their buttons. */
    function updateFilterButtonLabel() {
        const termLabel = document.querySelector('#filterBtn span');
        if (termLabel) {
            if (!currentFilters.termStart) {
                termLabel.textContent = 'Filter by Term';
            } else {
                const match = termOptions.filter(function (term) {
                    return String(term.term_start) === String(currentFilters.termStart);
                })[0];
                termLabel.textContent = match ? match.label : 'Filter by Term';
            }
        }

        const statusLabel = document.querySelector('#statusFilterBtn span');
        if (statusLabel) {
            statusLabel.textContent = currentFilters.status
                ? 'Status: ' + currentFilters.status
                : 'Filter by Status';
        }

        const positionLabel = document.querySelector('#positionFilterBtn span');
        if (positionLabel) {
            positionLabel.textContent = currentFilters.position
                ? 'Position: ' + currentFilters.position
                : 'Filter by Position';
        }
    }

    // ------------------------------------------------------------------
    // Save (Add and Edit)
    // ------------------------------------------------------------------
    async function saveOfficial() {
        const payload = {
            first_name: value('firstName'),
            middle_name: value('middleName'),
            last_name: value('lastName'),
            suffix: value('suffix'),
            gender: value('gender'),
            birth_date: value('birthdate'),
            position: value('position'),
            committee: value('committee'),
            term_start: value('termStart'),
            term_end: value('termEnd'),
            mobile_number: value('mobile'),
            email: value('email'),
            address: value('address'),
            move_in_date: value('moveInDate') || null,
            status: value('officialStatus') || 'Active',
            official_type: value('officialType') || 'Elected'
        };

        if (newPhotoBase64) {
            payload.photo_base64 = newPhotoBase64;
        }

        // The same rules the API enforces, checked here so the form can name the
        // fields that are missing instead of only showing a message.
        const missing = [];
        if (!payload.first_name) missing.push('First Name');
        if (!payload.last_name) missing.push('Last Name');
        if (!payload.gender) missing.push('Gender');
        if (!payload.position) missing.push('Position / Role');
        if (!payload.term_start) missing.push('Term Start Date');
        if (!payload.term_end) missing.push('Term End Date');
        if (!payload.mobile_number) missing.push('Mobile Number');

        if (missing.length) {
            alert('Please fill in all required fields marked with *\n\nMissing: ' + missing.join(', '));
            return;
        }

        const digits = payload.mobile_number.replace(/\D/g, '');
        if (!/^(09\d{9}|639\d{9})$/.test(digits)) {
            alert('Please enter a valid mobile number (e.g., 09171234567)');
            return;
        }

        if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
            alert('Please enter a valid email address');
            return;
        }

        if (payload.term_end < payload.term_start) {
            alert('Term End Date cannot be earlier than Term Start Date.');
            return;
        }

        if (payload.move_in_date && new Date(payload.move_in_date) > new Date()) {
            alert('Move-in Date cannot be in the future.');
            return;
        }

        const saveBtn = document.getElementById('saveOfficialBtn');
        if (saveBtn) saveBtn.disabled = true;

        try {
            let result;
            if (editingId) {
                payload.id = editingId;
                result = await apiCall('', { method: 'PUT', body: JSON.stringify(payload) });
            } else {
                result = await apiCall('', { method: 'POST', body: JSON.stringify(payload) });
            }

            alert(result.message || (editingId ? 'Official has been updated successfully!' : 'Official has been added successfully!'));
            showListView();
            loadTermOptions();
        } catch (error) {
            alert(error.message);
        } finally {
            if (saveBtn) saveBtn.disabled = false;
        }
    }

    function value(id) {
        const field = document.getElementById(id);
        return field ? String(field.value || '').trim() : '';
    }

    // ------------------------------------------------------------------
    // Export List: CSV, Excel and the printable Directory of Barangay Officials
    // ------------------------------------------------------------------
    function renderExportDropdown() {
        const dropdown = document.getElementById('exportDropdown');
        if (!dropdown) return;

        dropdown.innerHTML =
            '<button type="button" class="export-option" data-format="print">Save as PDF</button>';

        dropdown.querySelectorAll('.export-option').forEach(function (option) {
            option.addEventListener('click', function () {
                dropdown.classList.remove('open');
                runExport(option.getAttribute('data-format'));
            });
        });
    }

    function toggleExportDropdown() {
        const dropdown = document.getElementById('exportDropdown');
        if (!dropdown) return;
        const wasOpen = dropdown.classList.contains('open');
        closeAllDropdowns();
        if (!wasOpen) {
            if (!dropdown.classList.contains('open')) renderExportDropdown();
            dropdown.classList.add('open');
        }
    }

    /** Close every toolbar dropdown on the Officials list page. */
    function closeAllDropdowns() {
        ['termDropdown', 'statusDropdown', 'positionDropdown', 'batchArchiveDropdown', 'exportDropdown'].forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.classList.remove('open');
        });
    }

    /** Rows for export: the same search + term filter the grid is using, from the API. */
    function exportQuery() {
        const params = new URLSearchParams();
        if (currentFilters.search) params.set('search', currentFilters.search);
        if (currentFilters.termStart) params.set('term_start', currentFilters.termStart);
        if (currentFilters.status) params.set('status', currentFilters.status);
        if (currentFilters.position) params.set('position', currentFilters.position);
        params.set('limit', '1000');
        return params.toString();
    }

    async function fetchOfficialsForExport() {
        const result = await apiCall('?' + exportQuery());
        return Array.isArray(result.data) ? result.data : [];
    }

    async function runExport(format) {
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) exportBtn.disabled = true;

        try {
            const officials = await fetchOfficialsForExport();

            if (!officials.length) {
                alert('No officials found matching the selected filters.');
                return;
            }

            if (format === 'csv') {
                exportOfficialsToCsv(officials);
            } else if (format === 'excel') {
                exportOfficialsToExcel(officials);
            } else {
                await printOfficialsDirectory(officials);
            }
        } catch (error) {
            alert('Failed to export the officials list. ' + error.message);
        } finally {
            if (exportBtn) exportBtn.disabled = false;
        }
    }

    function exportFileName() {
        const now = new Date();
        const pad = function (value) { return String(value).padStart(2, '0'); };
        return 'Barangay_Officials_Directory_' + now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    }

    function downloadFile(content, fileName, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    function exportOfficialsToCsv(officials) {
        const headers = ['Position / Role', 'Full Name', 'Term Start Date', 'Term End Date', 'Contact No.', 'Status'];
        const rows = officials.map(function (official) {
            return [
                official.position || '',
                fullName(official),
                toDateInput(official.term_start),
                toDateInput(official.term_end),
                official.mobile_number || '',
                official.status || ''
            ];
        });

        const csvContent = [headers].concat(rows).map(function (row) {
            return row.map(function (cell) { return '"' + String(cell).replace(/"/g, '""') + '"'; }).join(',');
        }).join('\n');

        downloadFile('\uFEFF' + csvContent, exportFileName() + '.csv', 'text/csv;charset=utf-8;');
        alert('Exported ' + officials.length + ' officials to CSV successfully!');
    }

    function exportOfficialsToExcel(officials) {
        let html = '<html><head><meta charset="UTF-8"><title>Barangay Officials Directory</title>' +
            '<style>th{background:#0F6CBD;color:#fff;padding:8px;}td{padding:6px;border:1px solid #ccc;}' +
            'table{border-collapse:collapse;width:100%;}</style></head><body>' +
            '<h2>Barangay 49 Akasya - Directory of Barangay Officials</h2>' +
            '<p>Generated on: ' + escapeHtml(new Date().toLocaleString()) + '</p>' +
            '<p>Term Year: ' + escapeHtml(termFilterLabel()) + ' | Status: ' + escapeHtml(statusFilterLabel()) + '</p>' +
            '<p>Total Records: ' + officials.length + '</p>' +
            '<table border="1"><thead><tr>' +
            '<th>Position / Role</th><th>Full Name</th><th>Term Start Date</th><th>Term End Date</th>' +
            '<th>Contact No.</th><th>Status</th></tr></thead><tbody>';

        officials.forEach(function (official) {
            html += '<tr>' +
                '<td>' + escapeHtml(official.position || '') + '</td>' +
                '<td>' + escapeHtml(fullName(official)) + '</td>' +
                '<td>' + escapeHtml(toDateInput(official.term_start)) + '</td>' +
                '<td>' + escapeHtml(toDateInput(official.term_end)) + '</td>' +
                '<td>' + escapeHtml(official.mobile_number || '') + '</td>' +
                '<td>' + escapeHtml(official.status || '') + '</td>' +
                '</tr>';
        });

        html += '</tbody></table></body></html>';

        downloadFile(html, exportFileName() + '.xls', 'application/vnd.ms-excel');
        alert('Exported ' + officials.length + ' officials to Excel successfully!');
    }

    /** "Hon. Roberto Santos" for elected officials, "Elena Valdez" for appointed ones. */
    function fullName(official) {
        let name = [official.first_name, official.last_name].filter(Boolean).join(' ');
        if (official.suffix) name += ' ' + official.suffix;
        if ((official.official_type || 'Elected') === 'Elected') name = 'Hon. ' + name;
        return name.trim();
    }

    function termFilterLabel() {
        if (!currentFilters.termStart) return 'All Terms';

        const match = termOptions.filter(function (term) {
            return String(term.term_start) === String(currentFilters.termStart);
        })[0];

        return match ? match.label : currentFilters.termStart;
    }

    /** The module has no status filter yet, so the directory says so instead of guessing. */
    function statusFilterLabel() {
        return 'All Statuses';
    }

    function termRange(official) {
        const start = toDateInput(official.term_start);
        const end = toDateInput(official.term_end);
        if (start && end) return start + ' - ' + end;
        return start || end || '—';
    }

    /**
     * Signature names come from barangay_officials: the Barangay Secretary prepares
     * the directory, the Punong Barangay certifies and approves it. Nothing is
     * hardcoded — a position that is not on the roster prints an empty line.
     */
    async function loadSignatories() {
        try {
            const result = await apiCall('?limit=1000');
            const rows = Array.isArray(result.data) ? result.data : [];
            const pick = function (position) {
                return rows.filter(function (row) { return row.position === position; })[0] || null;
            };
            return { prepared: pick('Barangay Secretary'), approved: pick('Punong Barangay') };
        } catch (error) {
            return { prepared: null, approved: null };
        }
    }

    /** Builds the Directory of Barangay Officials print document (A4 portrait). */
    async function printOfficialsDirectory(officials) {
        const printWindow = window.open('', '_blank');

        if (!printWindow) {
            alert('Please allow pop-ups for this page so the directory can be printed.');
            return;
        }

        const signatories = await loadSignatories();
        const now = new Date();
        const dateGenerated = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const timeGenerated = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        const sessionUser = (window.Session && window.Session.user) || null;
        const generatedBy = sessionUser
            ? (sessionUser.name || sessionUser.username || 'User') + (sessionUser.role ? ' (' + sessionUser.role + ')' : '')
            : 'System Administrator';

        // The seal is resolved absolutely: the print window is a blank document.
        const logoUrl = new URL('Images/Brgy.png', window.location.href).href;

        const rows = officials.map(function (official, index) {
            return {
                no: index + 1,
                position: escapeHtml(official.position || '—'),
                name: escapeHtml(fullName(official)),
                term: escapeHtml(termRange(official)),
                contact: escapeHtml(official.mobile_number || '—'),
                status: escapeHtml(official.status || '—')
            };
        });

        const styles = `
            * { margin: 0; padding: 0; box-sizing: border-box; }
            @page { size: A4 portrait; margin: 12mm; }
            body { font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; font-size: 11px; }
            .page { width: 180mm; margin: 0 auto; page-break-after: always; break-after: page; }
            .page:last-child { page-break-after: auto; break-after: auto; }

            /* ---- Barangay letterhead ---- */
            .letterhead { display: flex; align-items: center; gap: 5mm; }
            .letterhead img.seal { width: 22mm; height: 22mm; object-fit: contain; flex: 0 0 22mm; }
            .letterhead-text { flex: 1; text-align: center; line-height: 1.35; }
            .letterhead-text .line { font-size: 11px; }
            .letterhead-text .barangay { font-size: 15px; font-weight: bold; letter-spacing: 0.5px; margin: 1mm 0; }
            .letterhead-rule { border-top: 2px solid #000; margin-top: 3mm; }

            /* ---- Report title, term year and status ---- */
            .report-title { text-align: center; font-size: 14px; font-weight: bold; text-decoration: underline;
                            text-transform: uppercase; letter-spacing: 1px; margin: 5mm 0 2mm 0; }
            .term-status { display: flex; justify-content: center; gap: 12mm; font-size: 11px; margin-bottom: 2mm; }
            .report-meta { text-align: right; font-size: 9.5px; line-height: 1.4; margin-bottom: 3mm; }
            .meta-label { font-weight: bold; }

            /* ---- Officials table ---- */
            table.directory { width: 100%; border-collapse: collapse; table-layout: fixed; }
            table.directory th, table.directory td { border: 1px solid #000; padding: 3px 4px; font-size: 10px;
                                                     vertical-align: middle; }
            table.directory th { background: #E9EDF1; font-weight: bold; text-align: center;
                                 text-transform: uppercase; font-size: 9.5px; }
            table.directory thead { display: table-header-group; }
            table.directory tr { page-break-inside: avoid; break-inside: avoid; }
            td.c-no { text-align: center; }
            td.c-status { text-align: center; }
            td.c-contact { white-space: nowrap; }
            td.c-position, td.c-name { overflow-wrap: anywhere; word-wrap: break-word; }

            /* ---- Signatures and page number ---- */
            .signatures { display: flex; justify-content: space-between; gap: 10mm; margin-top: 10mm;
                          page-break-inside: avoid; break-inside: avoid; }
            .signature-block { width: 45%; text-align: center; }
            .signature-label { text-align: left; font-size: 10px; font-weight: bold; margin-bottom: 1mm; }
            .signature-space { height: 12mm; }
            .signature-name { border-top: 1px solid #000; padding-top: 1mm; font-weight: bold;
                              text-transform: uppercase; font-size: 11px; }
            .signature-title { font-size: 10px; margin-top: 1mm; }
            .page-number { text-align: right; font-size: 9.5px; margin-top: 5mm; }
        `;

        const letterhead = `
            <div class="letterhead">
                <img class="seal" src="${logoUrl}" alt="Barangay 49 Akasya seal">
                <div class="letterhead-text">
                    <div class="line">Republic of the Philippines</div>
                    <div class="line">Province of Cavite</div>
                    <div class="line">City of Cavite</div>
                    <div class="barangay">BARANGAY 49 AKASYA</div>
                </div>
            </div>
            <div class="letterhead-rule"></div>
        `;

        const reportTitle = `<h1 class="report-title">Directory of Barangay Officials</h1>`;

        const termStatus = `
            <div class="term-status">
                <span><span class="meta-label">Term Year:</span> ${escapeHtml(termFilterLabel())}</span>
                <span><span class="meta-label">Status:</span> ${escapeHtml(statusFilterLabel())}</span>
            </div>
        `;

        const metaBlock = `
            <div class="report-meta">
                <div><span class="meta-label">Date Generated:</span> ${dateGenerated}, ${timeGenerated}</div>
                <div><span class="meta-label">Generated By:</span> ${escapeHtml(generatedBy)}</div>
            </div>
        `;

        const columnGroup = `
            <colgroup>
                <col style="width: 6%">
                <col style="width: 20%">
                <col style="width: 26%">
                <col style="width: 22%">
                <col style="width: 15%">
                <col style="width: 11%">
            </colgroup>
        `;

        const tableHead = `
            <thead>
                <tr>
                    <th>No.</th>
                    <th>Position / Role</th>
                    <th>Full Name</th>
                    <th>Term Start Date - End Date</th>
                    <th>Contact No.</th>
                    <th>Status</th>
                </tr>
            </thead>
        `;

        const rowHtml = (row) => `
            <tr>
                <td class="c-no">${row.no}</td>
                <td class="c-position">${row.position}</td>
                <td class="c-name">${row.name}</td>
                <td class="c-term">${row.term}</td>
                <td class="c-contact">${row.contact}</td>
                <td class="c-status">${row.status}</td>
            </tr>`;

        const signatureBlock = (label, official, fallbackTitle) => `
            <div class="signature-block">
                <div class="signature-label">${escapeHtml(label)}</div>
                <div class="signature-space"></div>
                <div class="signature-name">${official ? escapeHtml(displayName(official)) : '&nbsp;'}</div>
                <div class="signature-title">${escapeHtml(official && official.position ? official.position : fallbackTitle)}</div>
            </div>`;

        const signatures = `
            <div class="signatures">
                ${signatureBlock('Prepared By:', signatories.prepared, 'Barangay Secretary')}
                ${signatureBlock('Certified and Approved By:', signatories.approved, 'Punong Barangay')}
            </div>
        `;

        const pageFooter = (pageNumber, totalPages) => `<div class="page-number">Page ${pageNumber} of ${totalPages}</div>`;

        const buildDocument = (bodyHtml) => `
            <!DOCTYPE html>
            <html>
            <head><title>${escapeHtml(exportFileName())}</title><meta charset="UTF-8">
            <style>${styles}</style>
            </head>
            <body>${bodyHtml}</body>
            </html>
        `;

        const mmToPx = (mm) => mm * (96 / 25.4);
        const PAGE_CAPACITY = mmToPx(268) * 0.97; // A4 height minus 2 x 12mm margins, with slack

        const waitFor = (predicate, timeoutMs) => new Promise((resolve) => {
            const started = Date.now();

            const tick = () => {
                let done = false;

                try {
                    done = !!predicate();
                } catch (error) {
                    done = false;
                }

                if (done || Date.now() - started > timeoutMs) {
                    resolve(done);
                    return;
                }

                setTimeout(tick, 50);
            };

            tick();
        });

        // Pass 2: the rows have been measured, so they can be packed into whole pages.
        const renderPages = () => {
            const doc = printWindow.document;

            const heightOf = (selector) => {
                const el = doc.querySelector(selector);
                return el ? el.getBoundingClientRect().height : 0;
            };

            // Everything a page carries besides its data rows, so every page shares
            // one capacity and the signature block always has room.
            const fixedHeight = heightOf('.letterhead')
                + heightOf('.letterhead-rule')
                + heightOf('.report-title')
                + heightOf('.term-status')
                + heightOf('.report-meta')
                + heightOf('.directory thead tr')
                + heightOf('.signatures')
                + heightOf('.page-number');

            const rowHeights = Array.prototype.map.call(
                doc.querySelectorAll('.directory tbody tr'),
                (tr) => tr.getBoundingClientRect().height
            );

            const pages = [];
            let cursor = 0;

            do {
                let used = 0;
                const pageRows = [];

                while (cursor < rowHeights.length) {
                    const rowHeight = rowHeights[cursor];

                    // At least one row per page, and never overflow the capacity.
                    if (pageRows.length && used + rowHeight > PAGE_CAPACITY - fixedHeight) {
                        break;
                    }

                    pageRows.push(rows[cursor]);
                    used += rowHeight;
                    cursor += 1;
                }

                pages.push(pageRows);
            } while (cursor < rowHeights.length);

            const totalPages = pages.length;

            const body = pages.map((pageRows, index) => `
                <div class="page">
                    ${letterhead}
                    ${reportTitle}
                    ${termStatus}
                    ${metaBlock}
                    <table class="directory">
                        ${columnGroup}
                        ${tableHead}
                        <tbody>${pageRows.map(rowHtml).join('')}</tbody>
                    </table>
                    ${index === totalPages - 1 ? signatures : ''}
                    ${pageFooter(index + 1, totalPages)}
                </div>
            `).join('');

            doc.open();
            doc.write(buildDocument(body));
            doc.close();

            // Print only once the seal has been fetched, or it would be missing on paper.
            const seal = doc.querySelector('.letterhead img.seal');
            const sealReady = (!seal || seal.complete)
                ? Promise.resolve()
                : new Promise((resolve) => {
                    seal.addEventListener('load', resolve);
                    seal.addEventListener('error', resolve);
                });

            sealReady.then(() => {
                printWindow.focus();
                printWindow.print();
                alert('Exported ' + officials.length + ' officials to PDF successfully!');
            });
        };

        // Pass 1: render every row once, at the printed width, so real row heights can
        // be measured (a long position or name that wraps takes two lines of the page).
        printWindow.document.open();
        printWindow.document.write(buildDocument(`
            <div class="page">
                ${letterhead}
                ${reportTitle}
                ${termStatus}
                ${metaBlock}
                <table class="directory" id="measureTable">
                    ${columnGroup}
                    ${tableHead}
                    <tbody>${rows.map(rowHtml).join('')}</tbody>
                </table>
                ${signatures}
                ${pageFooter(1, 1)}
            </div>
        `));
        printWindow.document.close();

        const measured = await waitFor(() => {
            const doc = printWindow.document;
            const table = doc.getElementById('measureTable');

            return doc.readyState === 'complete'
                && !!table
                && !!table.tBodies[0]
                && table.tBodies[0].rows.length === rows.length;
        }, 4000);

        if (!measured) {
            console.error('Directory print: the measuring pass did not complete, printing a single page.');
        }

        renderPages();
    }

    // ------------------------------------------------------------------
    // Global handlers used by the generated card markup
    // ------------------------------------------------------------------
    window.editOfficial = function (id) {
        if (!canEditOfficial()) {
            notify('You do not have permission to edit officials.');
            return;
        }
        const official = officialsCache.filter(function (row) {
            return String(row.id) === String(id);
        })[0];

        if (official) {
            showEditConfirmModal(official);
            return;
        }

        // Not in the cache (a stale card): fetch it, then ask.
        apiCall('?id=' + encodeURIComponent(id))
            .then(function (result) {
                if (result.data) showEditConfirmModal(result.data);
            })
            .catch(function (error) {
                alert(error.message);
            });
    };


    /** Asks before opening the edit form, the same way the Residents module does. */
    function showEditConfirmModal(official) {
        pendingEditId = String(official.id);

        const nameField = document.getElementById('editConfirmOfficialName');
        if (nameField) nameField.textContent = displayName(official);

        const positionField = document.getElementById('editConfirmOfficialPosition');
        if (positionField) positionField.textContent = official.position || '—';

        const modal = document.getElementById('editConfirmModal');
        if (modal) modal.classList.add('active');
    }

    function closeEditConfirmModal() {
        const modal = document.getElementById('editConfirmModal');
        if (modal) modal.classList.remove('active');
        pendingEditId = null;
    }

    function proceedWithEdit() {
        // Capture the id first: closeEditConfirmModal() clears pendingEditId, so
        // reading it afterwards would open nothing.
        const id = pendingEditId;

        if (!id) return;

        closeEditConfirmModal();

        const official = officialsCache.filter(function (row) {
            return String(row.id) === String(id);
        })[0];

        if (official) {
            showOfficialForm(official);
            return;
        }

        apiCall('?id=' + encodeURIComponent(id))
            .then(function (result) {
                if (result.data) showOfficialForm(result.data);
            })
            .catch(function (error) {
                alert(error.message);
            });
    }

    window.archiveOfficial = function (id) {
        const official = officialsCache.filter(function (row) {
            return String(row.id) === String(id);
        })[0];
        const who = official ? displayName(official) : 'this official';

        if (!confirm('Archive ' + who + '?\n\nThe record is moved to the archive and can be restored from there.')) {
            return;
        }

        apiCall('?id=' + encodeURIComponent(id), { method: 'DELETE' })
            .then(function (result) {
                alert(result.message || 'Official has been archived successfully!');
                loadOfficialsGrid();
                loadTermOptions();
            })
            .catch(function (error) {
                alert(error.message);
            });
    };

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Exposed for the sidebar router (and for a direct script load).
    window.initOfficialsModule = initOfficialsModule;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            initOfficialsModule();
        });
    } else {
        initOfficialsModule();
    }
})();

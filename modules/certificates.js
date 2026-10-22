// certificates.js - Certificate Management Module (API-backed)
//
// Records live in brgy49_db (certificate_issuances) and are read/written through
// api/certificates.php. The resident search uses the existing api/residents.php,
// so no resident data is duplicated here.
//
// Everything is wrapped in an IIFE: the router re-appends this script on every
// visit, and top-level let/const declarations would throw
// "Identifier has already been declared" the second time the module is opened.

(function () {
    'use strict';

    const CERT_ENDPOINT = 'certificates.php';
    const PAGE_SIZE = 5;
    const VALID_MONTHS = 6;

    const state = {
        page: 1,
        search: '',
        total: 0,
        totalPages: 1,
        selectedResident: null,
        viewingId: null,
        editingId: null,
        pendingEditId: null,
        pendingArchiveId: null,
        saving: false,
        searchTimer: null,
        lastSearchResults: []
    };

    // ============================================
    // API HELPER
    // ============================================
    // Each module carries its own copy: js/api.js is only loaded on login.php, and
    // a second global `const API_BASE_URL` would collide with the Residents module.
    // A failed request returns {success:false} so it can never look like a save.
    const API_BASE = 'api/';

    async function apiCall(endpoint, method, data) {
        const options = {
            method: method || 'GET',
            headers: { 'Content-Type': 'application/json' }
        };
        if (data) {
            options.body = JSON.stringify(data);
        }
        try {
            const response = await fetch(API_BASE + endpoint, options);
            return await response.json();
        } catch (error) {
            console.error('Certificates API error:', error);
            return { success: false, message: 'Unable to reach the server. Please check your connection and try again.' };
        }
    }

    // ============================================
    // SMALL HELPERS
    // ============================================

    function $(id) {
        return document.getElementById(id);
    }

    /**
     * Show/hide an element that carries the `.hidden` utility class.
     * That rule is `display: none !important`, so setting the inline style alone
     * leaves the element invisible - the class has to be toggled as well.
     */
    function setVisible(el, visible, display) {
        if (!el) return;
        el.classList.toggle('hidden', !visible);
        el.style.display = visible ? (display || 'block') : 'none';
    }

    function notify(message) {
        if (message) alert(message);
    }

    function escapeHtml(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /** Format a YYYY-MM-DD value without timezone drift. */
    function formatDate(value) {
        if (!value) return '—';
        const parts = String(value).split('-');
        if (parts.length !== 3) return String(value);
        const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        if (isNaN(date.getTime())) return String(value);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    /** Long form used on the details page. */
    function formatDateLong(value) {
        if (!value) return '—';
        const parts = String(value).split('-');
        if (parts.length !== 3) return String(value);
        const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        if (isNaN(date.getTime())) return String(value);
        return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }

    /** Today as YYYY-MM-DD (local, not UTC). */
    function todayValue() {
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return now.getFullYear() + '-' + month + '-' + day;
    }

    /** Valid Until = date issued + 6 months (the approved rule). */
    function calculateValidUntil(dateIssued) {
        if (!dateIssued) return '—';
        const parts = String(dateIssued).split('-');
        if (parts.length !== 3) return '—';
        const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        if (isNaN(date.getTime())) return '—';
        date.setMonth(date.getMonth() + VALID_MONTHS);
        return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }

    /** Control number: BRGY49-{TYPE}-{YEAR}-{NNNN} (existing format). */
    function generateControlNumber(certificate) {
        if (!certificate) return '—';
        const type = String(certificate.certificate_type || '');
        let typeCode = 'GEN';
        if (type.indexOf('Clearance') !== -1) typeCode = 'CLR';
        else if (type.indexOf('Indigency') !== -1) typeCode = 'IND';
        else if (type.indexOf('Residency') !== -1) typeCode = 'RES';
        else if (type.indexOf('Business') !== -1) typeCode = 'BUS';
        else if (type.indexOf('Cedula') !== -1) typeCode = 'CED';
        else if (type.indexOf('Good Moral') !== -1) typeCode = 'GMC';

        const year = certificate.date_issued
            ? String(certificate.date_issued).slice(0, 4)
            : String(new Date().getFullYear());
        const sequence = String(certificate.id || 0).padStart(4, '0');

        return 'BRGY49-' + typeCode + '-' + year + '-' + sequence;
    }

    function badgeClass(certificateType) {
        const type = String(certificateType || '');
        if (type.indexOf('Clearance') !== -1) return 'clearance';
        if (type.indexOf('Indigency') !== -1) return 'indigency';
        if (type.indexOf('Residency') !== -1) return 'residency';
        if (type.indexOf('Business') !== -1) return 'business';
        if (type.indexOf('Cedula') !== -1) return 'cedula';
        if (type.indexOf('Good Moral') !== -1) return 'moral';
        return 'clearance';
    }

    function formatAmount(value) {
        const amount = parseFloat(value);
        return '₱ ' + (isNaN(amount) ? '0.00' : amount.toFixed(2));
    }

    /** Resident display name in the system convention: "Last, First M." */
    function residentName(resident) {
        if (!resident) return '—';
        const middle = String(resident.middle_name || '').trim();
        let name = String(resident.last_name || '').trim();
        name += (name ? ', ' : '') + String(resident.first_name || '').trim();
        if (middle) name += ' ' + middle.charAt(0).toUpperCase() + '.';
        const suffix = String(resident.suffix || '').trim();
        if (suffix) name += ' ' + suffix;
        return name || '—';
    }

    function residentAddress(resident) {
        if (!resident) return '—';
        const parts = [resident.purok, resident.street_name]
            .map(function (part) { return String(part || '').trim(); })
            .filter(Boolean);
        return parts.length ? parts.join(' • ') : '—';
    }

    // ============================================
    // INITIALISATION
    // ============================================

    function initCertificates() {
        const module = $('certificatesModule');

        if (!module) {
            return;
        }

        // The router calls this function and the file also self-initialises, so
        // guard against binding the same listeners twice (which would submit a
        // form twice per click). The flag lives on the injected DOM, so a fresh
        // visit still initialises once.
        if (module.dataset.certificatesReady === '1') {
            loadCertificatesTable();
            return;
        }

        module.dataset.certificatesReady = '1';

        setVisible(module, true, 'flex');
        setVisible($('certificateDetailsView'), false);
        setVisible($('editCertificateView'), false);
        document.querySelectorAll('.modal-overlay').forEach(function (modal) {
            setVisible(modal, false, 'flex');
        });

        setupEventListeners();
        setDefaultDate();
        loadCertificatesTable();
    }

    function setDefaultDate() {
        const dateIssued = $('dateIssued');
        if (dateIssued && !dateIssued.value) {
            dateIssued.value = todayValue();
        }
    }

    function showListView() {
        setVisible($('certificatesModule'), true, 'flex');
        setVisible($('certificateDetailsView'), false);
        setVisible($('editCertificateView'), false);
        loadCertificatesTable();
    }

    // ============================================
    // LIST + PAGINATION (server-side)
    // ============================================

    async function loadCertificatesTable() {
        const tbody = $('issuancesTableBody');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="6" class="table-message">Loading...</td></tr>';

        const params = new URLSearchParams({
            page: String(state.page),
            limit: String(PAGE_SIZE)
        });
        if (state.search) params.set('search', state.search);

        const result = await apiCall(CERT_ENDPOINT + '?' + params.toString());

        if (!result || result.success !== true) {
            tbody.innerHTML = '<tr><td colspan="6" class="table-message">'
                + escapeHtml((result && result.message) || 'Unable to load certificate records.')
                + '</td></tr>';
            renderPagination(1);
            const info = $('paginationInfo');
            if (info) info.textContent = 'Showing 0 to 0 of 0 entries';
            return;
        }

        const rows = Array.isArray(result.data) ? result.data : [];
        state.total = Number(result.total || 0);
        state.totalPages = Number(result.totalPages || 1) || 1;

        if (state.page > state.totalPages) {
            state.page = state.totalPages;
            return loadCertificatesTable();
        }

        renderTable(rows);
        renderPagination(state.totalPages);

        const start = state.total === 0 ? 0 : (state.page - 1) * PAGE_SIZE + 1;
        const end = Math.min(state.page * PAGE_SIZE, state.total);
        const info = $('paginationInfo');
        if (info) info.textContent = 'Showing ' + start + ' to ' + end + ' of ' + state.total + ' entries';
    }

    function renderTable(rows) {
        const tbody = $('issuancesTableBody');
        if (!tbody) return;

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="table-message">No certificates found</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(function (cert) {
            const orNumber = cert.or_number ? escapeHtml(cert.or_number) : '—';
            return ''
                + '<tr>'
                + '<td>' + escapeHtml(formatDate(cert.date_issued)) + '</td>'
                + '<td>' + escapeHtml(cert.resident_name) + '</td>'
                + '<td><span class="cert-badge ' + badgeClass(cert.certificate_type) + '">'
                + escapeHtml(cert.certificate_type) + '</span></td>'
                + '<td>' + escapeHtml(cert.purpose) + '</td>'
                + '<td>' + orNumber + '</td>'
                + '<td>'
                + '<div class="action-buttons">'
                + '<div class="action-btn" onclick="window.showCertificateDetailsView(' + cert.id + ')" title="View">'
                + '<img src="Images/View_Icon.svg" alt="View Icon"></div>'
                + '<div class="action-btn" onclick="window.showEditConfirmModal(' + cert.id + ')" title="Edit">'
                + '<img src="Images/Edit_Icon.svg" alt="Edit Icon"></div>'
                + '<div class="action-btn archive" onclick="window.showArchiveConfirmModal(' + cert.id + ')" title="Archive">'
                + '<img src="Images/Archives_Icon.svg" alt="Archive Icon"></div>'
                + '</div>'
                + '</td>'
                + '</tr>';
        }).join('');
    }

    function renderPagination(totalPages) {
        const container = $('paginationControls');
        if (!container) return;

        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }

        let html = '<button class="pagination-btn" onclick="window.changePage(' + (state.page - 1) + ')"'
            + (state.page === 1 ? ' disabled' : '') + '>‹</button>';

        for (let i = 1; i <= totalPages; i++) {
            if (totalPages > 7 && i > 2 && i < totalPages - 1 && Math.abs(i - state.page) > 1) {
                if (i === 3) html += '<button class="pagination-btn" disabled>...</button>';
                continue;
            }
            html += '<button class="pagination-btn' + (i === state.page ? ' active' : '') + '"'
                + ' onclick="window.changePage(' + i + ')">' + i + '</button>';
        }

        html += '<button class="pagination-btn" onclick="window.changePage(' + (state.page + 1) + ')"'
            + (state.page === totalPages ? ' disabled' : '') + '>›</button>';

        container.innerHTML = html;
    }

    window.changePage = function (page) {
        if (page < 1 || page > state.totalPages || page === state.page) return;
        state.page = page;
        loadCertificatesTable();
    };

    // ============================================
    // RESIDENT SEARCH (api/residents.php)
    // ============================================

    function setupResidentSearch() {
        const input = $('residentSearch');
        const results = $('residentResults');
        if (!input || !results) return;

        input.addEventListener('input', function (event) {
            const term = event.target.value.trim();

            // Typing again invalidates any previously picked resident.
            state.selectedResident = null;
            if ($('selectedResidentId')) $('selectedResidentId').value = '';
            if ($('selectedResidentName')) $('selectedResidentName').value = '';

            if (state.searchTimer) clearTimeout(state.searchTimer);

            if (term.length < 2) {
                setVisible(results, false);
                return;
            }

            state.searchTimer = setTimeout(function () {
                searchResidents(term);
            }, 250);
        });

        document.addEventListener('click', function (event) {
            if (!input.contains(event.target) && !results.contains(event.target)) {
                setVisible(results, false);
            }
        });
    }

    async function searchResidents(term) {
        const results = $('residentResults');
        if (!results) return;

        const result = await apiCall('residents.php?search=' + encodeURIComponent(term) + '&limit=8');
        const residents = (result && result.success === true && Array.isArray(result.data)) ? result.data : [];
        state.lastSearchResults = residents;

        if (!residents.length) {
            results.innerHTML = '<div class="search-result-item"><div class="resident-name">No residents found</div></div>';
            setVisible(results, true);
            return;
        }

        results.innerHTML = residents.map(function (resident) {
            return '<div class="search-result-item" onclick="window.selectResident(' + resident.id + ')">'
                + '<div class="resident-name">' + escapeHtml(residentName(resident)) + '</div>'
                + '<div class="resident-address">' + escapeHtml(residentAddress(resident)) + '</div>'
                + '</div>';
        }).join('');

        setVisible(results, true);
    }

    window.selectResident = function (id) {
        const resident = state.lastSearchResults.find(function (item) {
            return String(item.id) === String(id);
        });

        if (!resident) return;

        const name = residentName(resident);
        state.selectedResident = resident;

        if ($('residentSearch')) $('residentSearch').value = name;
        if ($('selectedResidentId')) $('selectedResidentId').value = resident.id;
        if ($('selectedResidentName')) $('selectedResidentName').value = name;

        setVisible($('residentResults'), false);
    };

    // ============================================
    // SAVE A NEW ISSUANCE
    // ============================================

    async function saveCertificate() {
        if (state.saving) return;

        const residentId = $('selectedResidentId') ? $('selectedResidentId').value : '';
        const certificateType = $('certificateType') ? $('certificateType').value : '';
        const purpose = $('purpose') ? $('purpose').value.trim() : '';
        const orNumber = $('orNumber') ? $('orNumber').value.trim() : '';
        const amount = $('amount') ? $('amount').value.trim() : '';
        const dateIssued = $('dateIssued') ? $('dateIssued').value : '';

        if (!residentId) {
            notify('Please search for and select a resident.');
            return;
        }
        if (!purpose) {
            notify('Please enter the purpose.');
            return;
        }
        if (!dateIssued) {
            notify('Please choose the date issued.');
            return;
        }

        const button = $('saveCertificateBtn');
        state.saving = true;
        if (button) button.disabled = true;

        const result = await apiCall(CERT_ENDPOINT, 'POST', {
            resident_id: Number(residentId),
            certificate_type: certificateType,
            purpose: purpose,
            or_number: orNumber,
            amount_paid: amount,
            date_issued: dateIssued
        });

        state.saving = false;
        if (button) button.disabled = false;

        if (!result || result.success !== true) {
            notify((result && result.message) || 'Failed to save the certificate. Please try again.');
            return;
        }

        // Reset the form and show the new record.
        if ($('residentSearch')) $('residentSearch').value = '';
        if ($('selectedResidentId')) $('selectedResidentId').value = '';
        if ($('selectedResidentName')) $('selectedResidentName').value = '';
        if ($('purpose')) $('purpose').value = '';
        if ($('orNumber')) $('orNumber').value = '';
        if ($('amount')) $('amount').value = '';
        state.selectedResident = null;
        setDefaultDate();

        state.page = 1;
        await loadCertificatesTable();
        notify(result.message || 'Certificate saved successfully.');
    }

    // ============================================
    // VIEW
    // ============================================

    async function fetchCertificate(id) {
        const result = await apiCall(CERT_ENDPOINT + '?id=' + encodeURIComponent(id));
        if (!result || result.success !== true || !result.data) {
            return null;
        }
        return result.data;
    }

    function detailRow(label, value) {
        return '<div class="view-row"><strong>' + label + ':</strong> ' + value + '</div>';
    }

    window.viewCertificateModal = async function (id) {
        const certificate = await fetchCertificate(id);
        if (!certificate) {
            notify('Certificate record not found.');
            return;
        }

        state.viewingId = certificate.id;

        const content = $('viewCertificateContent');
        if (content) {
            content.innerHTML = ''
                + '<div class="certificate-view-details">'
                + detailRow('Resident Name', escapeHtml(certificate.resident_name))
                + detailRow('Certificate Type', escapeHtml(certificate.certificate_type))
                + detailRow('Purpose', escapeHtml(certificate.purpose))
                + detailRow('OR Number', certificate.or_number ? escapeHtml(certificate.or_number) : '—')
                + detailRow('Amount Paid', formatAmount(certificate.amount_paid))
                + detailRow('Date Issued', escapeHtml(formatDate(certificate.date_issued)))
                + detailRow('Valid Until', escapeHtml(certificate.valid_until ? formatDate(certificate.valid_until) : calculateValidUntil(certificate.date_issued)))
                + detailRow('Issued By', escapeHtml(certificate.issued_by || '—'))
                + detailRow('Control Number', escapeHtml(generateControlNumber(certificate)))
                + '</div>';
        }

        setVisible($('viewCertificateModal'), true, 'flex');
    };

    function closeViewModal() {
        setVisible($('viewCertificateModal'), false, 'flex');
    }

    function printCertificate() {
        const contentContainer = $('viewCertificateContent');
        const content = contentContainer ? contentContainer.innerHTML : '';
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            notify('Please allow pop-ups for this page so the certificate can be printed.');
            return;
        }

        printWindow.document.write(''
            + '<html><head><title>Certificate Preview</title><style>'
            + 'body { font-family: Arial, sans-serif; padding: 40px; }'
            + '.certificate { border: 2px solid #16324A; padding: 30px; max-width: 650px; margin: 0 auto; }'
            + '.header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #16324A; padding-bottom: 15px; }'
            + '.title { font-size: 24px; font-weight: bold; color: #16324A; text-transform: uppercase; }'
            + '.view-row { margin-bottom: 12px; font-size: 16px; }'
            + '.signatures { margin-top: 60px; display: flex; justify-content: space-between; }'
            + '</style></head><body>'
            + '<div class="certificate">'
            + '<div class="header"><div class="title">Republic of the Philippines</div>'
            + '<div>Barangay 49 Akasya, Cavite City</div>'
            + '<h3 style="margin-top: 15px;">OFFICIAL CERTIFICATION</h3></div>'
            + content
            + '<div class="signatures"><div>____________________<br><strong>Barangay Secretary</strong></div>'
            + '<div>____________________<br><strong>Punong Barangay</strong></div></div>'
            + '</div></body></html>');

        printWindow.document.close();
        printWindow.print();
    }

    // ============================================
    // DETAILS PAGE
    // ============================================

    window.showCertificateDetailsView = async function (id) {
        const certificate = await fetchCertificate(id);
        if (!certificate) {
            notify('Certificate record not found.');
            return;
        }

        state.viewingId = certificate.id;

        setVisible($('certificatesModule'), false);
        setVisible($('editCertificateView'), false);
        setVisible($('certificateDetailsView'), true);

        if ($('detailsResidentName')) $('detailsResidentName').textContent = certificate.resident_name;
        if ($('detailsCertificateType')) {
            $('detailsCertificateType').innerHTML = '<span class="badge ' + badgeClass(certificate.certificate_type) + '">'
                + escapeHtml(certificate.certificate_type) + '</span>';
        }
        if ($('detailsPurpose')) $('detailsPurpose').textContent = certificate.purpose || '—';
        if ($('detailsDateIssued')) $('detailsDateIssued').textContent = formatDateLong(certificate.date_issued);
        if ($('detailsValidUntil')) {
            $('detailsValidUntil').textContent = certificate.valid_until
                ? formatDateLong(certificate.valid_until)
                : calculateValidUntil(certificate.date_issued);
        }
        if ($('detailsOrNumber')) $('detailsOrNumber').textContent = certificate.or_number || '—';
        if ($('detailsAmount')) $('detailsAmount').textContent = formatAmount(certificate.amount_paid);
        if ($('detailsIssuedBy')) $('detailsIssuedBy').textContent = certificate.issued_by || '—';
        if ($('detailsControlNumber')) $('detailsControlNumber').textContent = generateControlNumber(certificate);
    };

    // ============================================
    // EDIT
    // ============================================

    window.showEditConfirmModal = function (id) {
        state.pendingEditId = id;
        setVisible($('editConfirmModal'), true, 'flex');
    };

    function closeEditConfirmModal() {
        setVisible($('editConfirmModal'), false, 'flex');
        state.pendingEditId = null;
    }

    window.proceedWithEdit = function () {
        const id = state.pendingEditId;
        closeEditConfirmModal();
        if (id) {
            window.showEditCertificateView(id);
        }
    };

    window.showEditCertificateView = async function (id) {
        const certificate = await fetchCertificate(id);
        if (!certificate) {
            notify('Certificate record not found.');
            return;
        }

        state.editingId = certificate.id;

        setVisible($('certificatesModule'), false);
        setVisible($('certificateDetailsView'), false);
        setVisible($('editCertificateView'), true);

        if ($('editResidentNameDisplay')) $('editResidentNameDisplay').textContent = certificate.resident_name;
        if ($('editCertificateTypeDisplay')) $('editCertificateTypeDisplay').textContent = certificate.certificate_type;
        if ($('editPurposeField')) $('editPurposeField').value = certificate.purpose || '';
        if ($('editDateIssuedField')) $('editDateIssuedField').value = certificate.date_issued || '';
        if ($('editValidUntilField')) $('editValidUntilField').value = certificate.valid_until || '';
        if ($('editOrNumberField')) $('editOrNumberField').value = certificate.or_number || '';
        if ($('editAmountField')) $('editAmountField').value = parseFloat(certificate.amount_paid || 0).toFixed(2);
        if ($('editStatusField')) $('editStatusField').value = certificate.status || 'Valid';
        if ($('editControlNumberDisplay')) $('editControlNumberDisplay').textContent = generateControlNumber(certificate);
    };

    async function saveEditedCertificateView() {
        if (!state.editingId || state.saving) return;

        const purpose = $('editPurposeField') ? $('editPurposeField').value.trim() : '';
        const dateIssued = $('editDateIssuedField') ? $('editDateIssuedField').value : '';
        const orNumber = $('editOrNumberField') ? $('editOrNumberField').value.trim() : '';
        const amount = $('editAmountField') ? $('editAmountField').value.trim() : '';
        const status = $('editStatusField') ? $('editStatusField').value : 'Valid';

        if (!purpose) {
            notify('Please enter the purpose.');
            return;
        }
        if (!dateIssued) {
            notify('Please choose the date issued.');
            return;
        }

        const button = $('saveEditViewBtn');
        state.saving = true;
        if (button) button.disabled = true;

        const result = await apiCall(CERT_ENDPOINT, 'PUT', {
            id: state.editingId,
            purpose: purpose,
            date_issued: dateIssued,
            or_number: orNumber,
            amount_paid: amount,
            status: status
        });

        state.saving = false;
        if (button) button.disabled = false;

        if (!result || result.success !== true) {
            notify((result && result.message) || 'Failed to update the certificate. Please try again.');
            return;
        }

        const updatedId = state.editingId;
        state.editingId = null;
        await window.showCertificateDetailsView(updatedId);
        notify(result.message || 'Certificate updated successfully!');
    }

    function backToDetailsFromEdit() {
        const id = state.editingId || state.viewingId;
        if (id) {
            window.showCertificateDetailsView(id);
            return;
        }
        showListView();
    }

    // ============================================
    // ARCHIVE
    // ============================================

    window.showArchiveConfirmModal = function (id) {
        state.pendingArchiveId = id;
        setVisible($('archiveCertificateModal'), true, 'flex');
    };

    function closeArchiveModal() {
        setVisible($('archiveCertificateModal'), false, 'flex');
        state.pendingArchiveId = null;
    }

    async function proceedWithArchive() {
        const id = state.pendingArchiveId;
        if (!id) return;

        const button = $('confirmArchiveBtn');
        if (button) button.disabled = true;

        const result = await apiCall(CERT_ENDPOINT + '?id=' + encodeURIComponent(id), 'DELETE');

        if (button) button.disabled = false;

        closeArchiveModal();

        if (!result || result.success !== true) {
            notify((result && result.message) || 'Failed to archive the certificate. Please try again.');
            return;
        }

        if (String(state.viewingId) === String(id)) {
            state.viewingId = null;
            showListView();
        } else {
            await loadCertificatesTable();
        }

        notify(result.message || 'Certificate has been archived successfully!');
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================

    function setupEventListeners() {
        const saveBtn = $('saveCertificateBtn');
        if (saveBtn) saveBtn.addEventListener('click', saveCertificate);

        const searchInput = $('searchIssuances');
        if (searchInput) {
            searchInput.addEventListener('input', function (event) {
                const term = event.target.value.trim();
                if (state.searchTimer) clearTimeout(state.searchTimer);
                state.searchTimer = setTimeout(function () {
                    state.search = term;
                    state.page = 1;
                    loadCertificatesTable();
                }, 250);
            });
        }

        setupResidentSearch();

        const bind = function (id, handler) {
            const el = $(id);
            if (el) el.addEventListener('click', handler);
        };

        bind('backToCertificatesBtn', showListView);
        bind('backToDetailsFromEditBtn', backToDetailsFromEdit);
        bind('editFromDetailsBtn', function () {
            if (state.viewingId) window.showEditConfirmModal(state.viewingId);
        });
        bind('cancelEditViewBtn', backToDetailsFromEdit);
        bind('saveEditViewBtn', saveEditedCertificateView);
        bind('cancelConfirmEditBtn', closeEditConfirmModal);
        bind('confirmEditBtn', window.proceedWithEdit);
        bind('cancelArchiveBtn', closeArchiveModal);
        bind('confirmArchiveBtn', proceedWithArchive);
        bind('closeDeleteModalBtn', function () { setVisible($('deleteCertificateModal'), false, 'flex'); });
        bind('cancelDeleteBtn', function () { setVisible($('deleteCertificateModal'), false, 'flex'); });
        bind('closeViewModalBtn', closeViewModal);
        bind('closeViewFooterBtn', closeViewModal);
        bind('printCertificateBtn', printCertificate);

        document.querySelectorAll('.modal-overlay').forEach(function (modal) {
            modal.addEventListener('click', function (event) {
                if (event.target === modal) {
                    setVisible(modal, false, 'flex');
                }
            });
        });
    }

    // Global exports used by the module markup.
    window.initCertificates = initCertificates;
    window.loadCertificatesTable = loadCertificatesTable;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(initCertificates, 100); });
    } else {
        setTimeout(initCertificates, 100);
    }
})();

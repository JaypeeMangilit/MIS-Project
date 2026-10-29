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
        else if (type.indexOf('Barangay Certification') !== -1) typeCode = 'CERT';

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
        if (type.indexOf('First-time Job Seeker') !== -1) return 'first-time-job-seeker';
        if (type.indexOf('Certification') !== -1) return 'certificate';
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

        if (window.applyModuleReadOnly) {
            window.applyModuleReadOnly({
                saveBtnIds: ['saveCertificateBtn'],
                editSelectors: ['.action-btn[onclick*="showEditConfirmModal"]', '#editFromDetailsBtn'],
            });
        }
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

    /**
     * Build the printable certificate in the Barangay's official format.
     *
     * Each certificate type has its own body text, matching the issued templates. The
     * header, seal and signatory are common to all three.
     */
    async function printCertificate() {
        const certificate = state.viewingId ? await fetchCertificate(state.viewingId) : null;
        if (!certificate) {
            notify('Open a certificate first, then print it.');
            return;
        }

        // The signatory comes from the API response, not the row.
        let signatory = null;
        try {
            const result = await apiCall(CERT_ENDPOINT + '?id=' + encodeURIComponent(certificate.id));
            if (result && result.signatory) signatory = result.signatory;
        } catch (error) {
            // A missing signatory must not block printing; fall through to the default.
        }
        const signatoryName = signatory && signatory.name ? signatory.name : 'PUNONG BARANGAY';
        const signatoryTitle = signatory && signatory.position ? signatory.position : 'Punong Barangay';

        const seal = await readImageAsDataUrl('Images/brgy-seal.png');
        const brgyLogo = await readImageAsDataUrl('Images/Brgy.png');

        const html = buildCertificateDocument(certificate, signatoryName, signatoryTitle, seal, brgyLogo);

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            notify('Please allow pop-ups for this page so the certificate can be printed.');
            return;
        }

        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();

        // Wait for the seal image before printing, otherwise the first print can be blank.
        if (seal) {
            printWindow.document.images[0].onload = function () { printWindow.print(); };
        } else {
            printWindow.print();
        }
    }

    /** Read an image so the print window does not depend on this page's relative path. */
    async function readImageAsDataUrl(path) {
        const response = await fetch(path);
        if (!response.ok) return '';
        const blob = await response.blob();
        return await new Promise(function (resolve) {
            const reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = function () { resolve(''); };
            reader.readAsDataURL(blob);
        });
    }

    /**
     * An underlined blank with the value written onto it.
     *
     * The issued templates print the data ON the underline with no caption label, so the
     * label is deliberately absent here.
     */
    /** Longhand date as the templates use it, e.g. "October 25, 2026". */
    function longDate(value) {
        if (!value) return '';
        const date = new Date(String(value).replace(' ', 'T'));
        if (isNaN(date.getTime())) return String(value);
        return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }

    /** The resident's age, taken from the birth date on the record. */
    function residentAge(certificate) {
        if (!certificate.birth_date) return '';
        const birth = new Date(String(certificate.birth_date).replace(' ', 'T'));
        if (isNaN(birth.getTime())) return '';
        const now = new Date();
        let age = now.getFullYear() - birth.getFullYear();
        const month = now.getMonth() - birth.getMonth();
        if (month < 0 || (month === 0 && now.getDate() < birth.getDate())) age--;
        return String(age);
    }

    /** The resident's length of residence, taken from the move-in date on the record. */
    function residentLengthOfResidence(certificate) {
        const raw = String(certificate.resident_length_of_residence || certificate.move_in_date || '').trim();
        if (!raw) return '';
        if (certificate.resident_length_of_residence) return certificate.resident_length_of_residence;
        const parts = raw.split('-').map(Number);
        const start = new Date(parts[0], parts[1] - 1, parts[2]);
        if (isNaN(start.getTime())) return '';
        const now = new Date();
        if (start.getTime() > now.getTime()) return '';
        let years = now.getFullYear() - start.getFullYear();
        let months = now.getMonth() - start.getMonth();
        let days = now.getDate() - start.getDate();
        if (days < 0) {
            months--;
            const prev = new Date(now.getFullYear(), now.getMonth(), 0);
            days += prev.getDate();
        }
        if (months < 0) {
            years--;
            months += 12;
        }
        if (years < 0) return '';
        if (years === 0 && months === 0 && days === 0) return 'Today';
        const out = [];
        if (years > 0) out.push(years + ' year' + (years !== 1 ? 's' : ''));
        if (months > 0) out.push(months + ' month' + (months !== 1 ? 's' : ''));
        if (days > 0) out.push(days + ' day' + (days !== 1 ? 's' : ''));
        return out.join(' and ');
    }

    /** Full residential address as it appears on the certificate. */
    function residentFullAddress(certificate) {
        const parts = [
            certificate.street_name,
            certificate.house_no,
            certificate.subdivision,
            certificate.purok
        ].map(function (part) { return String(part || '').trim(); }).filter(function (part) { return part !== ''; });

        if (parts.length) return parts.join(', ');

        return certificate.resident_address || '';
    }

    function certBlank(value, width) {
        return '<span class="cert-blank"' + (width ? ' style="min-width:' + width + 'px"' : '') + '>'
            + (value ? escapeHtml(String(value)) : '')
            + '</span>';
    }

    /**
     * The body of the certificate, in the field order the Barangay uses:
     * Name, then age, then sex/gender, then residential address, then purpose and date.
     *
     * Each value is written onto an underlined blank - there is no caption label, the data
     * simply fills the blank in the sentence.
     */
    function certificateBody(certificate) {
        const name = String(certificate.resident_name || '').replace(/^,\s*/, '');
        const age = residentAge(certificate);
        const gender = String(certificate.gender || '').trim() || 'male/female';
        const address = residentFullAddress(certificate) || 'San Antonio, Cavite City';
        const issued = longDate(certificate.date_issued);
        const purpose = String(certificate.purpose || '').trim();
        const type = String(certificate.certificate_type || '');

        const nameBlank = certBlank(name, 220);
        const ageBlank = certBlank(age, 70);
        const genderBlank = certBlank(gender, 100);
        const addressBlank = certBlank(address, 320);
        const dateBlank = certBlank(issued, 180);
        const lengthBlank = certBlank(residentLengthOfResidence(certificate), 120);

        if (type.indexOf('Indigency') !== -1) {
            return '<p class="cert-paragraph">This is to certify that '
                + nameBlank + ' ' + ageBlank + ' years old, ' + genderBlank
                + ', Filipino, whose name and signature appear below is bona fide and a resident of, '
                + addressBlank + ', San Antonio, Cavite City and a registered/accredited member of this Barangay.</p>'
                + '<p class="cert-paragraph">That this person is known to me to be a law-abiding citizen, with good moral character and not connected to any subversive organization and has been found to belong to an <strong>INDIGENT FAMILY</strong> after interview and case study has been made.</p>'
                + '<h4 class="cert-subheading">PURPOSE: ' + certBlank(purpose, 300) + '</h4>'
                + '<p class="cert-paragraph">This certification is being issued upon request of the above-named person this day of, ' + dateBlank + '.</p>';
        }

        if (type.indexOf('Certification') !== -1) {
            return '<p class="cert-paragraph">This is to certify that '
                + nameBlank + ' ' + ageBlank + ' years old, ' + genderBlank
                + ', Filipino, and a resident of, ' + addressBlank
                + ', has no pending administrative or criminal case file in this office with good moral character, a law-abiding citizen and bona fide member of this Barangay.</p>'
                + '<p class="cert-paragraph">This certification is issued upon the request of the above-named this day of, ' + dateBlank + '.</p>';
        }

        if (type.indexOf('Clearance') !== -1) {
            return '<p class="cert-paragraph">This is to certify that '
                + nameBlank + ' ' + genderBlank
                + ', Filipino, and a resident of, ' + addressBlank
                + ', Cavite is known to be of good moral character and law-abiding citizen in the community.</p>'
                + '<p class="cert-paragraph">To certify further, that he/she has no derogatory and/or criminal records filed in this barangay.</p>'
                + '<p class="cert-paragraph">ISSUED this day of, ' + dateBlank
                + ' at Barangay 49A-Akasya San Antonio, Cavite City upon request of the interested party.</p>';
        }

        if (type.indexOf('First-time Job Seeker') !== -1) {
            return '<p class="cert-paragraph">This is to certify that '
                + nameBlank + ', a resident of, ' + addressBlank
                + ', for ' + lengthBlank + ', is a qualified availed of RA 11261 or the First Time Jobseeker Act of 2019.</p>'
                + '<p class="cert-paragraph">I further certify that the holder/bearer was informed of his/her rights, including the duties and responsibilities accorded by RA 11261 through the Oath of Understanding he/she has signed and executed in the presence of our Barangay Official/s.</p>'
                + '<p class="cert-paragraph">Signed this ' + dateBlank + ' in the City of Cavite.</p>'
                + '<p class="cert-paragraph">This certification is valid only (one) 1 year from the date of issuance.</p>'
                + '<div style="break-before: page;"></div>'
                + '<h4 class="cert-subheading">OATH OF UNDERTAKING</h4>'
                + '<p class="cert-paragraph">I, ' + nameBlank + ', __ years of age, resident of Brgy 49A-Akasya, Zone VII, for ' + lengthBlank + ', availing the benefits of Republic Act 11261, otherwise known as the First Time Jobseekers Act of 2019, do hereby declare, agree and undertake to abide and be bound by the following:</p>'
                + '<p class="cert-paragraph">1. That I will not use the certificate for any unlawful purpose;</p>'
                + '<p class="cert-paragraph">2. That I will inform and/or report to the Barangay personally, through text or other means, or through my family/relatives once I get employed; and</p>'
                + '<p class="cert-paragraph">3. That I am not a beneficiary of the JobStart Program under R.A. No. 10869 and other laws that give similar exemptions for the documents or transactions exempted under R.A. No. 11261</p>'
                + '<p class="cert-paragraph">4. That if issued the requested Certification, I will not use the same in any fraud, neither falsify nor help and/or assist in the fabrication of the said certification.</p>'
                + '<p class="cert-paragraph">5. That this undertaking is made solely for the purpose of obtaining a Barangay Certification consistent with the objective of R.A. No. 11261 and not for any other purpose.</p>'
                + '<p class="cert-paragraph">6. That I consent to the use of my personal information pursuant to the Data Privacy Act and other applicable laws, rules, and regulations.</p>'
                + '<p class="cert-paragraph">Signed this ___ day of ____, 2026, in the City of Cavite.</p>';
        }

        // Any other type still in the records.
        return '<p class="cert-paragraph">This is to certify that '
            + nameBlank + ' ' + ageBlank + ' years old, ' + genderBlank
            + ', Filipino and a resident of ' + addressBlank
            + ', is a bona fide member of this Barangay of good moral character and a law-abiding citizen.</p>'
            + '<p class="cert-paragraph">This certification is issued upon the request of the above-named this day of, ' + dateBlank + '.</p>';
    }

    function buildCertificateDocument(certificate, signatoryName, signatoryTitle, seal, brgyLogo) {
        const type = String(certificate.certificate_type || '');
        const title = type.indexOf('Indigency') !== -1
            ? 'BARANGAY INDIGENCY'
            : (type.indexOf('First-time Job Seeker') !== -1
                ? 'BARANGAY CERTIFICATION'
                : (type.indexOf('Certification') !== -1
                    ? 'BARANGAY CERTIFICATION'
                    : (type.indexOf('Clearance') !== -1 ? 'BARANGAY CLEARANCE' : 'CERTIFICATION')));
        const subtitle = type.indexOf('First-time Job Seeker') !== -1
            ? '(First Time Job Seeker Assistant Act - RA 1121)'
            : '';

        // The Certification template ends with a signature-over-printed-name block; the
        // other two do not.
        const isCertification = type.indexOf('Certification') !== -1;

        const sealTag = seal ? '<img class="cert-seal" src="' + seal + '" alt="">' : '';
        const brgyTag = brgyLogo ? '<img class="cert-brgy-logo" src="' + brgyLogo + '" alt="">' : '';
        const backgroundTag = brgyLogo ? '<div class="cert-background"></div>' : '';

        return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + escapeHtml(title) + '</title>'
            + '<style>'
            + '@page { size: A4; margin: 16mm; }'
            // print-color-adjust keeps the Control No. highlight visible on paper and in
            // a downloaded PDF; without it browsers drop background colours.
            + 'html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }'
            + 'body { font-family: "Times New Roman", Times, serif; color: #000; margin: 0; padding: 22px 40px; font-size: 12pt; line-height: 1.6; position: relative; }'
            + '.cert-background { position: fixed; left: 50%; top: 50%; width: 650px; height: 650px; '
            + 'transform: translate(-50%, -50%); opacity: 0.08; z-index: -1; pointer-events: none; '
            + 'background-image: var(--brgy-logo); background-size: contain; background-repeat: no-repeat; '
            + 'background-position: center; }'
            + '.cert-header { text-align: center; position: relative; padding-bottom: 14px; margin-bottom: 24px; min-height: 100px; }'
            + '.cert-seal { position: absolute; left: 0; top: 0; width: 100px; height: 100px; object-fit: contain; }'
            + '.cert-brgy-logo { position: absolute; right: 0; top: 0; width: 100px; height: 100px; object-fit: contain; }'
            + '.cert-header .line { font-size: 10.5pt; margin: 1px 0; }'
            + '.cert-header .office { font-family: Arial, Helvetica, sans-serif; font-weight: bold; font-size: 11.5pt; margin-top: 5px; }'
            + '.cert-title { font-family: Arial, Helvetica, sans-serif; text-align: center; font-size: 19pt; font-weight: bold; '
            + 'letter-spacing: 0.5px; margin: 18px 0 14px 0; padding: 8px 0 6px 0; border-top: 1px solid #000; border-bottom: 1px solid #000; }'
            + '.cert-control-wrap { text-align: center; margin-bottom: 18px; }'
            + '.cert-control { font-weight: bold; font-size: 12pt; background: #14532d; color: #fff; padding: 2px 8px; display: inline-block; }'
            + '.cert-subheading { font-family: Arial, Helvetica, sans-serif; font-size: 12.5pt; margin: 16px 0 6px 0; }'
            + '.cert-control-wrap { text-align: center; margin: 0 0 14px 0; }'
            + '.cert-subtitle { text-align: center; font-family: Arial, Helvetica, sans-serif; font-size: 12pt; font-weight: normal; margin-top: 4px; }'
            + '.cert-salutation { margin-top: 0; }'
            + '.cert-paragraph { text-align: justify; margin: 0 0 10px 0; }'
            // The data sits on the underline; there is no caption label.
            + '.cert-blank { display: inline-block; vertical-align: baseline; font-weight: bold; '
            + 'text-align: center; border-bottom: 1px solid #000; padding: 0 4px 1px 4px; min-height: 15px; }'
            + '.cert-signatory { margin-top: 40px; text-align: center; }'
            + '.cert-signatory .name { font-weight: bold; text-decoration: underline; font-size: 13pt; }'
            + '.cert-signatory .title { font-size: 11pt; margin-top: 2px; }'
            + '.cert-signature-line { margin-top: 30px; text-align: center; }'
            + '.cert-signature-line .line { border-top: 1px solid #000; display: inline-block; width: 220px; }'
            + '.cert-signature-line .caption { font-size: 9.5pt; margin-top: 4px; }'
            + '</style></head><body' + (brgyLogo ? ' style="--brgy-logo:url(' + brgyLogo + ')"' : '') + '>'
            + backgroundTag
            + '<div class="cert-header">'
            + sealTag
            + brgyTag
            + '<div class="line">Republic of the Philippines</div>'
            + '<div class="line">Province of Cavite</div>'
            + '<div class="line">City of Cavite</div>'
            + '<div class="line">Barangay 49-A (AKASYA)</div>'
            + '<div class="line">+63 977-7483-304</div>'
            + '<div class="office">OFFICE OF THE SANGGUNIANG BARANGAY</div>'
            + '</div>'
            + '<div class="cert-title">'
            + escapeHtml(title)
            + (subtitle ? '<div class="cert-subtitle">' + escapeHtml(subtitle) + '</div>' : '')
            + '</div>'
            + '<div class="cert-control-wrap"><span class="cert-control">Control No.: ' + escapeHtml(generateControlNumber(certificate)) + '</span></div>'
            + '<h4 class="cert-subheading cert-salutation">TO WHOM IT MAY CONCERN:</h4>'
            + certificateBody(certificate)
            + '<h4 class="cert-subheading">CERTIFIED BY:</h4>'
            + '<div class="cert-signatory">'
            + '<div class="name">' + escapeHtml(signatoryName) + '</div>'
            + '<div class="title">' + escapeHtml(signatoryTitle) + '</div>'
            + '</div>'
            + (isCertification
                ? '<div class="cert-signature-line"><span class="line"></span><div class="caption">SIGNATURE OVER PRINTED NAME</div></div>'
                : '')
            + '</body></html>';
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
        if ($('detailsLengthOfResidence')) $('detailsLengthOfResidence').textContent = certificate.resident_length_of_residence || '—';
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
        // The details page is the reachable view, so Print lives there too.
        bind('printFromDetailsBtn', printCertificate);

        // Exposed so the print output can be checked directly, and so the button is not
        // the only way in.
        window.printCertificate = printCertificate;

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
window.showListView = showListView;
    window.loadCertificatesTable = loadCertificatesTable;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(initCertificates, 100); });
    } else {
        setTimeout(initCertificates, 100);
    }
})();

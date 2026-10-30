// Wrapped in an IIFE on purpose: sidebar.js removes and re-adds this script on
// every visit, and a second top-level const/let would throw
// "Identifier has already been declared", leaving the PREVIOUS load's state
// serving a freshly injected DOM. Nothing outside this file references its
// internals - the entry point is assigned to window below.

(function () {
    'use strict';

    const API_BASE_URL = 'api/';

    async function apiCall(endpoint, method, data) {
        const url = API_BASE_URL + endpoint;
        const options = {
            method: method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            credentials: 'same-origin',
        };

        if (data !== null && data !== undefined && method !== 'GET') {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(url, options);
        const raw = await response.text();
        let result;
        try {
            result = raw.length ? JSON.parse(raw) : {};
        } catch (error) {
            console.error('API returned non-JSON from ' + url + ':', raw);
            return {
                success: false,
                status: response.status,
                message: 'Server returned an invalid response.',
            };
        }

        if (!response.ok && result.success === undefined) {
            result.success = false;
        }
        result.status = response.status;
        return result;
    }

    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatDate(value) {
        if (!value) return '';
        var parts = String(value).split('-');
        if (parts.length !== 3) return value;
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        var monthIndex = parseInt(parts[1], 10) - 1;
        var month = months[monthIndex] || parts[1];
        return month + ' ' + parseInt(parts[2], 10) + ', ' + parts[0];
    }

    function formatDateTime(value) {
        if (!value) return 'Never';
        var raw = String(value).replace('T', ' ');
        var datePart = raw.slice(0, 10);
        var timePart = raw.slice(11, 19);
        var bits = datePart.split('-');
        if (bits.length !== 3) return raw;
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        var monthIndex = parseInt(bits[1], 10) - 1;
        var month = months[monthIndex] || bits[1];
        var hour = parseInt(timePart.slice(0, 2), 10);
        var suffix = hour >= 12 ? 'PM' : 'AM';
        var displayHour = hour % 12;
        if (displayHour === 0) displayHour = 12;
        return month + ' ' + parseInt(bits[2], 10) + ', ' + bits[0] + ' ' +
               displayHour + ':' + timePart.slice(3, 5) + ' ' + suffix;
    }

    // ===== Initialize the page =====
    async function initReports() {
        await Promise.all([
            loadDemographicsChart(),
            loadCertificateChart(),
            loadBlotterProgress(),
            loadInventoryProgress(),
            loadReportsHistory()
        ]);
        setupEventListeners();
    }

    window.initReports = initReports;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(initReports, 100);
        });
    } else {
        setTimeout(initReports, 100);
    }

    function setupEventListeners() {
        // Export button - shows export configuration view
        const exportBtn = document.getElementById('exportAllBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', showExportReportsView);
        }

        // Back button
        const backBtn = document.getElementById('backToListFromExportBtn');
        if (backBtn) {
            backBtn.addEventListener('click', showReportsListView);
        }

        // Cancel button
        const cancelBtn = document.getElementById('cancelExportBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', showReportsListView);
        }

        // Generate export button
        const generateBtn = document.getElementById('generateExportBtn');
        if (generateBtn) {
            generateBtn.addEventListener('click', generateExport);
        }

        // Module chips selection
        document.querySelectorAll('.module-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.module-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
            });
        });

        // Format chips selection
        document.querySelectorAll('.format-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.format-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
            });
        });

        // Quick select date range
        const quickSelect = document.getElementById('exportQuickSelect');
        if (quickSelect) {
            quickSelect.addEventListener('change', () => {
                var value = quickSelect.value;
                var today = new Date();
                var startDate = document.getElementById('exportStartDate');
                var endDate = document.getElementById('exportEndDate');

                if (value === 'all') {
                    if (startDate) startDate.value = '';
                    if (endDate) endDate.value = '';
                } else if (value === 'today') {
                    var dd = String(today.getDate()).padStart(2, '0');
                    var mm = String(today.getMonth() + 1).padStart(2, '0');
                    var yyyy = today.getFullYear();
                    var dateStr = yyyy + '-' + mm + '-' + dd;
                    if (startDate) startDate.value = dateStr;
                    if (endDate) endDate.value = dateStr;
                } else if (value === 'week') {
                    var weekAgo = new Date(today);
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    if (startDate) startDate.value = formatDateInput(weekAgo);
                    if (endDate) endDate.value = formatDateInput(today);
                } else if (value === 'month') {
                    var monthAgo = new Date(today);
                    monthAgo.setMonth(monthAgo.getMonth() - 1);
                    if (startDate) startDate.value = formatDateInput(monthAgo);
                    if (endDate) endDate.value = formatDateInput(today);
                } else if (value === 'year') {
                    var yearAgo = new Date(today);
                    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
                    if (startDate) startDate.value = formatDateInput(yearAgo);
                    if (endDate) endDate.value = formatDateInput(today);
                }
            });
        }

        // Search reports
        const searchInput = document.getElementById('searchReports');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                currentSearch = e.target.value.toLowerCase();
                loadReportsHistory();
            });
        }

        // Menu dots - add click handlers
        document.querySelectorAll('.menu-dots').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const card = btn.closest('.report-card');
                const title = card ? card.querySelector('h3')?.textContent?.trim() || 'Report' : 'Report';
                showNotification('Options for ' + title + ': Print, Refresh, Export', 'info');
            });
        });
    }

    function formatDateInput(date) {
        var dd = String(date.getDate()).padStart(2, '0');
        var mm = String(date.getMonth() + 1).padStart(2, '0');
        var yyyy = date.getFullYear();
        return yyyy + '-' + mm + '-' + dd;
    }

    // ===== Demographics Chart =====
    async function loadDemographicsChart() {
        const container = document.getElementById('demographicsChart');
        if (!container) return;

        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">Loading...</div>';

        try {
            const result = await apiCall('residents.php?action=demographics');
            const data = result.success && result.data ? result.data : [];
            const maxValue = Math.max(...data.map(d => d.value || 0), 1);

            if (data.length === 0) {
                container.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">No data available</div>';
                return;
            }

            container.innerHTML = data.map(item => {
                const heightPercent = ((item.value || 0) / maxValue) * 100;
                return `
                    <div class="bar-item">
                        <div class="bar-value">${item.value || 0}</div>
                        <div class="bar" style="height: ${heightPercent}%; background: #0F6CBD;"></div>
                        <div class="bar-label">${escapeHtml(item.label || '')}</div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Failed to load demographics:', error);
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">Failed to load data</div>';
        }
    }

    // ===== Blotter Progress =====
    async function loadBlotterProgress() {
        const container = document.getElementById('blotterProgress');
        if (!container) return;

        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">Loading...</div>';

        try {
            const result = await apiCall('blotter.php?action=stats');
            const data = result.success && result.data ? result.data : [];

            if (data.length === 0) {
                container.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">No data available</div>';
                return;
            }

            container.innerHTML = data.map(item => {
                const colorClass = item.label === 'Settled' ? 'green' :
                                   item.label === 'Ongoing' ? 'yellow' :
                                   item.label === 'Referred to PNP' ? 'blue' : 'red';
                return `
                    <div class="progress-item">
                        <div class="progress-header">
                            <span class="progress-label">${escapeHtml(item.label)}</span>
                            <span class="progress-percent">${item.value} Cases (${item.percent}%)</span>
                        </div>
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill ${colorClass}" style="width: ${item.percent}%"></div>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Failed to load blotter stats:', error);
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">Failed to load data</div>';
        }
    }

    // ===== Certificate Chart =====
    async function loadCertificateChart() {
        const container = document.getElementById('certificateChart');
        if (!container) return;

        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">Loading...</div>';

        try {
            const result = await apiCall('certificates.php?action=stats');
            const data = result.success && result.data ? result.data : [];
            const maxValue = Math.max(...data.map(d => d.value || 0), 1);

            if (data.length === 0) {
                container.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">No data available</div>';
                return;
            }

            container.innerHTML = data.map(item => {
                const heightPercent = ((item.value || 0) / maxValue) * 100;
                return `
                    <div class="bar-item">
                        <div class="bar-value">${item.value || 0}</div>
                        <div class="bar" style="height: ${heightPercent}%; background: #1F8F5F;"></div>
                        <div class="bar-label">${escapeHtml(item.label || '')}</div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Failed to load certificate stats:', error);
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">Failed to load data</div>';
        }
    }

    // ===== Inventory Progress =====
    async function loadInventoryProgress() {
        const container = document.getElementById('inventoryProgress');
        if (!container) return;

        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">Loading...</div>';

        try {
            const result = await apiCall('inventory.php?action=stats');
            const data = result.success && result.data ? result.data : null;

            if (!data) {
                container.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">No data available</div>';
                return;
            }

            const total = (data.totalItems || 0) + (data.borrowedItems || 0);
            const items = [
                { label: 'Available / In Stock', value: data.availableStock || 0, total: total || 1, color: 'green' },
                { label: 'Borrowed / Deployed', value: data.borrowedItems || 0, total: total || 1, color: 'yellow' },
                { label: 'Low Stock Alerts', value: data.lowStockAlerts || 0, total: total || 1, color: 'red' },
            ];

            container.innerHTML = items.map(item => {
                const percent = item.total > 0 ? Math.round((item.value / item.total) * 100) : 0;
                return `
                    <div class="progress-item">
                        <div class="progress-header">
                            <span class="progress-label">${escapeHtml(item.label)}</span>
                            <span class="progress-percent">${item.value} Items (${percent}%)</span>
                        </div>
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill ${item.color}" style="width: ${percent}%"></div>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Failed to load inventory stats:', error);
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">Failed to load data</div>';
        }
    }

    // ===== Reports History =====
    let currentSearch = '';

    async function loadReportsHistory() {
        const tbody = document.getElementById('reportsTableBody');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px;">Loading...</td></tr>';

        try {
            const [certResult, blotterResult] = await Promise.all([
                apiCall('certificates.php?limit=10'),
                apiCall('blotter.php?limit=10')
            ]);

            var reports = [];

            if (certResult.success && certResult.data) {
                certResult.data.forEach(function(cert) {
                    reports.push({
                        name: 'Certificate Issuance - ' + (cert.certificate_type || 'Unknown'),
                        date: cert.date_issued || cert.created_at || '',
                        format: 'PDF',
                        generatedBy: cert.issued_by || 'System'
                    });
                });
            }

            if (blotterResult.success && blotterResult.data) {
                blotterResult.data.forEach(function(case_) {
                    reports.push({
                        name: 'Blotter Case - ' + (case_.case_number || '#' + case_.id),
                        date: case_.incident_date || case_.created_at || '',
                        format: 'PDF',
                        generatedBy: case_.complainant_name || 'System'
                    });
                });
            }

            reports.sort(function(a, b) {
                return new Date(b.date) - new Date(a.date);
            });

            let filteredReports = reports;
            if (currentSearch) {
                filteredReports = reports.filter(function(report) {
                    return report.name.toLowerCase().includes(currentSearch) ||
                           report.generatedBy.toLowerCase().includes(currentSearch);
                });
            }

            if (filteredReports.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px;">No reports found</td></tr>';
                return;
            }

            tbody.innerHTML = filteredReports.map(function(report, index) {
                return `
                    <tr>
                        <td>${escapeHtml(report.name)}</td>
                        <td>${formatDate(report.date)}</td>
                        <td><span class="format-badge ${report.format.toLowerCase()}">${report.format}</span></td>
                        <td>${escapeHtml(report.generatedBy)}</td>
                        <td>
                            <button class="download-btn" onclick="window.downloadReport(${index})">
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                    <path d="M2.33 9.33H11.67M7 2.33V9.33M7 9.33L4.67 7M7 9.33L9.33 7" stroke="#16324A" stroke-width="1.17" stroke-linecap="round"/>
                                </svg>
                                <span>Download</span>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');

            window.reportsHistoryData = filteredReports;
        } catch (error) {
            console.error('Failed to load reports history:', error);
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px;">Failed to load data</td></tr>';
        }
    }

    // ===== EXPORT REPORTS =====
    function showExportReportsView() {
        var listView = document.getElementById('reportsListView');
        var exportView = document.getElementById('exportReportsView');
        if (listView) listView.style.display = 'none';
        if (exportView) exportView.style.display = 'block';
        loadRecentExports();
    }

    function showReportsListView() {
        var listView = document.getElementById('reportsListView');
        var exportView = document.getElementById('exportReportsView');
        if (exportView) exportView.style.display = 'none';
        if (listView) listView.style.display = 'block';
    }

    function loadRecentExports() {
        var tbody = document.getElementById('recentExportsTableBody');
        if (!tbody) return;
        var exports = JSON.parse(localStorage.getItem('reportsExports') || '[]');
        if (exports.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">No exports yet. Generate your first export above.</td></tr>';
            return;
        }
        tbody.innerHTML = exports.map(function(exp) {
            return '<tr>' +
                '<td>' + escapeHtml(exp.date) + '</td>' +
                '<td>' + escapeHtml(exp.fileName) + '</td>' +
                '<td>' + escapeHtml(exp.filters) + '</td>' +
                '<td>' + exp.records + '</td>' +
                '<td><span class="format-badge ' + exp.format.toLowerCase() + '">' + escapeHtml(exp.format) + '</span></td>' +
                '<td><button class="download-again-btn" onclick="window.downloadExportAgain(' + exp.id + ')">Download Again</button></td>' +
                '</tr>';
        }).join('');
    }

    function saveExportRecord(fileName, filters, records, format) {
        var exports = JSON.parse(localStorage.getItem('reportsExports') || '[]');
        var newExport = {
            id: Date.now(),
            fileName: fileName,
            filters: filters,
            records: records,
            format: format,
            date: new Date().toLocaleString()
        };
        exports.unshift(newExport);
        if (exports.length > 10) exports.pop();
        localStorage.setItem('reportsExports', JSON.stringify(exports));
        loadRecentExports();
    }

    function buildPrintHtml(title, rows) {
        var html = '<!DOCTYPE html><html><head><title>' + escapeHtml(title) + '</title>';
        html += '<style>';
        html += 'body{font-family:Arial,sans-serif;margin:30px;color:#16324A;}';
        html += 'h1{font-size:20px;margin-bottom:6px;}';
        html += 'p{font-size:12px;color:#6b7c93;margin-top:0;}';
        html += 'table{border-collapse:collapse;width:100%;margin-top:18px;}';
        html += 'th,td{border:1px solid #D6E2EA;padding:8px 10px;text-align:left;font-size:13px;}';
        html += 'th{background:#F4F8FB;font-weight:600;}';
        html += 'tr:nth-child(even){background:#fafbfc;}';
        html += '.footer{margin-top:24px;font-size:11px;color:#6b7c93;}';
        html += '@media print{body{margin:0;}}';
        html += '</style></head><body>';
        html += '<h1>' + escapeHtml(title) + '</h1>';
        html += '<p>Generated on ' + (new Date().toLocaleString()) + '</p>';
        html += '<table><thead><tr>';
        if (rows.length && rows[0]._columns) {
            rows[0]._columns.forEach(function(col) {
                html += '<th>' + escapeHtml(col) + '</th>';
            });
        }
        html += '</tr></thead><tbody>';
        rows.forEach(function(row) {
            html += '<tr>';
            if (row._columns) {
                row._columns.forEach(function(col) {
                    html += '<td>' + escapeHtml(String(row[col] || '')) + '</td>';
                });
            }
            html += '</tr>';
        });
        html += '</tbody></table>';
        html += '<div class=footer>Barangay 49 Akasya - Reports & Analytics</div>';
        html += '</body></html>';
        return html;
    }

    function openPrintWindow(title, rows) {
        var html = buildPrintHtml(title, rows);
        var win = window.open('', '_blank');
        if (!win) {
            showNotification('Pop-up blocked. Please allow pop-ups for this site.', 'info');
            return;
        }
        win.document.open();
        win.document.write(html);
        win.document.close();
        setTimeout(function() {
            win.focus();
            win.print();
        }, 400);
    }

    function generateExport() {
        var activeModule = document.querySelector('.module-chip.active')?.getAttribute('data-module') || 'all';
        var activeFormat = document.querySelector('.format-chip.active')?.getAttribute('data-format') || 'pdf';
        var startDate = document.getElementById('exportStartDate')?.value || '';
        var endDate = document.getElementById('exportEndDate')?.value || '';
        var quickSelect = document.getElementById('exportQuickSelect')?.value || 'all';

        var moduleLabels = {
            'all': 'All Data',
            'residents': 'Resident Records',
            'blotter': 'Blotter Cases',
            'certificates': 'Certificates',
            'inventory': 'Inventory Logs'
        };

        var reports = window.reportsHistoryData || [];
        var filteredReports = reports;
        var filterText = [];

        // Filter by module
        if (activeModule !== 'all') {
            filteredReports = filteredReports.filter(function(r) {
                return r.name.toLowerCase().indexOf(activeModule) !== -1;
            });
            filterText.push(moduleLabels[activeModule] || activeModule);
        }

        // Filter by date range
        if (startDate && endDate) {
            var start = new Date(startDate);
            var end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            filteredReports = filteredReports.filter(function(r) {
                var reportDate = new Date(r.date);
                return reportDate >= start && reportDate <= end;
            });
            filterText.push(startDate + ' to ' + endDate);
        } else if (quickSelect && quickSelect !== 'all') {
            var now = new Date();
            var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            var rangeStart, rangeEnd = new Date(today);
            rangeEnd.setHours(23, 59, 59, 999);

            switch (quickSelect) {
                case 'today':
                    rangeStart = today;
                    filterText.push('Today');
                    break;
                case 'week':
                    rangeStart = new Date(today);
                    rangeStart.setDate(rangeStart.getDate() - 7);
                    filterText.push('This Week');
                    break;
                case 'month':
                    rangeStart = new Date(today);
                    rangeStart.setMonth(rangeStart.getMonth() - 1);
                    filterText.push('This Month');
                    break;
                case 'year':
                    rangeStart = new Date(today);
                    rangeStart.setFullYear(rangeStart.getFullYear() - 1);
                    filterText.push('This Year');
                    break;
                default:
                    rangeStart = null;
            }

            if (rangeStart) {
                filteredReports = filteredReports.filter(function(r) {
                    var reportDate = new Date(r.date);
                    return reportDate >= rangeStart && reportDate <= rangeEnd;
                });
            }
        }

        if (filteredReports.length === 0) {
            showNotification('No reports match the selected filters.', 'info');
            return;
        }

        var rows = filteredReports.map(function(r) {
            return {
                _columns: ['Report Name', 'Date', 'Format', 'Generated By'],
                'Report Name': r.name,
                'Date': r.date,
                'Format': r.format,
                'Generated By': r.generatedBy
            };
        });

        var fileName = 'Reports_Export_' + new Date().toISOString().slice(0, 10);
        if (filterText.length > 0) {
            fileName += '_' + filterText.join('_').replace(/[^a-z0-9]/gi, '_');
        }
        fileName += '.pdf';

        saveExportRecord(fileName, filterText.length > 0 ? filterText.join(', ') : 'All Reports', filteredReports.length, activeFormat.toUpperCase());
        openPrintWindow('Reports History - Export', rows);
        showNotification('Preparing export...', 'info');
    }

    window.downloadExportAgain = function(id) {
        var exports = JSON.parse(localStorage.getItem('reportsExports') || '[]');
        var exp = exports.find(function(e) { return e.id === id; });
        if (!exp) {
            showNotification('Export record not found.', 'info');
            return;
        }
        showNotification('Downloading ' + exp.fileName + '...', 'info');
    };

    function exportAllData() {
        showExportReportsView();
    }

    function showNotification(message, type) {
        alert(message);
    }

})();

// Wrapped in an IIFE on purpose: sidebar.js removes and re-adds this script on
// every visit, and a second top-level const/let would throw
// "Identifier has already been declared", leaving the PREVIOUS load's state
// serving a freshly injected DOM. Nothing outside this file references its
// internals - the entry point is assigned to window below.

(function () {
    'use strict';

// Chart Data
const demographicsData = [
    { label: "0-14", value: 850, color: "#0F6CBD" },
    { label: "15-24", value: 1200, color: "#0F6CBD" },
    { label: "25-54", value: 2400, color: "#1F8F5F" },
    { label: "55-64", value: 600, color: "#0F6CBD" },
    { label: "65+", value: 450, color: "#0F6CBD" }
];

const certificateData = [
    { label: "Jul", value: 120, color: "#1F8F5F" },
    { label: "Aug", value: 145, color: "#1F8F5F" },
    { label: "Sep", value: 110, color: "#1F8F5F" },
    { label: "Oct", value: 180, color: "#1F8F5F" },
    { label: "Nov", value: 210, color: "#1F8F5F" },
    { label: "Dec", value: 160, color: "#1F8F5F" }
];

// Progress Data
const blotterProgress = [
    { label: "Settled", value: 48, total: 75, percent: 65, color: "green" },
    { label: "Ongoing", value: 15, total: 75, percent: 20, color: "yellow" },
    { label: "Referred to PNP", value: 8, total: 75, percent: 10, color: "blue" },
    { label: "Dismissed", value: 4, total: 75, percent: 5, color: "red" }
];

const inventoryProgress = [
    { label: "Available / In Stock", value: 340, total: 400, percent: 85, color: "green" },
    { label: "Borrowed / Deployed", value: 40, total: 400, percent: 10, color: "yellow" },
    { label: "Under Maintenance", value: 15, total: 400, percent: 4, color: "red" },
    { label: "Condemned / Lost", value: 5, total: 400, percent: 1, color: "gray" }
];

// Reports History Data
const reportsHistory = [
    { name: "Annual Demographics Report 2025", date: "Today, 10:00 AM", format: "PDF", generatedBy: "Maria Alvarez" },
    { name: "Blotter Cases Q4 Summary", date: "Yesterday, 3:30 PM", format: "EXCEL", generatedBy: "Ramon Dela Cruz" },
    { name: "Monthly Inventory Check - Nov", date: "Nov 30, 2025, 4:15 PM", format: "PDF", generatedBy: "Jenica Flores" },
    { name: "Issued Certificates Log (Oct-Nov)", date: "Nov 28, 2025, 11:20 AM", format: "EXCEL", generatedBy: "Angela Reyes" }
];

let currentSearch = '';

// Initialize the page
async function initReports() {
    await loadDemographicsChart();
    await loadCertificateChart();
    await loadBlotterProgress();
    await loadInventoryProgress();
    await loadReportsHistory();
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
    // Export button
    const exportBtn = document.getElementById('exportAllBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => exportAllData());
    }
    
    // Search reports
    const searchInput = document.getElementById('searchReports');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearch = e.target.value.toLowerCase();
            loadReportsHistory();
        });
    }
}

function loadDemographicsChart() {
    const container = document.getElementById('demographicsChart');
    if (!container) return;
    
    const maxValue = Math.max(...demographicsData.map(d => d.value));
    
    container.innerHTML = demographicsData.map(item => {
        const heightPercent = (item.value / maxValue) * 100;
        return `
            <div class="bar-item">
                <div class="bar-value">${item.value}</div>
                <div class="bar" style="height: ${heightPercent}%; background: ${item.color};"></div>
                <div class="bar-label">${item.label}</div>
            </div>
        `;
    }).join('');
}

function loadCertificateChart() {
    const container = document.getElementById('certificateChart');
    if (!container) return;
    
    const maxValue = Math.max(...certificateData.map(d => d.value));
    
    container.innerHTML = certificateData.map(item => {
        const heightPercent = (item.value / maxValue) * 100;
        return `
            <div class="bar-item">
                <div class="bar-value">${item.value}</div>
                <div class="bar" style="height: ${heightPercent}%; background: ${item.color};"></div>
                <div class="bar-label">${item.label}</div>
            </div>
        `;
    }).join('');
}

function loadBlotterProgress() {
    const container = document.getElementById('blotterProgress');
    if (!container) return;
    
    container.innerHTML = blotterProgress.map(item => `
        <div class="progress-item">
            <div class="progress-header">
                <span class="progress-label">${item.label}</span>
                <span class="progress-percent">${item.value} Cases (${item.percent}%)</span>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar-fill ${item.color}" style="width: ${item.percent}%"></div>
            </div>
        </div>
    `).join('');
}

function loadInventoryProgress() {
    const container = document.getElementById('inventoryProgress');
    if (!container) return;
    
    container.innerHTML = inventoryProgress.map(item => `
        <div class="progress-item">
            <div class="progress-header">
                <span class="progress-label">${item.label}</span>
                <span class="progress-percent">${item.value} Items (${item.percent}%)</span>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar-fill ${item.color}" style="width: ${item.percent}%"></div>
            </div>
        </div>
    `).join('');
}

function loadReportsHistory() {
    const tbody = document.getElementById('reportsTableBody');
    if (!tbody) return;
    
    let filteredReports = reportsHistory;
    if (currentSearch) {
        filteredReports = reportsHistory.filter(report => 
            report.name.toLowerCase().includes(currentSearch) ||
            report.generatedBy.toLowerCase().includes(currentSearch)
        );
    }
    
    if (filteredReports.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px;">No reports found</td></tr>';
        return;
    }
    
    tbody.innerHTML = filteredReports.map(report => `
        <tr>
            <td>${report.name}</td>
            <td>${report.date}</td>
            <td><span class="format-badge ${report.format.toLowerCase()}">${report.format}</span></td>
            <td>${report.generatedBy}</td>
            <td>
                <button class="download-btn" onclick="downloadReport('${report.name}')">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2.33 9.33H11.67M7 2.33V9.33M7 9.33L4.67 7M7 9.33L9.33 7" stroke="#16324A" stroke-width="1.17" stroke-linecap="round"/>
                    </svg>
                    <span>Download</span>
                </button>
            </td>
        </tr>
    `).join('');
}

function exportAllData() {
    showNotification('Exporting all data...', 'info');
    setTimeout(() => {
        showNotification('Export completed successfully!', 'success');
    }, 1500);
}

function downloadReport(reportName) {
    showNotification(`Downloading ${reportName}...`, 'info');
    setTimeout(() => {
        showNotification(`Download completed!`, 'success');
    }, 1000);
}

function showNotification(message, type) {
    alert(message);
}

})();

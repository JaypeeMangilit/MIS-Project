// Wrapped in an IIFE on purpose: sidebar.js removes and re-adds this script on
// every visit, and a second top-level const/let would throw
// "Identifier has already been declared", leaving the PREVIOUS load's state
// serving a freshly injected DOM. Nothing outside this file references its
// internals - the entry point is assigned to window below.

(function () {
    'use strict';

// mapping.js - Zone statistics loaded live from api/mapping.php

// Zone metadata only. The numbers on the panel come from api/mapping.php
// (see fetchZoneStats) - they used to be hard-coded here and were invented:
// 'Crescini Ext.' claimed 1248 residents while the whole residents table holds
// only a handful of rows.
const zonesData = {
    'Crescini Ext.': {
        name: 'Crescini Ext.',
        description: 'Southern edge of Barangay 49 Akasya',
        badge: 'High Population Area'
    },
    'M. Gregorio': {
        name: 'M. Gregorio',
        description: 'Northern residential area of Barangay 49 Akasya',
        badge: 'Medium Population Area'
    },
    'Mariano': {
        name: 'Mariano',
        description: 'Eastern section with mixed residential and commercial',
        badge: 'Medium Population Area'
    },
    'F. Javier': {
        name: 'F. Javier',
        description: 'Western boundary area near the health center',
        badge: 'Low Population Area'
    },
    'G. Santos': {
        name: 'G. Santos',
        description: 'Central district with community facilities',
        badge: 'Medium Population Area'
    }
};

// Main initialization function - called by sidebar.js
function initMapping() {
    console.log('Initializing Mapping Module...');

    // Wire up the map (zone labels, street labels, clusters, facilities)
    setupMapInteractions();

    // Setup event listeners
    setupMappingEventListeners();

    // Default select Crescini Ext.
    selectZone('Crescini Ext.');
}

window.initMapping = initMapping;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMapping);
} else {
    initMapping();
}

function setupMappingEventListeners() {
    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        const newSearchInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearchInput, searchInput);
        newSearchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            highlightSearchResult(searchTerm);
        });
    }
}

// The map is static markup in modules/mapping.html. Every clickable thing on it -
// zone labels, street labels, residential clusters and facility markers - already
// carries a data-zone attribute, so a single delegated listener covers all of
// them. Delegation also survives the module reload sidebar.js performs on every
// navigation. The previous loadMap() built its own markup inside an element
// (#spotMap) that does not exist anywhere in the project, so it always returned
// early and no click listener was ever attached.
function setupMapInteractions() {
    const grid = document.querySelector('.map-grid-container');
    if (!grid) return;

    grid.addEventListener('click', (event) => {
        const zoneEl = event.target.closest('[data-zone]');
        if (!zoneEl) return;

        const zoneName = zoneEl.getAttribute('data-zone');
        if (zoneName && zonesData[zoneName]) {
            selectZone(zoneName);
        }
    });
}

async function selectZone(zoneName) {
    const zone = zonesData[zoneName];
    if (!zone) return;

    renderZoneHeader(zone);
    renderZoneStatsRows(zone);

    // Highlight selected zone on map
    highlightMapZone(zoneName);

    // Store current selection
    localStorage.setItem('selectedZone', zoneName);

    // The counts are fetched rather than hard-coded; the panel holds placeholders
    // until they arrive.
    await fetchZoneStats(zoneName);
}

function renderZoneHeader(zone) {
    const zoneHeader = document.getElementById('zoneHeader');
    if (!zoneHeader) return;

    zoneHeader.innerHTML = `
        <div class="zone-label">Selected Zone</div>
        <div class="zone-name">${zone.name}</div>
        <div class="zone-description">${zone.description}</div>
        <div class="zone-badge">${zone.badge}</div>
    `;
}

function renderZoneStatsRows(zone) {
    const zoneStats = document.getElementById('zoneStats');
    if (!zoneStats) return;

    // Each value carries a stable .total-* class so applyZoneStats() can find it.
    // The Blotter Cases row is deliberately absent: blotter records are owned
    // entirely by the Blotter Management module.
    zoneStats.innerHTML = `
        <div class="stat-row">
            <div class="stat-info">
                <div class="stat-icon">
                    <img src="Images/PurokStreet_Icon.svg" alt="Mapping Icon">
                </div>
                <span class="stat-label">Purok / Street</span>
            </div>
            <span class="stat-value zone-street">${zone.name}</span>
        </div>
        <div class="stat-row">
            <div class="stat-info">
                <div class="stat-icon">
                    <img src="Images/TotalResidentsM_Icon.svg" alt="Mapping Icon">
                </div>
                <span class="stat-label">Total Residents</span>
            </div>
            <span class="stat-value total-residents">—</span>
        </div>
        <div class="stat-row">
            <div class="stat-info">
                <div class="stat-icon">
                    <img src="Images/TotalHouseholdsM_Icon.svg" alt="Mapping Icon">
                </div>
                <span class="stat-label">Total Households</span>
            </div>
            <span class="stat-value total-households">—</span>
        </div>
        <div class="stat-row">
            <div class="stat-info">
                <div class="stat-icon">
                    <img src="Images/SeniorCitizenM_Icon.svg" alt="Mapping Icon">
                </div>
                <span class="stat-label">Senior Citizens</span>
            </div>
            <span class="stat-value total-seniors">—</span>
        </div>
        <div class="stat-row">
            <div class="stat-info">
                <div class="stat-icon">
                    <img src="Images/MinorM_Icon.svg" alt="Mapping Icon">
                </div>
                <span class="stat-label">Minors</span>
            </div>
            <span class="stat-value total-minors">—</span>
        </div>
        <div class="stat-row">
            <div class="stat-info">
                <div class="stat-icon">
                    <img src="Images/RegisterVotersM_Icon.svg" alt="Mapping Icon">
                </div>
                <span class="stat-label">Registered Voters</span>
            </div>
            <span class="stat-value total-voters">—</span>
        </div>
    `;
}

// Fetch the live counts for a zone.
//
// Deliberately NOT called apiCall: js/api.js is only loaded by login.php, and
// blotter.js / archives.js / residents.js each declare their own global apiCall.
// Re-declaring it here would silently override whichever one loaded last, so this
// module carries its own uniquely-named request instead.
async function fetchZoneStats(zoneName) {
    const url = 'api/mapping.php?zone=' + encodeURIComponent(zoneName) + '&_=' + Date.now();

    let result = null;
    try {
        const response = await fetch(url, {
            headers: { 'Content-Type': 'application/json' }
        });

        // Read as text first: a PHP warning or fatal error would make
        // response.json() throw and the real cause would be lost.
        const raw = await response.text();

        try {
            result = raw.length ? JSON.parse(raw) : {};
        } catch (parseError) {
            console.error('mapping.php returned non-JSON for "' + zoneName + '":\n' + raw);
            result = {
                success: false,
                error: 'Server returned invalid JSON (HTTP ' + response.status + ').'
            };
        }

        // HTTP status is authoritative when the body carries no verdict of its own.
        if (!response.ok && result.success === undefined) {
            result.success = false;
        }
    } catch (error) {
        console.error('mapping.php request failed for "' + zoneName + '":', error);
        result = { success: false, error: 'Network error: ' + error.message };
    }

    if (!result || result.success !== true || !result.data) {
        console.error('Zone statistics unavailable for "' + zoneName + '":',
                      result ? (result.error || result.message) : 'unknown error');
        applyZoneStats(null, result ? (result.error || result.message) : 'unknown error');
        return;
    }

    applyZoneStats(result.data, null);
}

function applyZoneStats(stats, error) {
    const values = {
        'total-residents':  stats ? stats.residents  : 0,
        'total-households': stats ? stats.households : 0,
        'total-seniors':    stats ? stats.seniors    : 0,
        'total-minors':     stats ? stats.minors     : 0,
        'total-voters':     stats ? stats.voters     : 0
    };

    Object.keys(values).forEach((cls) => {
        const el = document.querySelector('.' + cls);
        if (!el) return;

        el.textContent = values[cls].toLocaleString();
        el.title = error ? ('Statistics unavailable: ' + error) : '';
    });
}

function highlightMapZone(zoneName) {
    // The real map is static markup in modules/mapping.html: its clickable
    // elements carry data-zone but not the .zone-clickable class this used to
    // query, so nothing was ever highlighted.
    const zoneElements = document.querySelectorAll('.map-grid-container [data-zone]');
    zoneElements.forEach(el => {
        el.style.opacity = '1';
        el.style.transform = '';
    });
    
    zoneElements.forEach(el => {
        if (el.getAttribute('data-zone') === zoneName) {
            el.style.opacity = '0.8';
            el.style.transform = 'scale(1.05)';
            setTimeout(() => {
                if (el.style.opacity === '0.8') {
                    el.style.opacity = '1';
                    el.style.transform = '';
                }
            }, 500);
        }
    });
}

function highlightSearchResult(searchTerm) {
    if (!searchTerm) return;
    
    const matchingZone = Object.keys(zonesData).find(zone => 
        zone.toLowerCase().includes(searchTerm) ||
        zonesData[zone].description.toLowerCase().includes(searchTerm)
    );
    
    if (matchingZone) {
        selectZone(matchingZone);
    }
}

function showNotification(message, type) {
    alert(message);
}

})();

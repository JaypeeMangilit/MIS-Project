// api.js

// API Configuration
const API_BASE_URL = 'api/';

// Generic API call function
async function apiCall(endpoint, method = 'GET', data = null) {
    const url = API_BASE_URL + endpoint;
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
        }
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    // 1. Transport-level failure: no response at all (offline, DNS, CORS, aborted).
    let response;
    try {
        response = await fetch(url, options);
    } catch (error) {
        console.error('API network error for ' + url + ':', error);
        return { success: false, error: 'Network error: ' + error.message, offline: true };
    }

    // 2. Read the body as text first. Parsing blind with response.json() throws on
    //    any non-JSON body (PHP warning, fatal-error page, HTML redirect) and the
    //    real cause is lost.
    const raw = await response.text();

    let result;
    try {
        result = raw.length ? JSON.parse(raw) : {};
    } catch (error) {
        console.error('API returned non-JSON from ' + url + ' (HTTP ' + response.status + '):\n' + raw);
        return {
            success: false,
            status: response.status,
            error: 'Server returned invalid JSON (HTTP ' + response.status + '). See the console.',
            raw: raw.slice(0, 500)
        };
    }

    // 3. HTTP status is authoritative for "did this work". Only fall back to it
    //    when the body carries no verdict of its own, so a body that explicitly
    //    says success:true is never overridden.
    if (!response.ok && result.success === undefined) {
        result.success = false;
    }
    result.status = response.status;

    return result;
}

// Residents API
const ResidentsAPI = {
    getAll: (filters = {}) => {
        let url = 'residents.php';
        const params = new URLSearchParams(filters);
        if (params.toString()) url += '?' + params.toString();
        return apiCall(url);
    },
    getById: (id) => apiCall(`residents.php?id=${id}`),
    create: (data) => apiCall('residents.php', 'POST', data),
    update: (data) => apiCall('residents.php', 'PUT', data),
    delete: (id) => apiCall(`residents.php?id=${id}`, 'DELETE')
};

// Blotter API
const BlotterAPI = {
    getAll: (filters = {}) => {
        let url = 'blotter.php';
        const params = new URLSearchParams(filters);
        if (params.toString()) url += '?' + params.toString();
        return apiCall(url);
    },
    getById: (id) => apiCall(`blotter.php?id=${id}`),
    create: (data) => apiCall('blotter.php', 'POST', data),
    update: (data) => apiCall('blotter.php', 'PUT', data),
    delete: (id) => apiCall(`blotter.php?id=${id}`, 'DELETE')
};

// Users API
const UsersAPI = {
    getAll: (filters = {}) => {
        let url = 'users.php';
        const params = new URLSearchParams(filters);
        if (params.toString()) url += '?' + params.toString();
        return apiCall(url);
    },
    getById: (id) => apiCall(`users.php?id=${id}`),
    create: (data) => apiCall('users.php', 'POST', data),
    update: (data) => apiCall('users.php', 'PUT', data),
    delete: (id) => apiCall(`users.php?id=${id}`, 'DELETE')
};

// Login API
const LoginAPI = {
    authenticate: (username, password) => apiCall('login.php', 'POST', { username, password })
};

// Expose the API objects on window.
// Top-level `const` declarations live in the global lexical scope and are NOT
// attached to window, so any code that reaches them via window.X (as
// modules/login.js does) would see undefined.
window.ResidentsAPI = ResidentsAPI;
window.BlotterAPI = BlotterAPI;
window.UsersAPI = UsersAPI;
window.LoginAPI = LoginAPI;
window.apiCall = apiCall;

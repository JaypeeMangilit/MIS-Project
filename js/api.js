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
    
    try {
        const response = await fetch(url, options);
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('API Error:', error);
        return { success: false, error: error.message };
    }
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

const API_BASE = 'https://folio-xfsu.onrender.com';

class ApiClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }

    _getHeaders(isMultipart = false) {
        const headers = {};
        if (!isMultipart) {
            headers['Content-Type'] = 'application/json';
        }
        const token = localStorage.getItem('access_token');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    }

    async _request(endpoint, options = {}) {
        const isMultipart = options.body instanceof FormData;
        const headers = this._getHeaders(isMultipart);

        if (options.headers) {
            Object.assign(headers, options.headers);
        }

        const config = { ...options, headers };

        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, config);

            if (response.status === 401) {
                localStorage.removeItem('access_token');
                window.location.href = '/';
                throw new Error('Unauthorized');
            }

            // 204 No Content — no body to parse
            if (response.status === 204) {
                return null;
            }

            // Try to parse JSON, but if it fails return null rather than crashing
            let data = null;
            const ct = response.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
                data = await response.json();
            } else {
                // Non-JSON response — try to read as text for error messages
                const text = await response.text();
                if (!response.ok) throw new Error(text || `HTTP ${response.status}`);
                return null;
            }

            if (!response.ok) {
                const msg = typeof data?.detail === 'string'
                    ? data.detail
                    : Array.isArray(data?.detail)
                        ? data.detail.map(d => d.msg || JSON.stringify(d)).join(', ')
                        : 'Request failed';
                throw new Error(msg);
            }
            return data;
        } catch (error) {
            if (error.message !== 'Unauthorized') {
                this.showError(error.message);
            }
            throw error;
        }
    }

    async get(endpoint) {
        return this._request(endpoint, { method: 'GET' });
    }

    async post(endpoint, body) {
        const isFormData = body instanceof FormData;
        return this._request(endpoint, {
            method: 'POST',
            body: isFormData ? body : JSON.stringify(body)
        });
    }

    async patch(endpoint, body) {
        return this._request(endpoint, {
            method: 'PATCH',
            body: JSON.stringify(body)
        });
    }

    async delete(endpoint) {
        return this._request(endpoint, { method: 'DELETE' });
    }

    showError(message) {
        const toast = document.getElementById('error-toast');
        if (!toast) { console.error('API Error:', message); return; }
        toast.textContent = message;
        toast.style.display = 'block';
        setTimeout(() => { toast.classList.add('show'); }, 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => { toast.style.display = 'none'; }, 300);
        }, 5000);
    }
}

const api = new ApiClient(API_BASE);

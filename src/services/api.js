import axios from 'axios';
import { toast } from '../components/Toast';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle response errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      return Promise.reject(error);
    }
    const detail = error.response?.data?.detail;
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => d.msg).join(', ')
          : error.response?.data?.message || 'Something went wrong';
    toast.error(message);
    return Promise.reject(error);
  }
);

export default api;

// --- API service functions matching FastAPI OpenAPI spec ---

export const authService = {
  login: (data) => api.post('/auth/login', data),
};

export const hospitalService = {
  getAll: () => api.get('/hospitals'),
  create: (data) => api.post('/hospitals', data),
};

export const userService = {
  getAll: (params) => api.get('/users', { params }),
  create: (data) => api.post('/users', data),
};

export const workflowService = {
  run: (hospitalId, input) => api.post(`/run/${hospitalId}`, { input }),
};

export const promptService = {
  getAll: (hospitalId) => api.get(`/hospitals/${hospitalId}/prompts`),
  getById: (hospitalId, promptId) => api.get(`/hospitals/${hospitalId}/prompts/${promptId}`),
  create: (hospitalId, data) => api.post(`/hospitals/${hospitalId}/prompts`, data),
  update: (hospitalId, promptId, data) => api.put(`/hospitals/${hospitalId}/prompts/${promptId}`, data),
  delete: (hospitalId, promptId) => api.delete(`/hospitals/${hospitalId}/prompts/${promptId}`),
};

export const policyProviderService = {
  getAll: () => api.get('/policy-providers'),
  getById: (id) => api.get(`/policy-providers/${id}`),
  create: (data) => api.post('/policy-providers', data),
  update: (id, data) => api.put(`/policy-providers/${id}`, data),
  delete: (id) => api.delete(`/policy-providers/${id}`),
  runPolicy: (providerId, policyId) => api.post(`/run-policy/${providerId}/${policyId}`),
};

// GET & POST /hospitals/{hospital_id}/config
export const configService = {
  get: (hospitalId) => api.get(`/hospitals/${hospitalId}/config`),
  save: (hospitalId, data) => api.post(`/hospitals/${hospitalId}/config`, data),
};

// Global variables per hospital
export const variablesService = {
  getAll: (hospitalId) => api.get(`/hospitals/${hospitalId}/config/variables`),
  save: (hospitalId, variables) => api.put(`/hospitals/${hospitalId}/config/variables`, { variables }),
  delete: (hospitalId, key) => api.delete(`/hospitals/${hospitalId}/config/variables/${key}`),
};

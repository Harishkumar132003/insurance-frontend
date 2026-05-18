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
    // Callers can opt out of the global error toast for expected non-OK
    // responses (e.g. a 404 used as a "does this resource exist yet" probe)
    // via `axios.get(url, { silent: true })` or `{ silentStatuses: [404] }`.
    const cfg = error.config || {};
    const status = error.response?.status;
    const silent =
      cfg.silent === true ||
      (Array.isArray(cfg.silentStatuses) && status != null && cfg.silentStatuses.includes(status));
    if (!silent) {
      const detail = error.response?.data?.detail;
      const message =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail.map((d) => d.msg).join(', ')
            : error.response?.data?.message || 'Something went wrong';
      toast.error(message);
    }
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
  getById: (id) => api.get(`/hospitals/${id}`),
  create: (data) => api.post('/hospitals', data),
  update: (id, data) => api.put(`/hospitals/${id}`, data),
};

export const userService = {
  getAll: (params) => api.get('/users', { params }),
  create: (data) => api.post('/users', data),
  getFeatures: () => api.get('/users/features'),
  updateAccess: (userId, access) => api.patch(`/users/${userId}/access`, { access }),
};

export const workflowService = {
  run: (hospitalId, input) => api.post(`/run/${hospitalId}`, { input }),
  summarizeContext: (data) => api.post('/summarize-context', data),
};

export const promptService = {
  getAll: (hospitalId) => api.get(`/hospitals/${hospitalId}/prompts`),
  getById: (hospitalId, promptId) => api.get(`/hospitals/${hospitalId}/prompts/${promptId}`),
  create: (hospitalId, data) => api.post(`/hospitals/${hospitalId}/prompts`, data),
  update: (hospitalId, promptId, data) => api.put(`/hospitals/${hospitalId}/prompts/${promptId}`, data),
  delete: (hospitalId, promptId) => api.delete(`/hospitals/${hospitalId}/prompts/${promptId}`),
};

export const summaryPromptService = {
  getAll: () => api.get('/summary-prompts'),
  getByKey: (key) => api.get(`/summary-prompts/${encodeURIComponent(key)}`),
  updateByKey: (key, data) => api.put(`/summary-prompts/${encodeURIComponent(key)}`, data),
};

export const policyProviderService = {
  getAll: () => api.get('/policy-providers'),
  getById: (id) => api.get(`/policy-providers/${id}`),
  create: (data) => api.post('/policy-providers', data),
  update: (id, data) => api.put(`/policy-providers/${id}`, data),
  delete: (id) => api.delete(`/policy-providers/${id}`),
  runPolicy: (providerId, policyId, file) => {
    const trimmedPolicyId = policyId?.trim();
    const endpoint = trimmedPolicyId
      ? `/run-policy/${providerId}/${trimmedPolicyId}`
      : `/run-policy/${providerId}`;

    if (file) {
      const formData = new FormData();
      formData.append('file', file);
      return api.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }
    return api.post(endpoint);
  },
};

// GET & POST /hospitals/{hospital_id}/config
export const configService = {
  get: (hospitalId) => api.get(`/hospitals/${hospitalId}/config`),
  save: (hospitalId, data) => api.post(`/hospitals/${hospitalId}/config`, data),
};

// CC Emails
export const ccEmailService = {
  getByHospital: (hospitalId) => api.get(`/hospitals/${hospitalId}/cc-emails`),
  create: (data) => api.post('/cc-emails', data),
  update: (id, data) => api.put(`/cc-emails/${id}`, data),
  delete: (id) => api.delete(`/cc-emails/${id}`),
};

// Form templates
export const formTemplateService = {
  getAll: (formType) => api.get('/form-templates', { params: formType ? { form_type: formType } : undefined }),
  getById: (id) => api.get(`/form-templates/${id}`),
  getByProvider: () => api.get(`/form-templates/provider/first`),
  getFirstByType: (formType) =>
    api.get('/form-templates/first', { params: { form_type: formType } }),
};

// Claim cases
export const claimCaseService = {
  getAll: (params) => api.get('/claim-cases', { params }),
  getById: (id) => api.get(`/claim-cases/${id}`),
  getProviderQueue: (params) => api.get('/claim-cases/provider-queue', { params }),
  // Accepts either a FormData (Approve / Partially-Approve flow attaches a
  // populated PART_D PDF as `file`) or a plain JSON object (Deny / NMI).
  providerAction: (id, data) => {
    const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;
    return api.patch(
      `/claim-cases/${id}/provider-action`,
      data,
      isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined,
    );
  },
  getAllEmails: (id, params) => api.get(`/claim-cases/${id}/emails/all`, { params }),
  getSubmissions: (id) => api.get(`/claim-cases/${id}/submissions`),
  getAllEmailsPaginated: (params) => api.get('/claim-cases/emails/all', { params }),
  getEmails: (id, direction) =>
    api.get(`/claim-cases/${id}/emails`, { params: direction ? { direction } : {} }),
  getEmailDetail: (id, emailId) =>
    api.get(`/claim-cases/${id}/emails/${emailId}`),
  downloadAttachment: (id, emailId, attId) =>
    api.get(`/claim-cases/${id}/emails/${emailId}/attachments/${attId}/download`, {
      responseType: 'blob',
    }),
  viewAttachment: (id, emailId, attId) =>
    api.get(`/claim-cases/${id}/emails/${emailId}/attachments/${attId}/view`, {
      responseType: 'blob',
    }),
  updateExtractedData: (claimCaseId, emailId, data) =>
    api.patch(`/claim-cases/${claimCaseId}/emails/${emailId}/extracted-data`, data),
  markEmailRead: (claimCaseId, emailId) =>
    api.patch(`/claim-cases/${claimCaseId}/emails/${emailId}/read`),
  // Part-D authorization letter for an approval round. GET returns a saved
  // row or a prefilled stub (is_persisted=false). PUT accepts a plain JSON
  // object (field values only) or a FormData (field values + `file` = the
  // rendered PDF + optional `email_id`).
  // Best-effort prefill — ProviderApproveModal calls this on open. The backend
  // returns 400 ("no approval email yet") for cases that haven't been approved
  // yet; treat that (and 404) as expected non-errors so the global toast stays
  // silent.
  getPartD: (claimCaseId, emailId) =>
    api.get(`/claim-cases/${claimCaseId}/part-d`, {
      params: emailId != null ? { email_id: emailId } : {},
      silentStatuses: [400, 404],
    }),
  putPartD: (claimCaseId, data) => {
    const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;
    return api.put(
      `/claim-cases/${claimCaseId}/part-d`,
      data,
      isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined,
    );
  },
};

// Documents
export const documentService = {
  list: (claimCaseId) => api.get(`/claim-cases/${claimCaseId}/documents`),
  upload: (claimCaseId, formData) => api.post(`/claim-cases/${claimCaseId}/documents`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  download: (claimCaseId, documentId) => api.get(`/claim-cases/${claimCaseId}/documents/${documentId}/download`, {
    responseType: 'blob',
  }),
  view: (claimCaseId, documentId) => api.get(`/claim-cases/${claimCaseId}/documents/${documentId}/view`, {
    responseType: 'blob',
  }),
  delete: (claimCaseId, documentId) => api.delete(`/claim-cases/${claimCaseId}/documents/${documentId}`),
  fromEmail: (claimCaseId, payload) =>
    api.post(`/claim-cases/${claimCaseId}/documents/from-email`, payload),
};

// Claim (post-approval claim raise)
export const claimService = {
  raise: (claimCaseId, payload) =>
    api.post(`/claim-cases/${claimCaseId}/claim`, payload).then((r) => r.data),
  // The GET is used as a "has a claim been raised?" probe — 404 is expected and
  // should not surface a global error toast.
  get: (claimCaseId) =>
    api.get(`/claim-cases/${claimCaseId}/claim`, { silentStatuses: [404] }).then((r) => r.data),
};

// Form data
export const formDataService = {
  submit: (formData) => api.post('/form-data/submit-form', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  update: (formDataId, data) => api.patch(`/form-data/${formDataId}`, data),
};

// Email
export const emailService = {
  send: (formData) => api.post('/email/send', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  query: (formData) => api.post('/email/query', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  inbox: (limit = 10) => api.get('/email/inbox', { params: { limit } }),
};

// Email templates
export const emailTemplateService = {
  getAll: () => api.get('/email-templates'),
  getById: (id) => api.get(`/email-templates/${id}`),
};

// Global variables per hospital
export const variablesService = {
  getAll: (hospitalId) => api.get(`/hospitals/${hospitalId}/config/variables`),
  save: (hospitalId, variables) => api.put(`/hospitals/${hospitalId}/config/variables`, { variables }),
  delete: (hospitalId, key) => api.delete(`/hospitals/${hospitalId}/config/variables/${key}`),
};

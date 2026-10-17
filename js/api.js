
"use strict";

window.DayOneAPI = (() => {
  const config = window.DAYONE_CONFIG || {};
  const apiConfig = config.API || {};

  const MAX_FILE_SIZE =
    config.MAX_FILE_SIZE_BYTES || 5 * 1024 * 1024;

  const ALLOWED_TYPES = new Set(
    config.ALLOWED_FILE_TYPES || [
      "application/pdf",
      "image/jpeg",
      "image/png"
    ]
  );

  const DOCUMENT_TYPE_MAP = Object.freeze({
    "id-proof": "ID_PROOF",
    "degree-certificate": "DEGREE_CERTIFICATE",
    "signed-offer": "SIGNED_OFFER"
  });

  async function getCognitoSession() {
    if (typeof window.DayOneAuth?.getSession !== "function") {
      throw new Error(
        "Authentication is unavailable. Check js/auth.js."
      );
    }

    const session = await window.DayOneAuth.getSession();

    if (!session || !session.isValid()) {
      throw new Error(
        "Your session has expired. Please sign in again."
      );
    }

    return session;
  }

  async function getAuthToken() {
    const session = await getCognitoSession();
    return session.getIdToken().getJwtToken();
  }

  async function requestUrl(url, options = {}) {
    if (!url) {
      throw new Error(
        "The API URL is not configured in js/config.js."
      );
    }

    const token = await getAuthToken();
    const headers = new Headers(options.headers || {});

    headers.set("Authorization", "Bearer " + token);

    if (options.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    let response;

    try {
      response = await fetch(url, {
        ...options,
        headers
      });
    } catch {
      throw new Error(
        "Could not reach the API. Check network access and API CORS settings."
      );
    }

    if (response.status === 401) {
      throw new Error("Authentication failed. Please sign in again.");
    }

    if (response.status === 403) {
      throw new Error("Access denied. Check your account permissions.");
    }

    if (!response.ok) {
      let details = "";

      try {
        const body = await response.json();
        details = body.message || body.error || "";
      } catch {
        // The server did not return a JSON error.
      }

      throw new Error(
        details || `API request failed (${response.status}).`
      );
    }

    if (response.status === 204) {
      return null;
    }

    const contentType =
      response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      try {
        return await response.json();
      } catch {
        throw new Error("The API returned invalid JSON.");
      }
    }

    return response.text();
  }

  async function createEmployee(employee) {
    if (!employee || typeof employee !== "object") {
      throw new Error("Employee details are required.");
    }

    const requiredFields = [
      "name",
      "email",
      "department",
      "role",
      "manager",
      "joining_date",
      "employment_type"
    ];

    for (const field of requiredFields) {
      if (
        typeof employee[field] !== "string" ||
        !employee[field].trim()
      ) {
        throw new Error(
          `Please provide ${field.replaceAll("_", " ")}.`
        );
      }
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employee.email.trim())) {
      throw new Error("Please enter a valid employee email address.");
    }

    const payload = Object.fromEntries(
      requiredFields.map(field => [
        field,
        employee[field].trim()
      ])
    );

    return requestUrl(apiConfig.EMPLOYEES_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async function getEmployees() {
    return requestUrl(apiConfig.EMPLOYEES_URL, {
      method: "GET"
    });
  }

  async function getProgress(employeeId) {
    if (typeof employeeId !== "string" || !employeeId.trim()) {
      throw new Error(
        "An employee ID is required to get onboarding progress."
      );
    }

    if (!apiConfig.PROGRESS_URL) {
      throw new Error("The progress API URL is not configured.");
    }

    const url = new URL(apiConfig.PROGRESS_URL);
    url.searchParams.set("employee_id", employeeId.trim());

    return requestUrl(url.toString(), {
      method: "GET"
    });
  }

  async function completeStage(stage) {
    const allowedStages = [
      "documents",
      "itProvisioning",
      "policy",
      "managerIntro"
    ];

    if (!allowedStages.includes(stage)) {
      throw new Error("Invalid onboarding stage.");
    }

    throw new Error(
      "The stage-update endpoint has not yet been provided or confirmed."
    );
  }

  // Request a presigned S3 POST from the configured backend.
  // Endpoint and response schema must be confirmed by Preethi.
  async function createUploadUrl(
    documentType,
    fileName,
    contentType,
    employeeId
  ) {
    const endpoint = apiConfig.DOCUMENT_UPLOAD_URL;

    if (!endpoint) {
      throw new Error(
        "The document upload API URL is not configured yet. Please confirm it with the backend team."
      );
    }

    if (!Object.hasOwn(DOCUMENT_TYPE_MAP, documentType)) {
      throw new Error("Invalid document type.");
    }

    if (
      typeof fileName !== "string" ||
      !fileName.trim() ||
      fileName.length > 255
    ) {
      throw new Error("Enter a valid file name.");
    }

    if (!ALLOWED_TYPES.has(contentType)) {
      throw new Error("Only PDF, JPG/JPEG and PNG files are accepted.");
    }

    if (
      typeof employeeId !== "string" ||
      !employeeId.trim()
    ) {
      throw new Error("An employee ID is required for document upload.");
    }

    // This payload uses descriptive field names. Confirm the exact
    // field names with Preethi before deploying the integration.
    const result = await requestUrl(endpoint, {
      method: "POST",
      body: JSON.stringify({
        employee_id: employeeId.trim(),
        document_type: DOCUMENT_TYPE_MAP[documentType],
        file_name: fileName.trim(),
        content_type: contentType
      })
    });

    // Expected shape for this implementation:
    // { upload: { url: "...", fields: { ... } } }
    if (
      !result?.upload ||
      typeof result.upload.url !== "string" ||
      !result.upload.fields ||
      typeof result.upload.fields !== "object"
    ) {
      throw new Error(
        "The upload API response format is not recognized. Confirm the response schema with Preethi."
      );
    }

    return result.upload;
  }

  // Upload using a presigned S3 POST, not PUT.
  async function uploadDocument(upload, file) {
    if (!upload || !file) {
      throw new Error("An upload response and file are required.");
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      throw new Error("Only PDF, JPG/JPEG and PNG files are accepted.");
    }

    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      throw new Error("The file must be larger than 0 bytes and no larger than 5 MB.");
    }

    if (
      typeof upload.url !== "string" ||
      !upload.fields ||
      typeof upload.fields !== "object"
    ) {
      throw new Error("The backend returned an invalid presigned POST.");
    }

    let parsedUrl;

    try {
      parsedUrl = new URL(upload.url);
    } catch {
      throw new Error("The backend returned an invalid upload URL.");
    }

    if (parsedUrl.protocol !== "https:") {
      throw new Error("Document uploads must use HTTPS.");
    }

    const formData = new FormData();

    // S3 presigned POST requires every returned field.
    for (const [key, value] of Object.entries(upload.fields)) {
      formData.append(key, String(value));
    }

    // Append the file after the presigned fields.
    formData.append("file", file);

    let response;

    try {
      response = await fetch(upload.url, {
        method: "POST",
        body: formData
      });
    } catch {
      throw new Error(
        "Could not upload to S3. Check S3 CORS and network access."
      );
    }

    if (!response.ok) {
      throw new Error(
        `S3 document upload failed (${response.status}).`
      );
    }

    return { uploaded: true };
  }

  return Object.freeze({
    getCognitoSession,
    getAuthToken,
    request: requestUrl,
    createEmployee,
    getEmployees,
    getProgress,
    completeStage,
    createUploadUrl,
    uploadDocument
  });
})();

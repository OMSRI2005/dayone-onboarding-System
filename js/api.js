
"use strict";

window.DayOneAPI = (() => {
  const config = window.DAYONE_CONFIG || {};

  async function getCognitoSession() {
    if (typeof window.DayOneAuth?.getSession !== "function") {
      throw new Error("Authentication is unavailable. Check js/auth.js.");
    }

    const session = await window.DayOneAuth.getSession();

    if (!session || !session.isValid()) {
      throw new Error("Your session has expired. Please sign in again.");
    }

    return session;
  }

  async function getAuthToken() {
    const session = await getCognitoSession();
    return session.getIdToken().getJwtToken();
  }

  async function request(path, options = {}) {
    const baseUrl = config.API_BASE_URL;

    if (!baseUrl) {
      throw new Error("API Gateway URL is not configured in js/config.js.");
    }

    if (
      typeof path !== "string" ||
      !path.startsWith("/") ||
      path.startsWith("//")
    ) {
      throw new Error("Invalid API endpoint path.");
    }

    const token = await getAuthToken();
    const headers = new Headers(options.headers || {});

    headers.set("Authorization", "Bearer " + token);

    if (options.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(
      baseUrl.replace(/\/+$/, "") + path,
      { ...options, headers }
    );

    if (response.status === 401) {
      throw new Error(
        "Authentication failed or your session expired. Please sign in again."
      );
    }

    if (response.status === 403) {
      throw new Error("Access denied for this operation.");
    }

    if (!response.ok) {
      let details = "";

      try {
        const body = await response.json();
        details = body.message || body.error || "";
      } catch {
        // The response was not JSON.
      }

      throw new Error(
        details || `API request failed (${response.status}).`
      );
    }

    if (response.status === 204) {
      return null;
    }

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      try {
        return await response.json();
      } catch {
        throw new Error("The API returned invalid JSON.");
      }
    }

    return response.text();
  }

  async function getProgress() {
    return request("/onboarding/progress");
  }

  async function getEmployees() {
    return request("/employees");
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

    return request(
      "/onboarding/stages/" + encodeURIComponent(stage),
      {
        method: "POST",
        body: JSON.stringify({ completed: true })
      }
    );
  }

  async function createUploadUrl(documentType, fileName, contentType) {
    const allowedTypes = config.ALLOWED_FILE_TYPES || [
      "application/pdf",
      "image/jpeg",
      "image/png"
    ];

    const allowedDocuments = [
      "id-proof",
      "degree-certificate",
      "signed-offer"
    ];

    if (!allowedDocuments.includes(documentType)) {
      throw new Error("Invalid document type.");
    }

    if (
      typeof fileName !== "string" ||
      !fileName.trim() ||
      fileName.length > 255
    ) {
      throw new Error("Enter a valid file name.");
    }

    if (!allowedTypes.includes(contentType)) {
      throw new Error("Unsupported document file type.");
    }

    return request("/documents/upload-url", {
      method: "POST",
      body: JSON.stringify({
        documentType,
        fileName: fileName.trim(),
        contentType
      })
    });
  }

  async function uploadDocument(uploadUrl, file) {
    if (!uploadUrl || !file) {
      throw new Error("An upload URL and file are required.");
    }

    const allowedTypes = config.ALLOWED_FILE_TYPES || [
      "application/pdf",
      "image/jpeg",
      "image/png"
    ];

    if (!allowedTypes.includes(file.type)) {
      throw new Error("Unsupported document file type.");
    }

    const maxSize =
      config.MAX_FILE_SIZE_BYTES || 10 * 1024 * 1024;

    if (file.size <= 0 || file.size > maxSize) {
      throw new Error("The file must be larger than 0 bytes and no larger than 10 MB.");
    }

    let parsedUrl;

    try {
      parsedUrl = new URL(uploadUrl);
    } catch {
      throw new Error("The backend returned an invalid upload URL.");
    }

    if (parsedUrl.protocol !== "https:") {
      throw new Error("Document uploads must use HTTPS.");
    }

    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file
    });

    if (!response.ok) {
      throw new Error(`Document upload failed (${response.status}).`);
    }

    return { uploaded: true };
  }

  return Object.freeze({
    getCognitoSession,
    getAuthToken,
    request,
    getProgress,
    getEmployees,
    completeStage,
    createUploadUrl,
    uploadDocument
  });
})();

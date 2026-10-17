
"use strict";

(() => {
  const stages = [
    { name: "Document Collection", key: "documents" },
    { name: "IT Provisioning", key: "itProvisioning" },
    { name: "Policy Sign-off", key: "policy" },
    { name: "Manager Introduction", key: "managerIntro" }
  ];

  const stageList = document.getElementById("stage-list");
  const progressBar = document.getElementById("progress-bar");
  const progressPercent = document.getElementById("progress-percent");
  const progressCaption = document.getElementById("progress-caption");
  const joiningDate = document.getElementById("joining-date");

  const documentForm = document.getElementById("document-form");
  const documentFile = document.getElementById("document-file");
  const documentType = document.getElementById("document-type");
  const documentMessage = document.getElementById("document-message");

  const policyForm = document.getElementById("policy-form");
  const policyAccepted = document.getElementById("policy-accepted");
  const policyMessage = document.getElementById("policy-message");

  const config = window.DAYONE_CONFIG || {};
  const api = config.API || {};

  const POLICY_URL =
    api.POLICIES_URL ||
    "https://sf960b0131.execute-api.us-east-1.amazonaws.com/policies";

  const PROGRESS_URL = api.PROGRESS_URL;

  const MAX_FILE_SIZE =
    config.MAX_FILE_SIZE_BYTES || 5 * 1024 * 1024;

  const ALLOWED_TYPES = new Set(
    config.ALLOWED_FILE_TYPES || [
      "application/pdf",
      "image/jpeg",
      "image/png"
    ]
  );

  let completed = new Set();
  let liveMode = false;

  function showMessage(element, message, type = "error") {
    if (!element) return;

    element.textContent = message;
    element.classList.remove("error", "success");

    if (message) {
      element.classList.add(type);
    }
  }

  function isCompleted(value) {
    return (
      typeof value === "string" &&
      value.trim().toUpperCase() === "COMPLETED"
    );
  }

  function renderStages() {
    const count = completed.size;
    const percent = Math.round((count / stages.length) * 100);

    if (progressPercent) {
      progressPercent.textContent = `${percent}%`;
    }

    if (progressBar) {
      progressBar.style.width = `${percent}%`;
      progressBar.setAttribute("role", "progressbar");
      progressBar.setAttribute("aria-valuemin", "0");
      progressBar.setAttribute("aria-valuemax", "100");
      progressBar.setAttribute("aria-valuenow", String(percent));
    }

    if (progressCaption) {
      progressCaption.textContent = liveMode
        ? `${count} of 4 stages completed. Live backend data.`
        : `${count} of 4 stages completed. Progress unavailable.`;
    }

    if (!stageList) return;

    stageList.replaceChildren();

    stages.forEach(stage => {
      const done = completed.has(stage.key);

      const item = document.createElement("li");
      item.className = "stage-item";

      const dot = document.createElement("span");
      dot.className = `stage-dot ${done ? "complete" : "pending"}`;

      const content = document.createElement("div");

      const title = document.createElement("strong");
      title.textContent = stage.name;

      const status = document.createElement("span");
      status.className = `status ${done ? "complete" : "pending"}`;
      status.textContent = done ? "Completed" : "Pending";

      content.append(title, document.createElement("br"), status);
      item.append(dot, content);
      stageList.appendChild(item);
    });
  }

  async function checkCandidateAccess() {
    if (!window.DayOneAuth?.getSession) {
      throw new Error(
        "Authentication unavailable. Please sign in again."
      );
    }

    const session = await window.DayOneAuth.getSession();
    const payload = session.getIdToken().decodePayload();
    const groups = payload["cognito:groups"] || [];

    if (!groups.includes("Candidate")) {
      window.location.replace("index.html");
      throw new Error("Candidate access is required.");
    }

    return payload;
  }

  function getEmployeeId(payload) {
    // URL parameter is for testing only.
    // Production should use a verified employee-to-account mapping.
    const query = new URLSearchParams(window.location.search);

    return (
      query.get("employee_id") ||
      payload["custom:employee_id"] ||
      payload["employee_id"] ||
      ""
    ).trim();
  }

  function getRequiredEmployeeId(payload) {
    const employeeId = getEmployeeId(payload);

    if (!employeeId) {
      throw new Error(
        "Your employee ID is not linked to your candidate account. " +
        "Please ask HR to link your account to the correct employee record."
      );
    }

    return employeeId;
  }

  function applyProgress(result) {
    if (!result || typeof result !== "object") {
      throw new Error("The progress API returned an invalid response.");
    }

    const required = [
      "provisioning_status",
      "policy_signoff_status",
      "manager_intro_status",
      "documents_uploaded_count",
      "total_documents"
    ];

    const missing = required.filter(key => !(key in result));

    if (missing.length) {
      throw new Error(
        "Progress response is missing fields: " + missing.join(", ")
      );
    }

    const uploaded = Number(result.documents_uploaded_count);
    const total = Number(result.total_documents);

    if (
      !Number.isFinite(uploaded) ||
      !Number.isFinite(total) ||
      uploaded < 0 ||
      total < 0
    ) {
      throw new Error("Document progress values are invalid.");
    }

    completed = new Set();

    // Upload count does not necessarily mean HR verification is complete.
    if (total > 0 && uploaded >= total) {
      completed.add("documents");
    }

    if (isCompleted(result.provisioning_status)) {
      completed.add("itProvisioning");
    }

    if (isCompleted(result.policy_signoff_status)) {
      completed.add("policy");
    }

    if (isCompleted(result.manager_intro_status)) {
      completed.add("managerIntro");
    }

    if (joiningDate && result.joining_date) {
      joiningDate.textContent = String(result.joining_date);
    }

    liveMode = true;
    renderStages();

    if (progressCaption) {
      progressCaption.textContent =
        `${completed.size} of 4 stages completed. ` +
        `Documents uploaded: ${uploaded} of ${total}.`;
    }
  }

  async function loadProgress() {
    if (progressCaption) {
      progressCaption.textContent = "Loading your onboarding progress...";
    }

    try {
      const payload = await checkCandidateAccess();
      const employeeId = getRequiredEmployeeId(payload);

      if (!PROGRESS_URL) {
        throw new Error("Progress API URL is missing from js/config.js.");
      }

      const url = new URL(PROGRESS_URL);
      url.searchParams.set("employee_id", employeeId);

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`Progress API failed (${response.status}).`);
      }

      applyProgress(await response.json());
    } catch (error) {
      console.error("Could not load progress:", error);

      liveMode = false;
      completed = new Set();
      renderStages();

      if (progressCaption) {
        progressCaption.textContent = error.message;
      }
    }
  }

  async function acknowledgePolicy(event) {
    event.preventDefault();
    showMessage(policyMessage, "");

    const button = policyForm?.querySelector('button[type="submit"]');

    try {
      const payload = await checkCandidateAccess();

      if (!policyAccepted?.checked) {
        throw new Error("Please acknowledge the policy first.");
      }

      const employeeId = getRequiredEmployeeId(payload);

      if (button) button.disabled = true;

      showMessage(
        policyMessage,
        "Submitting your policy acknowledgement...",
        "success"
      );

      const response = await fetch(POLICY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          employee_id: employeeId
        })
      });

      const text = await response.text();
      let result = {};

      if (text) {
        try {
          result = JSON.parse(text);
        } catch {
          result = { message: text };
        }
      }

      if (!response.ok) {
        throw new Error(
          result.message ||
          result.error ||
          `Policy API failed (${response.status}).`
        );
      }

      showMessage(
        policyMessage,
        result.message || "Policy acknowledgement submitted successfully.",
        "success"
      );

      await loadProgress();
    } catch (error) {
      console.error("Policy acknowledgement failed:", error);

      showMessage(
        policyMessage,
        error.message || "Could not submit policy acknowledgement."
      );
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function uploadDocument(event) {
    event.preventDefault();
    showMessage(documentMessage, "");

    const button = documentForm?.querySelector('button[type="submit"]');

    try {
      const payload = await checkCandidateAccess();
      const employeeId = getRequiredEmployeeId(payload);

      const file = documentFile?.files?.[0];
      const type = documentType?.value;

      if (!file) {
        throw new Error("Choose a document first.");
      }

      if (
        ![
          "id-proof",
          "degree-certificate",
          "signed-offer"
        ].includes(type)
      ) {
        throw new Error("Select a valid document type.");
      }

      if (!ALLOWED_TYPES.has(file.type)) {
        throw new Error("Only PDF, JPG, JPEG and PNG files are accepted.");
      }

      if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
        throw new Error("File must be greater than 0 bytes and no larger than 5 MB.");
      }

      if (
        !window.DayOneAPI?.createUploadUrl ||
        !window.DayOneAPI?.uploadDocument
      ) {
        throw new Error(
          "Document upload functionality is unavailable."
        );
      }

      if (!api.DOCUMENT_UPLOAD_URL) {
        throw new Error(
          "Document upload API URL is not configured yet. Please contact the team."
        );
      }

      if (button) button.disabled = true;

      showMessage(
        documentMessage,
        "Requesting a secure upload link...",
        "success"
      );

      // Request the presigned S3 POST details from the backend.
      const upload = await window.DayOneAPI.createUploadUrl(
        type,
        file.name,
        file.type,
        employeeId
      );

      if (
        !upload ||
        typeof upload.url !== "string" ||
        !upload.fields ||
        typeof upload.fields !== "object"
      ) {
        throw new Error(
          "The upload API response is missing the S3 URL or form fields."
        );
      }

      showMessage(
        documentMessage,
        "Uploading your document...",
        "success"
      );

      // Sends FormData with the presigned fields and file using HTTP POST.
      await window.DayOneAPI.uploadDocument(upload, file);

      showMessage(
        documentMessage,
        "Document uploaded successfully. Await verification by HR.",
        "success"
      );

      documentForm.reset();
      await loadProgress();
    } catch (error) {
      console.error("Document upload failed:", error);

      showMessage(
        documentMessage,
        error.message || "Document upload failed."
      );
    } finally {
      if (button) button.disabled = false;
    }
  }

  policyForm?.addEventListener("submit", acknowledgePolicy);
  documentForm?.addEventListener("submit", uploadDocument);

  renderStages();
  loadProgress();
})();

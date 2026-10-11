
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

  const MAX_FILE_SIZE =
    window.DAYONE_CONFIG?.MAX_FILE_SIZE_BYTES || 10 * 1024 * 1024;

  const ALLOWED_TYPES = new Set(
    window.DAYONE_CONFIG?.ALLOWED_FILE_TYPES || [
      "application/pdf",
      "image/jpeg",
      "image/png"
    ]
  );

  let completed = new Set();
  let liveMode = false;

  function showMessage(element, text, type = "error") {
    if (!element) return;

    element.textContent = text;
    element.classList.remove("error", "success");

    if (text) element.classList.add(type);
  }

  function renderStages() {
    const count = completed.size;
    const percent = Math.round((count / stages.length) * 100);

    if (progressPercent) {
      progressPercent.textContent = percent + "%";
    }

    if (progressBar) {
      progressBar.style.width = percent + "%";
      progressBar.setAttribute("role", "progressbar");
      progressBar.setAttribute("aria-valuemin", "0");
      progressBar.setAttribute("aria-valuemax", "100");
      progressBar.setAttribute("aria-valuenow", String(percent));
    }

    if (progressCaption) {
      progressCaption.textContent =
        `${count} of ${stages.length} stages completed` +
        (liveMode ? "" : " · Preview data");
    }

    if (!stageList) return;

    stageList.replaceChildren();

    stages.forEach(stage => {
      const isComplete = completed.has(stage.key);
      const item = document.createElement("li");
      item.className = "stage-item";

      const dot = document.createElement("span");
      dot.className =
        "stage-dot " + (isComplete ? "complete" : "pending");

      const content = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = stage.name;

      const lineBreak = document.createElement("br");
      const status = document.createElement("span");
      status.className =
        "status " + (isComplete ? "complete" : "pending");
      status.textContent = isComplete ? "Completed" : "Pending";

      content.append(title, lineBreak, status);
      item.append(dot, content);
      stageList.appendChild(item);
    });
  }

  async function checkCandidateAccess() {
    if (!window.DayOneAuth?.getSession) {
      throw new Error("Authentication is unavailable. Please sign in again.");
    }

    const session = await window.DayOneAuth.getSession();
    const payload = session.getIdToken().decodePayload();
    const groups = payload["cognito:groups"] || [];

    if (!groups.includes("Candidate")) {
      window.location.replace("index.html");
      throw new Error("Candidate access is required.");
    }

    return session;
  }

  function applyProgress(result) {
    // Expected example:
    // { stages: { documents: true, itProvisioning: false,
    //             policy: false, managerIntro: false },
    //   joiningDate: "2026-11-01" }
    //
    // Confirm this contract with the backend team.

    const stageData = result?.stages;

    if (!stageData || typeof stageData !== "object") {
      throw new Error("The progress API returned an unexpected response.");
    }

    completed = new Set(
      stages
        .filter(stage => stageData[stage.key] === true)
        .map(stage => stage.key)
    );

    if (joiningDate && result.joiningDate) {
      const date = new Date(result.joiningDate + "T00:00:00");

      joiningDate.textContent = Number.isNaN(date.getTime())
        ? String(result.joiningDate)
        : new Intl.DateTimeFormat(undefined, {
            dateStyle: "long"
          }).format(date);
    }

    liveMode = true;
    renderStages();
  }

  async function loadProgress() {
    try {
      await checkCandidateAccess();

      if (!window.DAYONE_CONFIG?.API_BASE_URL) {
        completed = new Set(["documents"]);
        liveMode = false;
        renderStages();
        return;
      }

      if (!window.DayOneAPI?.getProgress) {
        throw new Error("The onboarding progress API is unavailable.");
      }

      const result = await window.DayOneAPI.getProgress();
      applyProgress(result);
    } catch (error) {
      console.error("Could not load onboarding progress:", error);

      if (progressCaption) {
        progressCaption.textContent =
          "Unable to load live progress. Check your sign-in and API configuration.";
      }
    }
  }

  async function uploadDocument(event) {
    event.preventDefault();
    showMessage(documentMessage, "");

    const submitButton = documentForm.querySelector(
      'button[type="submit"]'
    );

    try {
      await checkCandidateAccess();

      const file = documentFile?.files?.[0];
      const type = documentType?.value;

      if (!file) {
        throw new Error("Choose a document first.");
      }

      if (!["id-proof", "degree-certificate", "signed-offer"].includes(type)) {
        throw new Error("Select a valid document type.");
      }

      if (!ALLOWED_TYPES.has(file.type)) {
        throw new Error("Only PDF, JPG and PNG files are accepted.");
      }

      if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
        throw new Error("The file must be larger than 0 bytes and no larger than 10 MB.");
      }

      if (!window.DAYONE_CONFIG?.API_BASE_URL) {
        showMessage(
          documentMessage,
          "Preview mode: the file was validated, but no upload occurred."
        );
        return;
      }

      if (
        !window.DayOneAPI?.createUploadUrl ||
        !window.DayOneAPI?.uploadDocument
      ) {
        throw new Error("The document upload API is unavailable.");
      }

      if (submitButton) submitButton.disabled = true;

      showMessage(documentMessage, "Preparing secure upload...", "success");

      const result = await window.DayOneAPI.createUploadUrl(
        type,
        file.name,
        file.type
      );

      if (!result?.uploadUrl) {
        throw new Error("The backend did not return an upload URL.");
      }

      await window.DayOneAPI.uploadDocument(result.uploadUrl, file);

      showMessage(
        documentMessage,
        "File uploaded. Await confirmation and HR verification.",
        "success"
      );

      documentForm.reset();

      // Do not mark Document Collection completed here.
      // The backend must track all required documents and their review status.
    } catch (error) {
      console.error("Document upload failed:", error);
      showMessage(
        documentMessage,
        error.message || "Document upload failed."
      );
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }

  async function acknowledgePolicy(event) {
    event.preventDefault();
    showMessage(policyMessage, "");

    const submitButton = policyForm.querySelector(
      'button[type="submit"]'
    );

    try {
      await checkCandidateAccess();

      if (!policyAccepted?.checked) {
        throw new Error("Please acknowledge the policy first.");
      }

      if (!window.DAYONE_CONFIG?.API_BASE_URL) {
        showMessage(
          policyMessage,
          "Preview mode: the acknowledgement was not saved."
        );
        return;
      }

      if (!window.DayOneAPI?.completeStage) {
        throw new Error("The onboarding workflow API is unavailable.");
      }

      if (submitButton) submitButton.disabled = true;

      await window.DayOneAPI.completeStage("policy");

      // Update the UI only after the backend confirms success.
      completed.add("policy");
      liveMode = true;
      renderStages();

      showMessage(
        policyMessage,
        "Policy acknowledgement saved successfully.",
        "success"
      );
    } catch (error) {
      console.error("Policy acknowledgement failed:", error);
      showMessage(
        policyMessage,
        error.message || "Could not submit acknowledgement."
      );
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }

  documentForm?.addEventListener("submit", uploadDocument);
  policyForm?.addEventListener("submit", acknowledgePolicy);

  // Start with a neutral state, then load live or preview progress.
  renderStages();
  loadProgress();
})();

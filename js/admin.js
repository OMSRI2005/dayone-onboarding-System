"use strict";

(() => {
  const table = document.getElementById("employee-table");
  const search = document.getElementById("employee-search");
  const filter = document.getElementById("status-filter");
  const message = document.getElementById("admin-message");
  const refreshButton = document.getElementById("refresh-button");
  const exportButton = document.getElementById("export-button");
  const logoutLink = document.getElementById("logout-link");

  const form = document.getElementById("add-employee-form");
  const addButton = document.getElementById("add-employee-button");
  const formMessage = document.getElementById("add-employee-message");

  if (!table || !search || !filter || !message || !form) {
    console.error("Required HR dashboard elements are missing.");
    return;
  }

  let employees = [];
  let employeeListAvailable = false;

  logoutLink?.addEventListener("click", event => {
    event.preventDefault();
    window.DayOneAuth?.signOut();
  });

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  }

  function showFormMessage(text, type = "") {
    if (!formMessage) return;

    formMessage.textContent = text;
    formMessage.className = "notice" + (type ? " " + type : "");
  }

  // Normalize an employee record and calculate progress from the
  // progress API response when available.
  function normalizeEmployee(record, progressRecord = null) {
    const joiningDate =
      record.joiningDate ||
      record.joining_date ||
      record.joiningDateString ||
      "";

    const rawStatus = String(
      record.onboarding_status || record.status || "Pending"
    ).toLowerCase();

    let status = "Pending";

    if (rawStatus.includes("complete")) {
      status = "Completed";
    } else if (
      rawStatus.includes("progress") ||
      rawStatus.includes("in_progress") ||
      rawStatus.includes("in progress")
    ) {
      status = "In Progress";
    }

    let progress = Number(record.progress);

    if (progressRecord) {
      const totalDocuments =
        Number(progressRecord.total_documents) || 3;

      const verifiedDocuments =
        Number(progressRecord.documents_verified_count) || 0;

      const documentsCompleted =
        totalDocuments > 0 &&
        verifiedDocuments >= totalDocuments;

      const stages = [
        documentsCompleted,
        String(
          progressRecord.provisioning_status || ""
        ).toUpperCase() === "COMPLETED",
        String(
          progressRecord.policy_signoff_status || ""
        ).toUpperCase() === "COMPLETED",
        String(
          progressRecord.manager_intro_status || ""
        ).toUpperCase() === "COMPLETED"
      ];

      progress = Math.round(
        (stages.filter(Boolean).length / stages.length) * 100
      );

      status = progress === 100 ? "Completed" : "In Progress";
    } else if (!Number.isFinite(progress)) {
      progress = status === "Completed" ? 100 : 0;
    }

    return {
      id: record.employee_id || record.id || "",
      name: record.name || record.full_name || "",
      email: record.email || "",
      department: record.department || "",
      joiningDate,
      status,
      progress: Math.max(0, Math.min(100, progress))
    };
  }

  async function checkAdminAccess() {
    if (!window.DayOneAuth?.getSession) {
      throw new Error(
        "Authentication is unavailable. Check js/auth.js."
      );
    }

    const session = await window.DayOneAuth.getSession();
    const payload = session.getIdToken().decodePayload();
    const groups = payload["cognito:groups"] || [];

    if (!groups.includes("HRAdmin")) {
      window.location.replace("index.html");
      throw new Error("HR administrator access is required.");
    }
  }

  function updateStats() {
    if (!employeeListAvailable) {
      setText("total-employees", "—");
      setText("in-progress", "—");
      setText("completed-count", "—");
      setText("pending-review", "—");
      return;
    }

    setText("total-employees", employees.length);

    setText(
      "in-progress",
      employees.filter(e => e.status === "In Progress").length
    );

    setText(
      "completed-count",
      employees.filter(e => e.status === "Completed").length
    );

    setText(
      "pending-review",
      employees.filter(e => e.status === "Pending").length
    );
  }

  function makeCell(value) {
    const cell = document.createElement("td");

    cell.textContent =
      value == null || value === "" ? "—" : String(value);

    return cell;
  }

  function render() {
    const query = search.value.trim().toLowerCase();
    const selectedStatus = filter.value;

    const filtered = employees.filter(employee => {
      const matchesSearch =
        String(employee.name).toLowerCase().includes(query) ||
        String(employee.email).toLowerCase().includes(query);

      const matchesStatus =
        selectedStatus === "all" ||
        employee.status === selectedStatus;

      return matchesSearch && matchesStatus;
    });

    table.replaceChildren();

    if (!employeeListAvailable) {
      const row = document.createElement("tr");
      const cell = makeCell(
        "The employee list could not be loaded. You can still try adding an employee above."
      );

      cell.colSpan = 6;
      row.appendChild(cell);
      table.appendChild(row);
      return;
    }

    if (!filtered.length) {
      const row = document.createElement("tr");
      const cell = makeCell("No matching employees.");

      cell.colSpan = 6;
      row.appendChild(cell);
      table.appendChild(row);
      return;
    }

    filtered.forEach(employee => {
      const row = document.createElement("tr");

      row.append(
        makeCell(employee.name),
        makeCell(employee.email),
        makeCell(employee.department),
        makeCell(employee.joiningDate)
      );

      const statusCell = document.createElement("td");
      const badge = document.createElement("span");

      badge.className =
        "status " +
        (employee.status === "Completed"
          ? "complete"
          : employee.status === "In Progress"
            ? "progress"
            : "pending");

      badge.textContent = employee.status;
      statusCell.appendChild(badge);

      const progressCell = document.createElement("td");
      const label = document.createElement("div");

      label.textContent = employee.progress + "%";

      const track = document.createElement("div");
      track.className = "progress-track";

      const fill = document.createElement("div");
      fill.className = "progress-fill";
      fill.style.width = employee.progress + "%";

      track.appendChild(fill);
      progressCell.append(label, track);

      row.append(statusCell, progressCell);
      table.appendChild(row);
    });
  }

  // Load employees, then retrieve progress for each employee ID.
  async function loadEmployees() {
    if (refreshButton) refreshButton.disabled = true;

    message.textContent = "Loading employee records...";

    try {
      await checkAdminAccess();

      if (!window.DayOneAPI?.getEmployees) {
        throw new Error(
          "Employee API is unavailable. Check js/api.js."
        );
      }

      const result = await window.DayOneAPI.getEmployees();

      const records = Array.isArray(result)
        ? result
        : result?.employees;

      if (!Array.isArray(records)) {
        throw new Error(
          "The employee endpoint did not return a supported employee list."
        );
      }

      employees = await Promise.all(
        records.map(async record => {
          const employeeId = record.employee_id || record.id;

          if (!employeeId || !window.DayOneAPI?.getProgress) {
            return normalizeEmployee(record);
          }

          try {
            const progressRecord =
              await window.DayOneAPI.getProgress(employeeId);

            return normalizeEmployee(record, progressRecord);
          } catch (error) {
            console.warn(
              "Progress unavailable for employee:",
              employeeId,
              error.message
            );

            // Keep the employee visible even if progress cannot be loaded.
            return normalizeEmployee(record);
          }
        })
      );

      employeeListAvailable = true;
      updateStats();
      render();

      message.textContent =
        "Employee records loaded. Progress is shown where available.";
    } catch (error) {
      console.error("Employee loading failed:", error);

      employeeListAvailable = false;
      updateStats();
      render();

      message.textContent =
        "Employee list unavailable: " + error.message;
    } finally {
      if (refreshButton) refreshButton.disabled = false;
    }
  }

  async function handleAddEmployee(event) {
    event.preventDefault();
    showFormMessage("");

    if (!window.DayOneAPI?.createEmployee) {
      showFormMessage(
        "Employee creation API is unavailable. Check js/api.js.",
        "error"
      );
      return;
    }

    const formData = new FormData(form);

    const employee = {
      name: String(formData.get("name") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      department: String(formData.get("department") || "").trim(),
      role: String(formData.get("role") || "").trim(),
      manager: String(formData.get("manager") || "").trim(),
      joining_date: String(
        formData.get("joining_date") || ""
      ).trim(),
      employment_type: String(
        formData.get("employment_type") || ""
      ).trim()
    };

    if (addButton) {
      addButton.disabled = true;
      addButton.textContent = "Creating employee...";
    }

    try {
      await checkAdminAccess();

      const result =
        await window.DayOneAPI.createEmployee(employee);

      const employeeId = result?.employee_id || "";

      const successMessage =
        result?.message || "Employee created successfully.";

      showFormMessage(
        employeeId
          ? `${successMessage} Employee ID: ${employeeId}`
          : successMessage,
        "success"
      );

      form.reset();

      // Refresh from the backend so the real employee ID and progress
      // are used rather than relying on a temporary local record.
      await loadEmployees();
    } catch (error) {
      console.error("Employee creation failed:", error);

      showFormMessage(
        "Could not create employee: " + error.message,
        "error"
      );
    } finally {
      if (addButton) {
        addButton.disabled = false;
        addButton.textContent = "+ Add Employee";
      }
    }
  }

  function exportCsv() {
    if (!employeeListAvailable) {
      message.textContent =
        "CSV export is unavailable because employee records have not loaded.";
      return;
    }

    const query = search.value.trim().toLowerCase();
    const selectedStatus = filter.value;

    const filtered = employees.filter(employee => {
      const matchesSearch =
        String(employee.name).toLowerCase().includes(query) ||
        String(employee.email).toLowerCase().includes(query);

      const matchesStatus =
        selectedStatus === "all" ||
        employee.status === selectedStatus;

      return matchesSearch && matchesStatus;
    });

    const rows = [[
      "Employee ID",
      "Name",
      "Email",
      "Department",
      "Joining Date",
      "Status",
      "Progress"
    ]];

    filtered.forEach(employee => {
      rows.push([
        employee.id,
        employee.name,
        employee.email,
        employee.department,
        employee.joiningDate,
        employee.status,
        employee.progress + "%"
      ]);
    });

    const csv = rows.map(row =>
      row.map(value => {
        let text = String(value ?? "");

        if (/^[=+\-@\t\r]/.test(text)) {
          text = "'" + text;
        }

        return '"' + text.replace(/"/g, '""') + '"';
      }).join(",")
    ).join("\r\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "dayone-employees.csv";

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  search.addEventListener("input", render);
  filter.addEventListener("change", render);
  form.addEventListener("submit", handleAddEmployee);
  exportButton?.addEventListener("click", exportCsv);
  refreshButton?.addEventListener("click", loadEmployees);

  (async () => {
    try {
      await checkAdminAccess();
      await loadEmployees();
    } catch (error) {
      console.error("HR dashboard access check failed:", error);
      message.textContent = error.message;
    }
  })();
})();
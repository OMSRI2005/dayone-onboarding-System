
"use strict";

(() => {
  const table = document.getElementById("employee-table");
  const search = document.getElementById("employee-search");
  const filter = document.getElementById("status-filter");
  const message = document.getElementById("admin-message");
  const refreshButton = document.getElementById("refresh-button");
  const exportButton = document.getElementById("export-button");
  const logoutLink = document.getElementById("logout-link");

  if (!table || !search || !filter || !message) {
    console.error("Required HR dashboard elements are missing.");
    return;
  }

  const demoEmployees = [
    {
      name: "Aarav Sharma",
      email: "aarav@example.com",
      department: "Engineering",
      joiningDate: "2026-11-01",
      status: "In Progress",
      progress: 50
    },
    {
      name: "Priya Das",
      email: "priya@example.com",
      department: "Data",
      joiningDate: "2026-11-05",
      status: "Completed",
      progress: 100
    },
    {
      name: "Rahul Patel",
      email: "rahul@example.com",
      department: "Operations",
      joiningDate: "2026-11-12",
      status: "Pending",
      progress: 0
    }
  ];

  let employees = demoEmployees.slice();

  logoutLink?.addEventListener("click", event => {
    event.preventDefault();
    window.DayOneAuth?.signOut();
  });

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  }

  function updateStats() {
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
    const td = document.createElement("td");
    td.textContent = value == null ? "" : String(value);
    return td;
  }

  function render() {
    const query = search.value.trim().toLowerCase();
    const selectedStatus = filter.value;

    const filtered = employees.filter(employee => {
      const name = String(employee.name || "").toLowerCase();
      const email = String(employee.email || "").toLowerCase();

      const matchesSearch =
        name.includes(query) || email.includes(query);

      const matchesStatus =
        selectedStatus === "all" ||
        employee.status === selectedStatus;

      return matchesSearch && matchesStatus;
    });

    table.replaceChildren();

    if (!filtered.length) {
      const row = document.createElement("tr");
      const td = makeCell("No matching employees.");
      td.colSpan = 6;
      row.appendChild(td);
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
      const status = String(employee.status || "Pending");

      badge.className = "status " +
        (status === "Completed"
          ? "complete"
          : status === "In Progress"
            ? "progress"
            : "pending");

      badge.textContent = status;
      statusCell.appendChild(badge);

      const progressCell = document.createElement("td");
      const rawProgress = Number(employee.progress);
      const progressValue = Number.isFinite(rawProgress)
        ? Math.max(0, Math.min(100, rawProgress))
        : 0;

      const label = document.createElement("div");
      label.textContent = progressValue + "%";

      const track = document.createElement("div");
      track.className = "progress-track";

      const fill = document.createElement("div");
      fill.className = "progress-fill";
      fill.style.width = progressValue + "%";

      track.appendChild(fill);
      progressCell.append(label, track);
      row.append(statusCell, progressCell);
      table.appendChild(row);
    });
  }

  function exportCsv() {
    const query = search.value.trim().toLowerCase();
    const selectedStatus = filter.value;

    const filtered = employees.filter(employee => {
      const matchesSearch =
        String(employee.name || "").toLowerCase().includes(query) ||
        String(employee.email || "").toLowerCase().includes(query);

      const matchesStatus =
        selectedStatus === "all" ||
        employee.status === selectedStatus;

      return matchesSearch && matchesStatus;
    });

    const rows = [[
      "Name", "Email", "Department",
      "Joining Date", "Status", "Progress"
    ]];

    filtered.forEach(employee => {
      rows.push([
        employee.name,
        employee.email,
        employee.department,
        employee.joiningDate,
        employee.status,
        (Number(employee.progress) || 0) + "%"
      ]);
    });

    const csv = rows.map(row =>
      row.map(value => {
        let text = String(value ?? "");

        // Reduce spreadsheet formula-injection risk.
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

  async function checkAdminAccess() {
    if (!window.DayOneAuth?.getSession) {
      throw new Error("Authentication is unavailable.");
    }

    const session = await window.DayOneAuth.getSession();
    const payload = session.getIdToken().decodePayload();
    const groups = payload["cognito:groups"] || [];

    if (!groups.includes("HRAdmin")) {
      window.location.replace("index.html");
      throw new Error("HR administrator access is required.");
    }
  }

  async function loadEmployees() {
    if (refreshButton) refreshButton.disabled = true;

    try {
      await checkAdminAccess();

      if (!window.DAYONE_CONFIG?.API_BASE_URL) {
        message.textContent =
          "DEMO MODE: Showing fictional sample employees. Configure the API URL to load live records.";
        updateStats();
        render();
        return;
      }

      if (!window.DayOneAPI?.getEmployees) {
        throw new Error("Employee API is unavailable.");
      }

      message.textContent = "Loading employee records...";

      const result = await window.DayOneAPI.getEmployees();
      const records = Array.isArray(result)
        ? result
        : result?.employees;

      if (!Array.isArray(records)) {
        throw new Error("Unexpected employee API response.");
      }

      employees = records;
      updateStats();
      render();

      message.textContent = "Employee records loaded from the backend.";
    } catch (error) {
      console.error("Employee loading failed:", error);

      message.textContent =
        "Unable to load employees. Check your sign-in, API URL, routes, and permissions.";
    } finally {
      if (refreshButton) refreshButton.disabled = false;
    }
  }

  search.addEventListener("input", render);
  filter.addEventListener("change", render);
  exportButton?.addEventListener("click", exportCsv);
  refreshButton?.addEventListener("click", loadEmployees);

  message.textContent = "Checking administrator access...";
  loadEmployees();
})();

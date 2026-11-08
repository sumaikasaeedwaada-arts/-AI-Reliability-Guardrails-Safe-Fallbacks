const authScreen = document.querySelector("#auth-screen");
const workspace = document.querySelector("#workspace");
const authForm = document.querySelector("#auth-form");
const authError = document.querySelector("#auth-error");
const authToggle = document.querySelector("#auth-toggle");
const authSubmit = document.querySelector("#auth-submit");
const messageForm = document.querySelector("#message-form");
const messageInput = document.querySelector("#message-input");
const messagesNode = document.querySelector("#messages");
const welcome = document.querySelector("#welcome");
const conversationList = document.querySelector("#conversation-list");
const conversationTitle = document.querySelector("#conversation-title");
const documentList = document.querySelector("#document-list");
const documentInput = document.querySelector("#document-input");
const sendButton = document.querySelector("#send-button");
const toast = document.querySelector("#toast");
const notificationsTrigger = document.querySelector("#notifications-trigger");
const notificationsPanel = document.querySelector("#notifications-panel");
const notificationCount = document.querySelector("#notification-count");
const notificationList = document.querySelector("#notification-list");
const loadMoreNotifications = document.querySelector("#load-more-notifications");
const businessReport = document.querySelector("#business-report");
const summaryButton = document.querySelector("#generate-summary");
const insightsButton = document.querySelector("#generate-insights");

let token = localStorage.getItem("assistant-token");
let activeConversation = null;
let registering = false;
let toastTimer;
let notificationOffset = 0;
let notificationTotal = 0;
let notificationUnreadFilter = null;

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    let detail = "The request could not be completed.";
    try { detail = (await response.json()).detail || detail; } catch {}
    if (response.status === 401 && token) signOut();
    throw new Error(detail);
  }
  return response.status === 204 ? null : response.json();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3600);
}

function addReportSection(parent, title, items, emptyMessage) {
  const section = document.createElement("section");
  section.className = "report-section";
  const heading = document.createElement("h3");
  heading.textContent = title;
  section.append(heading);
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "report-empty";
    empty.textContent = emptyMessage;
    section.append(empty);
  } else {
    const list = document.createElement("ul");
    for (const item of items) {
      const entry = document.createElement("li");
      entry.textContent = item;
      list.append(entry);
    }
    section.append(list);
  }
  parent.append(section);
}

function renderBusinessSummary(summary) {
  businessReport.replaceChildren();
  const overview = document.createElement("p");
  overview.className = "report-overview";
  overview.textContent = summary.business_overview;
  businessReport.append(overview);
  addReportSection(
    businessReport,
    "Key activities",
    summary.key_activities,
    "No activities were available in the selected records."
  );
  addReportSection(
    businessReport,
    "Customer updates",
    summary.customer_updates,
    "No matching customer updates were available."
  );
  addReportSection(
    businessReport,
    "Task updates",
    summary.task_updates,
    "No task updates were available in the selected records."
  );
  addReportSection(
    businessReport,
    "Important updates",
    summary.important_updates,
    "No important updates were identified in the selected records."
  );
  addReportSection(
    businessReport,
    "Operational insights",
    summary.operational_insights,
    "No operational insights were supported by the selected records."
  );
  addReportSection(
    businessReport,
    "Data limitations",
    summary.data_limitations,
    "No additional limitations were reported."
  );
  businessReport.classList.remove("hidden");
}

function renderBusinessInsights(insights) {
  businessReport.replaceChildren();
  const groups = [
    ["Frequently reported issues", insights.frequently_reported_issues],
    ["Interaction patterns", insights.interaction_patterns],
    ["Feedback themes", insights.feedback_themes],
    ["Transaction wording patterns", insights.transaction_patterns]
  ];
  for (const [title, items] of groups) {
    const section = document.createElement("section");
    section.className = "report-section";
    const heading = document.createElement("h3");
    heading.textContent = title;
    section.append(heading);
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "report-empty";
      empty.textContent = "No repeated pattern met the evidence threshold.";
      section.append(empty);
    } else {
      const list = document.createElement("ul");
      for (const item of items) {
        const entry = document.createElement("li");
        const period = item.first_record_upload && item.last_record_upload
          ? ` Uploaded ${item.first_record_upload.slice(0, 10)} to ${item.last_record_upload.slice(0, 10)}.`
          : "";
        entry.textContent =
          `${item.topic}: ${item.occurrence_count} text mentions in ` +
          `${item.distinct_document_count} documents.${period}`;
        list.append(entry);
      }
      section.append(list);
    }
    businessReport.append(section);
  }
  const recommendations = insights.service_opportunities.map((item) =>
    `${item.opportunity} Evidence: ${item.evidence_topic} in ` +
    `${item.supporting_document_count} documents (${item.basis}).`
  );
  addReportSection(
    businessReport,
    "Evidence-based recommendations",
    recommendations,
    "No recommendation was generated without repeated supporting evidence."
  );
  addReportSection(
    businessReport,
    "Data limitations",
    insights.data_limitations,
    "No additional limitations were reported."
  );
  businessReport.classList.remove("hidden");
}

async function generateBusinessReport(button, path, payload, render) {
  const defaultLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Generating…";
  businessReport.replaceChildren();
  businessReport.classList.remove("hidden");
  businessReport.setAttribute("aria-busy", "true");
  const loading = document.createElement("p");
  loading.className = "report-loading";
  loading.textContent = "Preparing a report from your available records…";
  businessReport.append(loading);
  try {
    const result = await api(path, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    render(result.summary || result.insights);
  } catch (error) {
    businessReport.replaceChildren();
    const message = document.createElement("p");
    message.className = "report-error";
    message.setAttribute("role", "alert");
    message.textContent = error.message;
    businessReport.append(message);
  } finally {
    businessReport.setAttribute("aria-busy", "false");
    button.disabled = false;
    button.textContent = defaultLabel;
  }
}

function readReportFilters() {
  const date_from = document.querySelector("#report-date-from").value;
  const date_to = document.querySelector("#report-date-to").value;
  const customer_identifier = document.querySelector("#report-customer").value.trim();
  return {
    ...(date_from ? { date_from } : {}),
    ...(date_to ? { date_to } : {}),
    ...(customer_identifier ? { customer_identifier } : {})
  };
}

function signOut() {
  localStorage.removeItem("assistant-token");
  token = null;
  activeConversation = null;
  clearContextFields();
  notificationsPanel.classList.add("hidden");
  notificationsTrigger.setAttribute("aria-expanded", "false");
  notificationCount.classList.add("hidden");
  workspace.classList.add("hidden");
  authScreen.classList.remove("hidden");
}

function clearContextFields() {
  document.querySelectorAll(".context-fields input, .context-fields textarea")
    .forEach((field) => { field.value = ""; });
}

function readMessageContext() {
  const customer_identifier = document.querySelector("#customer-identifier").value.trim();
  const readFields = (fields) => Object.fromEntries(
    fields.map(([key, selector]) => [key, document.querySelector(selector).value.trim()])
      .filter(([, value]) => value)
  );
  const business_context = readFields([
    ["business_id", "#business-context-id"],
    ["name", "#business-context-name"],
    ["details", "#business-context-details"]
  ]);
  const task_context = readFields([
    ["task_id", "#task-context-id"],
    ["current_task", "#task-context-current"],
    ["details", "#task-context-details"],
    ["status", "#task-context-status"],
    ["notes", "#task-context-notes"]
  ]);
  return {
    ...(customer_identifier ? { customer_identifier } : {}),
    ...(Object.keys(business_context).length ? { business_context } : {}),
    ...(Object.keys(task_context).length ? { task_context } : {})
  };
}

function addMessage(role, content, citations = []) {
  welcome.classList.add("hidden");
  const article = document.createElement("article");
  article.className = `message ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = content;
  article.append(bubble);
  if (citations.length) {
    const sourceList = document.createElement("div");
    sourceList.className = "citations";
    for (const citation of citations) {
      const source = document.createElement("span");
      source.className = "citation";
      source.textContent = `[${citation.index}] ${citation.filename}` +
        (citation.page_number ? ` · page ${citation.page_number}` : "");
      sourceList.append(source);
    }
    article.append(sourceList);
  }
  messagesNode.append(article);
  messagesNode.scrollTop = messagesNode.scrollHeight;
}

async function loadConversations() {
  const { conversations } = await api("/api/conversations");
  conversationList.replaceChildren();
  for (const conversation of conversations) {
    const button = document.createElement("button");
    button.className = "conversation-item" +
      (conversation.id === activeConversation ? " active" : "");
    button.textContent = conversation.title;
    button.title = conversation.title;
    button.addEventListener("click", () => openConversation(conversation.id));
    conversationList.append(button);
  }
  return conversations;
}

async function loadDocuments() {
  const { documents } = await api("/api/documents");
  documentList.replaceChildren();
  for (const item of documents) {
    const entry = document.createElement("div");
    entry.className = "document-entry";
    entry.textContent = item.filename;
    entry.title = item.filename;
    documentList.append(entry);
  }
}

async function refreshNotificationBadge() {
  const { unread_count } = await api("/api/notifications/unread-count");
  notificationCount.textContent = unread_count > 99 ? "99+" : String(unread_count);
  notificationCount.classList.toggle("hidden", unread_count === 0);
  notificationsTrigger.setAttribute(
    "aria-label",
    unread_count ? `Notifications, ${unread_count} unread` : "Notifications"
  );
}

function renderNotification(notification) {
  const entry = document.createElement("article");
  entry.className = `notification-entry ${notification.is_read ? "read" : "unread"}`;
  const indicator = document.createElement("span");
  indicator.className = "notification-indicator";
  indicator.setAttribute("aria-hidden", "true");

  const content = document.createElement("div");
  const summary = document.createElement("div");
  summary.className = "notification-content";
  const title = document.createElement("strong");
  title.textContent = notification.title;
  const message = document.createElement("p");
  message.textContent = notification.message;
  const created = document.createElement("time");
  created.dateTime = notification.created_at;
  created.textContent = new Date(notification.created_at).toLocaleString();
  summary.append(title, message, created);
  content.append(summary);

  const actions = document.createElement("div");
  actions.className = "notification-actions";
  if (!notification.is_read) {
    const markRead = document.createElement("button");
    markRead.type = "button";
    markRead.textContent = "Mark as read";
    markRead.addEventListener("click", async () => {
      try {
        await api(`/api/notifications/${notification.id}/read`, { method: "PATCH" });
        await Promise.all([refreshNotificationBadge(), loadNotifications(true)]);
      } catch (error) {
        showToast(error.message);
      }
    });
    actions.append(markRead);
  }
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Delete";
  remove.addEventListener("click", async () => {
    try {
      await api(`/api/notifications/${notification.id}`, { method: "DELETE" });
      await Promise.all([refreshNotificationBadge(), loadNotifications(true)]);
    } catch (error) {
      showToast(error.message);
    }
  });
  actions.append(remove);
  content.append(actions);
  entry.append(indicator, content);
  notificationList.append(entry);
}

async function loadNotifications(reset = false) {
  if (reset) {
    notificationOffset = 0;
    notificationTotal = 0;
    notificationList.replaceChildren();
  }
  const params = new URLSearchParams({
    limit: "10",
    offset: String(notificationOffset)
  });
  if (notificationUnreadFilter !== null) {
    params.set("unread", String(notificationUnreadFilter));
  }
  const result = await api(`/api/notifications?${params}`);
  notificationTotal = result.total;
  for (const notification of result.notifications) renderNotification(notification);
  notificationOffset += result.notifications.length;
  if (notificationOffset === 0) {
    const empty = document.createElement("p");
    empty.className = "notification-empty";
    empty.textContent = notificationUnreadFilter
      ? "You’re all caught up."
      : "No notifications yet.";
    notificationList.append(empty);
  }
  loadMoreNotifications.classList.toggle(
    "hidden",
    notificationOffset >= notificationTotal
  );
}

async function openConversation(id) {
  clearContextFields();
  activeConversation = id;
  const { messages } = await api(`/api/conversations/${encodeURIComponent(id)}/messages`);
  const conversations = await loadConversations();
  conversationTitle.textContent =
    conversations.find((conversation) => conversation.id === id)?.title || "Conversation";
  document.querySelector("#sidebar").classList.remove("mobile-open");
  messagesNode.replaceChildren(welcome);
  welcome.classList.toggle("hidden", messages.length > 0);
  for (const message of messages) {
    addMessage(message.role, message.content, message.citations);
  }
}

async function showWorkspace() {
  authScreen.classList.add("hidden");
  workspace.classList.remove("hidden");
  try {
    await Promise.all([
      loadConversations(),
      loadDocuments(),
      refreshNotificationBadge()
    ]);
  } catch (error) {
    showToast(error.message);
  }
}

authToggle.addEventListener("click", () => {
  registering = !registering;
  authSubmit.textContent = registering ? "Create account" : "Sign in";
  authToggle.textContent = registering ? "I already have an account" : "Create an account";
  document.querySelector("#password").autocomplete =
    registering ? "new-password" : "current-password";
  authError.textContent = "";
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authError.textContent = "";
  authSubmit.disabled = true;
  try {
    const result = await api(
      registering ? "/api/auth/register" : "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify({
          email: document.querySelector("#email").value,
          password: document.querySelector("#password").value
        })
      }
    );
    token = result.access_token;
    localStorage.setItem("assistant-token", token);
    await showWorkspace();
  } catch (error) {
    authError.textContent = error.message;
  } finally {
    authSubmit.disabled = false;
  }
});

document.querySelector("#new-chat").addEventListener("click", async () => {
  try {
    clearContextFields();
    const conversation = await api("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ title: "New conversation" })
    });
    activeConversation = conversation.id;
    conversationTitle.textContent = conversation.title;
    document.querySelector("#sidebar").classList.remove("mobile-open");
    messagesNode.replaceChildren(welcome);
    welcome.classList.remove("hidden");
    await loadConversations();
    messageInput.focus();
  } catch (error) {
    showToast(error.message);
  }
});

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;
  sendButton.disabled = true;
  try {
    if (!activeConversation) {
      const conversation = await api("/api/conversations", {
        method: "POST",
        body: JSON.stringify({ title: text.slice(0, 70) || "New conversation" })
      });
      activeConversation = conversation.id;
    }
    addMessage("user", text);
    messageInput.value = "";
    const pending = document.createElement("article");
    pending.className = "message assistant";
    pending.textContent = "Thinking…";
    pending.setAttribute("aria-live", "polite");
    messagesNode.append(pending);
    messagesNode.scrollTop = messagesNode.scrollHeight;
    const result = await api(
      `/api/conversations/${encodeURIComponent(activeConversation)}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ message: text, ...readMessageContext() })
      }
    );
    pending.remove();
    addMessage("assistant", result.response, result.citations);
    conversationTitle.textContent = text.slice(0, 70);
    await loadConversations();
  } catch (error) {
    showToast(error.message);
    await loadConversations();
  } finally {
    sendButton.disabled = false;
    messageInput.focus();
  }
});

async function uploadSelectedFile() {
  const file = documentInput.files[0];
  if (!file) return;
  const body = new FormData();
  body.append("file", file);
  documentInput.value = "";
  showToast(`Processing ${file.name}…`);
  try {
    const result = await api("/api/documents", { method: "POST", body });
    await loadDocuments();
    await refreshNotificationBadge();
    if (!notificationsPanel.classList.contains("hidden")) {
      await loadNotifications(true);
    }
    showToast(`${result.filename} is ready (${result.chunk_count} chunks).`);
  } catch (error) {
    showToast(error.message);
  }
}

document.querySelector("#upload-trigger").addEventListener("click", () => documentInput.click());
document.querySelector("#mobile-upload").addEventListener("click", () => documentInput.click());
document.querySelector("#mobile-menu").addEventListener("click", () => {
  document.querySelector("#sidebar").classList.toggle("mobile-open");
});
document.querySelector("#close-sidebar").addEventListener("click", () => {
  document.querySelector("#sidebar").classList.remove("mobile-open");
});
documentInput.addEventListener("change", uploadSelectedFile);
document.querySelector("#sign-out").addEventListener("click", signOut);
summaryButton.addEventListener("click", () => {
  const filters = readReportFilters();
  generateBusinessReport(
    summaryButton,
    "/api/business-summary",
    filters,
    renderBusinessSummary
  );
});
insightsButton.addEventListener("click", () => {
  generateBusinessReport(
    insightsButton,
    "/api/business/insights/generate",
    readReportFilters(),
    renderBusinessInsights
  );
});
notificationsTrigger.addEventListener("click", async () => {
  const opening = notificationsPanel.classList.contains("hidden");
  notificationsPanel.classList.toggle("hidden", !opening);
  notificationsTrigger.setAttribute("aria-expanded", String(opening));
  if (opening) {
    try {
      await loadNotifications(true);
      await refreshNotificationBadge();
    } catch (error) {
      showToast(error.message);
    }
  }
});
document.querySelectorAll("[data-notification-filter]").forEach((button) => {
  button.addEventListener("click", async () => {
    notificationUnreadFilter = button.dataset.notificationFilter === "unread"
      ? true
      : null;
    document.querySelectorAll("[data-notification-filter]").forEach((filter) => {
      const active = filter === button;
      filter.classList.toggle("active", active);
      filter.setAttribute("aria-pressed", String(active));
    });
    try {
      await loadNotifications(true);
    } catch (error) {
      showToast(error.message);
    }
  });
});
document.querySelector("#mark-all-read").addEventListener("click", async () => {
  try {
    await api("/api/notifications/mark-all-read", { method: "PATCH" });
    await Promise.all([refreshNotificationBadge(), loadNotifications(true)]);
  } catch (error) {
    showToast(error.message);
  }
});
loadMoreNotifications.addEventListener("click", async () => {
  try {
    await loadNotifications();
  } catch (error) {
    showToast(error.message);
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".notification-menu") &&
      !notificationsPanel.classList.contains("hidden")) {
    notificationsPanel.classList.add("hidden");
    notificationsTrigger.setAttribute("aria-expanded", "false");
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !notificationsPanel.classList.contains("hidden")) {
    notificationsPanel.classList.add("hidden");
    notificationsTrigger.setAttribute("aria-expanded", "false");
    notificationsTrigger.focus();
  }
});

if (token) showWorkspace();

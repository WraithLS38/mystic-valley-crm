// API Base URL - Auto-detect based on environment
const API_URL = window.location.hostname.includes('super.myninja.ai') || window.location.hostname.includes('render.com') 
    ? '/api'  // Same origin for production
    : '/api'; // Same origin (let reverse proxy handle it)

// State
let leads = [];
let orders = [];
let emails = [];
let products = {};
let settings = {};
let selectedLeads = [];
let currentTemplate = 'initial';
let generatedEmail = null;

// DOM Elements
const views = document.querySelectorAll('.view');
const navItems = document.querySelectorAll('.nav-item');
const modalOverlay = document.getElementById('modal-overlay');
const leadModal = document.getElementById('lead-modal');
const orderModal = document.getElementById('order-modal');
const leadForm = document.getElementById('lead-form');
const orderForm = document.getElementById('order-form');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([
        loadStats(),
        loadLeads(),
        loadOrders(),
        loadProducts(),
        loadSettings(),
        loadEmailHistory()
    ]);
    initEventListeners();
    initProductsView();
});

// Event Listeners
function initEventListeners() {
    // Navigation
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            switchView(view);
        });
    });

    // Quick Add Lead
    document.getElementById('quick-add-lead').addEventListener('click', () => {
        openLeadModal();
    });

    // Lead Modal
    leadForm.addEventListener('submit', handleLeadSubmit);
    document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
        btn.addEventListener('click', closeModals);
    });
    modalOverlay.addEventListener('click', closeModals);

    // Search & Filters
    document.getElementById('lead-search').addEventListener('input', filterLeads);
    document.getElementById('status-filter').addEventListener('change', filterLeads);
    document.getElementById('rank-filter').addEventListener('change', filterLeads);
    document.getElementById('select-all-leads').addEventListener('change', toggleSelectAllLeads);

    // Bulk Actions
    document.getElementById('qualify-all-btn').addEventListener('click', qualifyAllLeads);
    document.getElementById('bulk-email-btn').addEventListener('click', openBulkEmail);
    document.getElementById('bulk-delete-btn').addEventListener('click', bulkDeleteLeads);

    // Scraper
    document.getElementById('start-scraper').addEventListener('click', startScraper);
    document.getElementById('select-all-results').addEventListener('click', toggleSelectAllResults);
    document.getElementById('import-selected').addEventListener('click', importSelectedLeads);

    // Email
    document.querySelectorAll('.template-item').forEach(item => {
        item.addEventListener('click', () => selectTemplate(item.dataset.template));
    });
    document.getElementById('send-email').addEventListener('click', sendEmail);

    // Orders
    document.getElementById('new-order-btn').addEventListener('click', openOrderModal);
    document.getElementById('order-search').addEventListener('input', filterOrders);
    document.getElementById('order-status-filter').addEventListener('change', filterOrders);
    orderForm.addEventListener('submit', handleOrderSubmit);
    document.getElementById('order-discount').addEventListener('change', calculateOrderTotal);
    document.getElementById('order-shipping').addEventListener('input', calculateOrderTotal);

    // Settings
    document.getElementById('save-smtp').addEventListener('click', saveSMTPSettings);
    document.getElementById('save-business').addEventListener('click', saveBusinessSettings);
    document.getElementById('save-openai').addEventListener('click', saveOpenAISettings);
    document.getElementById('save-serpapi').addEventListener('click', saveSerpAPISettings);
}

// View Switching
function switchView(viewName) {
    views.forEach(view => view.classList.remove('active'));
    navItems.forEach(item => item.classList.remove('active'));
    
    document.getElementById(`${viewName}-view`).classList.add('active');
    document.querySelector(`[data-view="${viewName}"]`).classList.add('active');
    
    document.getElementById('page-title').textContent = viewName.charAt(0).toUpperCase() + viewName.slice(1);
}

// API Functions
async function apiGet(endpoint) {
    const response = await fetch(`${API_URL}${endpoint}`);
    return response.json();
}

async function apiPost(endpoint, data) {
    const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return response.json();
}

async function apiPut(endpoint, data) {
    const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return response.json();
}

async function apiDelete(endpoint) {
    const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'DELETE'
    });
    return response.json();
}

// Load Data
async function loadStats() {
    try {
        const stats = await apiGet('/stats');
        document.getElementById('stat-total-leads').textContent = stats.totalLeads;
        document.getElementById('stat-hot-leads').textContent = stats.hotLeads;
        document.getElementById('stat-contacted').textContent = stats.contactedLeads;
        document.getElementById('stat-customers').textContent = stats.customers;
        document.getElementById('stat-orders').textContent = stats.totalOrders;
        document.getElementById('stat-revenue').textContent = formatCurrency(stats.totalRevenue);
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function loadLeads() {
    try {
        leads = await apiGet('/leads');
        renderLeads();
        renderHotLeads();
        renderRecentActivity();
    } catch (error) {
        console.error('Error loading leads:', error);
    }
}

async function loadOrders() {
    try {
        orders = await apiGet('/orders');
        renderOrders();
    } catch (error) {
        console.error('Error loading orders:', error);
    }
}

async function loadProducts() {
    try {
        const data = await apiGet('/products');
        products = data.products;
    } catch (error) {
        console.error('Error loading products:', error);
    }
}

async function loadSettings() {
    try {
        settings = await apiGet('/settings');
        populateSettings();
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

async function loadEmailHistory() {
    try {
        emails = await apiGet('/emails');
        renderEmailHistory();
    } catch (error) {
        console.error('Error loading email history:', error);
    }
}

// Render Functions
function renderLeads(filteredLeads = leads) {
    const tbody = document.getElementById('leads-tbody');
    tbody.innerHTML = filteredLeads.map(lead => `
        <tr data-id="${lead.id}">
            <td><input type="checkbox" class="lead-checkbox" data-id="${lead.id}"></td>
            <td>
                <div class="lead-company">
                    <strong>${lead.company || '-'}</strong>
                    ${lead.website ? `<br><small style="color: var(--text-muted)">${lead.website}</small>` : ''}
                </div>
            </td>
            <td>${lead.name || '-'}</td>
            <td>${lead.email || '-'}</td>
            <td>${lead.phone || '-'}</td>
            <td>
                <div class="score-display">
                    <div class="score-bar">
                        <div class="score-fill" style="width: ${Math.min(lead.score, 100)}%; background: ${getScoreColor(lead.score)}"></div>
                    </div>
                    <span>${lead.score}</span>
                </div>
            </td>
            <td><span class="rank-badge ${lead.rank}">${getRankIcon(lead.rank)} ${capitalize(lead.rank)}</span></td>
            <td><span class="status-badge ${lead.status}">${capitalize(lead.status)}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn" onclick="generateAIEmailForLead('${lead.id}')" title="AI Generate Email">
                        <i class="fas fa-magic"></i>
                    </button>
                    <button class="action-btn" onclick="sendAIEmailToLead('${lead.id}')" title="Send AI Email">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                    <button class="action-btn" onclick="createOrderForm('${lead.id}')" title="Create Order Form">
                        <i class="fas fa-file-alt"></i>
                    </button>
                    <button class="action-btn" onclick="qualifyLead('${lead.id}')" title="Qualify">
                        <i class="fas fa-check-circle"></i>
                    </button>
                    <button class="action-btn" onclick="editLead('${lead.id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn" onclick="deleteLead('${lead.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    // Update checkboxes
    document.querySelectorAll('.lead-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', updateSelectedLeads);
    });

    updateBulkActions();
}

function renderHotLeads() {
    const container = document.getElementById('hot-leads-list');
    const hotLeads = leads.filter(l => l.rank === 'hot').slice(0, 5);
    
    if (hotLeads.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 1rem;">No hot leads yet. Qualify your leads to find hot prospects!</p>';
        return;
    }
    
    container.innerHTML = hotLeads.map(lead => `
        <div class="lead-preview-item">
            <div class="lead-preview-info">
                <h4>${lead.company}</h4>
                <span>${lead.email}</span>
            </div>
            <div style="display: flex; gap: 5px;">
                <button class="btn btn-primary btn-sm" onclick="sendAIEmailToLead('${lead.id}')" title="Send AI Email">
                    <i class="fas fa-paper-plane"></i>
                </button>
                <span class="rank-badge hot"><i class="fas fa-fire"></i> ${lead.score}</span>
            </div>
        </div>
    `).join('');
}

function renderRecentActivity() {
    const container = document.getElementById('recent-activity');
    const activities = [];
    
    // Get recent leads
    leads.slice(-5).reverse().forEach(lead => {
        activities.push({
            type: 'lead',
            text: `New lead: <strong>${lead.company}</strong>`,
            time: formatDate(lead.createdAt)
        });
    });
    
    // Get recent orders
    orders.slice(-3).reverse().forEach(order => {
        activities.push({
            type: 'order',
            text: `Order <strong>${order.orderNumber}</strong> created`,
            time: formatDate(order.createdAt)
        });
    });
    
    // Sort by time
    activities.sort((a, b) => new Date(b.time) - new Date(a.time));
    
    if (activities.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 1rem;">No recent activity</p>';
        return;
    }
    
    container.innerHTML = activities.slice(0, 10).map(activity => `
        <div class="activity-item">
            <i class="fas fa-${activity.type === 'lead' ? 'user-plus' : 'shopping-cart'}"></i>
            <span>${activity.text}</span>
            <span class="time">${activity.time}</span>
        </div>
    `).join('');
}

function renderOrders(filteredOrders = orders) {
    const tbody = document.getElementById('orders-tbody');
    tbody.innerHTML = filteredOrders.map(order => `
        <tr>
            <td><strong>${order.orderNumber}</strong></td>
            <td>${order.customerInfo?.company || order.customerName || 'Unknown'}</td>
            <td>${(order.items ? order.items.length : 0) + (order.bulkItems ? order.bulkItems.length : 0)} items${order.bulkItems?.length ? ` (${order.totalBulkLbs} lbs bulk)` : ''}</td>
            <td>${formatCurrency(order.total || 0)}</td>
            <td><span class="status-badge ${order.status}">${capitalize(order.status)}</span></td>
            <td>${formatDate(order.createdAt)}</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn" onclick="viewOrder('${order.id}')" title="View">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn" onclick="updateOrderStatus('${order.id}')" title="Update Status">
                        <i class="fas fa-sync"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderEmailHistory() {
    const container = document.getElementById('email-history-list');
    
    if (emails.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 1rem;">No emails sent yet</p>';
        return;
    }
    
    container.innerHTML = emails.slice(-10).reverse().map(email => `
        <div class="history-item">
            <div class="email-info">
                <span class="email-to">${email.to}</span>
                <span class="email-subject">${email.subject}</span>
                ${email.aiGenerated ? '<span class="ai-badge" style="font-size: 0.7rem; background: var(--primary); color: white; padding: 1px 5px; border-radius: 3px;">AI</span>' : ''}
            </div>
            <span class="email-date">${formatDate(email.sentAt)}</span>
        </div>
    `).join('');
}

function initProductsView() {
    const container = document.getElementById('products-list');
    
    const categories = [
        { key: 'blackTeas', name: 'Black Teas', icon: 'coffee' },
        { key: 'greenTeas', name: 'Green Teas', icon: 'leaf' },
        { key: 'oolongTeas', name: 'Oolong Teas', icon: 'spa' },
        { key: 'whiteTeas', name: 'White Teas', icon: 'feather' },
        { key: 'herbalTeas', name: 'Herbal Teas', icon: 'seedling' },
        { key: 'bottles', name: 'Bottled Teas', icon: 'wine-bottle' }
    ];
    
    container.innerHTML = categories.map(cat => `
        <div class="product-category">
            <div class="product-category-header">
                <i class="fas fa-${cat.icon}"></i>
                ${cat.name}
            </div>
            ${products[cat.key] ? products[cat.key].map(product => `
                <div class="product-item">
                    <span class="product-name">${product.name}</span>
                    <div class="product-prices">
                        <span class="price-small">S: ${formatCurrency(product.smallPrice || product.price)}</span>
                        ${product.largePrice ? `<span class="price-large">L: ${formatCurrency(product.largePrice)}</span>` : ''}
                    </div>
                </div>
            `).join('') : ''}
        </div>
    `).join('');
}

// Lead Functions
function openLeadModal(lead = null) {
    const title = document.getElementById('lead-modal-title');
    title.textContent = lead ? 'Edit Lead' : 'Add Lead';
    
    if (lead) {
        leadForm.dataset.id = lead.id;
        populateForm(leadForm, lead);
    } else {
        delete leadForm.dataset.id;
        leadForm.reset();
    }
    
    modalOverlay.classList.add('active');
    leadModal.classList.add('active');
}

function closeModals() {
    modalOverlay.classList.remove('active');
    leadModal.classList.remove('active');
    orderModal.classList.remove('active');
}

async function handleLeadSubmit(e) {
    e.preventDefault();
    const formData = new FormData(leadForm);
    const data = Object.fromEntries(formData);
    
    // Add notes as array if provided
    if (data.notes) {
        data.notes = [{ text: data.notes, date: new Date().toISOString() }];
    }
    
    try {
        if (leadForm.dataset.id) {
            await apiPut(`/leads/${leadForm.dataset.id}`, data);
            showToast('Lead updated successfully', 'success');
        } else {
            await apiPost('/leads', data);
            showToast('Lead added successfully', 'success');
        }
        
        closeModals();
        await loadLeads();
        await loadStats();
    } catch (error) {
        showToast('Failed to save lead', 'error');
    }
}

function editLead(id) {
    const lead = leads.find(l => l.id === id);
    if (lead) openLeadModal(lead);
}

async function deleteLead(id) {
    if (!confirm('Are you sure you want to delete this lead?')) return;
    
    try {
        await apiDelete(`/leads/${id}`);
        showToast('Lead deleted', 'success');
        await loadLeads();
        await loadStats();
    } catch (error) {
        showToast('Failed to delete lead', 'error');
    }
}

async function qualifyLead(id) {
    try {
        await apiPost(`/leads/${id}/qualify`, {});
        showToast('Lead qualified', 'success');
        await loadLeads();
        await loadStats();
    } catch (error) {
        showToast('Failed to qualify lead', 'error');
    }
}

async function qualifyAllLeads() {
    try {
        await apiPost('/leads/qualify-all', {});
        showToast('All leads qualified', 'success');
        await loadLeads();
        await loadStats();
    } catch (error) {
        showToast('Failed to qualify leads', 'error');
    }
}

// ============ AI EMAIL FUNCTIONS ============

async function generateAIEmailForLead(leadId) {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    
    showToast('Generating personalized email with AI...', 'info');
    
    try {
        const result = await apiPost(`/leads/${leadId}/generate-email`, {
            emailType: lead.emails && lead.emails.length > 0 ? 'followup' : 'initial'
        });
        
        if (result.success) {
            generatedEmail = result.email;
            
            // Show email preview modal
            showEmailPreview(lead, result.email);
        }
    } catch (error) {
        showToast('Failed to generate email. Make sure OpenAI API key is configured.', 'error');
    }
}

function showEmailPreview(lead, email) {
    const confirmed = confirm(`AI Generated Email for ${lead.company}:

Subject: ${email.subject}

${email.body.substring(0, 500)}${email.body.length > 500 ? '...' : ''}

Click OK to send this email, or Cancel to edit it manually.`);
    
    if (confirmed) {
        sendAIEmailToLead(lead.id, email);
    } else {
        // Switch to email view for manual editing
        switchView('emails');
        document.getElementById('email-recipients').innerHTML = `
            <span class="recipient-tag">
                ${lead.company || lead.email}
                <button onclick="removeRecipient('${lead.id}')">&times;</button>
            </span>
        `;
        selectedLeads = [lead.id];
        document.getElementById('email-subject').value = email.subject;
        document.getElementById('email-body').value = email.body;
    }
}

async function sendAIEmailToLead(leadId, overrideEmail = null) {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    
    const emailType = lead.emails && lead.emails.length > 0 ? 'followup' : 'initial';
    
    showToast('Sending AI-generated email...', 'info');
    
    try {
        const body = overrideEmail ? { emailType, overrideEmail } : { emailType };
        const result = await apiPost(`/leads/${leadId}/send-ai-email`, body);
        
        if (result.success) {
            showToast('Email sent successfully!', 'success');
            await loadLeads();
            await loadEmailHistory();
            await loadStats();
        } else {
            showToast(result.error || 'Failed to send email', 'error');
        }
    } catch (error) {
        showToast('Failed to send email. Check SMTP settings.', 'error');
    }
}

// Create Order Form Link
async function createOrderForm(leadId) {
    const lead = leads.find(l => l.id === leadId);
    
    try {
        const result = await apiPost('/order-forms/create', { leadId });
        
        if (result.success) {
            const orderFormUrl = result.url;
            
            // Show the link
            prompt(`Order form link for ${lead?.company || 'customer'}:\n\nCopy and send this link:`, orderFormUrl);
            
            showToast('Order form created! Copy the link to send to your customer.', 'success');
        }
    } catch (error) {
        showToast('Failed to create order form', 'error');
    }
}

// Selection & Bulk Actions
function updateSelectedLeads() {
    const checkboxes = document.querySelectorAll('.lead-checkbox:checked');
    selectedLeads = Array.from(checkboxes).map(cb => cb.dataset.id);
    updateBulkActions();
}

function toggleSelectAllLeads(e) {
    const checkboxes = document.querySelectorAll('.lead-checkbox');
    checkboxes.forEach(cb => cb.checked = e.target.checked);
    updateSelectedLeads();
}

function updateBulkActions() {
    const bulkActions = document.getElementById('bulk-actions');
    const selectedCount = document.getElementById('selected-count');
    
    if (selectedLeads.length > 0) {
        bulkActions.style.display = 'flex';
        selectedCount.textContent = `${selectedLeads.length} selected`;
    } else {
        bulkActions.style.display = 'none';
    }
}

function openBulkEmail() {
    switchView('emails');
    
    const selectedLeadObjs = leads.filter(l => selectedLeads.includes(l.id));
    document.getElementById('email-recipients').innerHTML = selectedLeadObjs.map(lead => `
        <span class="recipient-tag">
            ${lead.company || lead.email}
            <button onclick="removeRecipient('${lead.id}')">&times;</button>
        </span>
    `).join('');
    
    selectTemplate('initial');
}

function removeRecipient(id) {
    selectedLeads = selectedLeads.filter(lid => lid !== id);
    const container = document.getElementById('email-recipients');
    container.querySelector(`button[onclick="removeRecipient('${id}')"]`)?.parentElement?.remove();
}

async function bulkDeleteLeads() {
    if (!confirm(`Delete ${selectedLeads.length} leads?`)) return;
    
    try {
        for (const id of selectedLeads) {
            await apiDelete(`/leads/${id}`);
        }
        showToast('Leads deleted', 'success');
        selectedLeads = [];
        await loadLeads();
        await loadStats();
    } catch (error) {
        showToast('Failed to delete leads', 'error');
    }
}

// Filtering
function filterLeads() {
    const search = document.getElementById('lead-search').value.toLowerCase();
    const status = document.getElementById('status-filter').value;
    const rank = document.getElementById('rank-filter').value;
    
    const filtered = leads.filter(lead => {
        const matchesSearch = !search || 
            (lead.company && lead.company.toLowerCase().includes(search)) ||
            (lead.email && lead.email.toLowerCase().includes(search)) ||
            (lead.name && lead.name.toLowerCase().includes(search));
        const matchesStatus = !status || lead.status === status;
        const matchesRank = !rank || lead.rank === rank;
        
        return matchesSearch && matchesStatus && matchesRank;
    });
    
    renderLeads(filtered);
}

function filterOrders() {
    const search = document.getElementById('order-search').value.toLowerCase();
    const status = document.getElementById('order-status-filter').value;
    
    const filtered = orders.filter(order => {
        const matchesSearch = !search || 
            (order.orderNumber && order.orderNumber.toLowerCase().includes(search)) ||
            (order.customerInfo?.company && order.customerInfo.company.toLowerCase().includes(search));
        const matchesStatus = !status || order.status === status;
        
        return matchesSearch && matchesStatus;
    });
    
    renderOrders(filtered);
}

// Scraper
async function startScraper() {
    const businessType = document.getElementById('scraper-business-type').value;
    const location = document.getElementById('scraper-location').value;
    const keywords = document.getElementById('scraper-keywords').value;
    
    const btn = document.getElementById('start-scraper');
    btn.disabled = true;
    btn.innerHTML = '<span class="loading"></span> Searching...';
    
    try {
        const results = await apiPost('/leads/scrape', {
            query: keywords,
            location,
            businessType
        });
        
        displayScraperResults(results);
        showToast(`Found ${results.length} potential leads!`, 'success');
    } catch (error) {
        showToast('Failed to scrape leads', 'error');
    }
    
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-search"></i> Find Leads';
}

function displayScraperResults(results) {
    const container = document.getElementById('scraper-results');
    const list = document.getElementById('results-list');
    const count = document.getElementById('found-count');
    
    count.textContent = results.length;
    
    list.innerHTML = results.map(lead => `
        <div class="result-item">
            <input type="checkbox" class="result-checkbox" data-lead='${JSON.stringify(lead)}'>
            <div class="result-info">
                <h4>${lead.company}</h4>
                <p>${lead.email} | ${lead.phone || 'No phone'}</p>
                <div class="result-meta">
                    <span><i class="fas fa-map-marker-alt"></i> ${lead.location || 'Unknown'}</span>
                    <span><i class="fas fa-building"></i> ${lead.industry || 'Unknown'}</span>
                </div>
            </div>
        </div>
    `).join('');
    
    container.style.display = 'block';
}

function toggleSelectAllResults() {
    const checkboxes = document.querySelectorAll('.result-checkbox');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
}

async function importSelectedLeads() {
    const checkboxes = document.querySelectorAll('.result-checkbox:checked');
    const toImport = Array.from(checkboxes).map(cb => JSON.parse(cb.dataset.lead));
    
    if (toImport.length === 0) {
        showToast('No leads selected', 'warning');
        return;
    }
    
    try {
        for (const lead of toImport) {
            await apiPost('/leads', lead);
        }
        showToast(`Imported ${toImport.length} leads`, 'success');
        document.getElementById('scraper-results').style.display = 'none';
        await loadLeads();
        await loadStats();
    } catch (error) {
        showToast('Failed to import leads', 'error');
    }
}

// Email
function selectTemplate(template) {
    currentTemplate = template;
    
    document.querySelectorAll('.template-item').forEach(item => {
        item.classList.toggle('active', item.dataset.template === template);
    });
    
    if (settings.emailTemplates && settings.emailTemplates[template]) {
        document.getElementById('email-subject').value = settings.emailTemplates[template].subject;
        document.getElementById('email-body').value = settings.emailTemplates[template].body;
    }
}

async function sendEmail() {
    const subject = document.getElementById('email-subject').value;
    const body = document.getElementById('email-body').value;
    
    if (!subject || !body) {
        showToast('Please fill in subject and body', 'warning');
        return;
    }
    
    if (selectedLeads.length === 0) {
        showToast('No recipients selected', 'warning');
        return;
    }
    
    try {
        const result = await apiPost('/emails/bulk', {
            leadIds: selectedLeads,
            subject,
            body
        });
        
        showToast(`Sent ${result.totalSent} emails successfully!`, 'success');
        selectedLeads = [];
        document.getElementById('email-recipients').innerHTML = '';
        await loadLeads();
        await loadEmailHistory();
        await loadStats();
    } catch (error) {
        showToast(error.error || 'Failed to send emails', 'error');
    }
}

// Orders
function openOrderModal() {
    const customerSelect = document.getElementById('order-customer');
    customerSelect.innerHTML = '<option value="">Select customer...</option>' +
        leads.filter(l => l.status === 'customer' || l.status === 'contacted')
            .map(l => `<option value="${l.id}">${l.company} (${l.email})</option>`)
            .join('');
    
    initOrderProducts();
    orderForm.reset();
    modalOverlay.classList.add('active');
    orderModal.classList.add('active');
}

function initOrderProducts() {
    const container = document.getElementById('order-products');
    container.innerHTML = createOrderProductRow();
}

function createOrderProductRow() {
    const productOptions = [];
    for (const [category, items] of Object.entries(products)) {
        items.forEach(item => {
            productOptions.push(`<option value="${item.name}" data-small="${item.smallPrice || item.price}" data-large="${item.largePrice || ''}">${item.name}</option>`);
        });
    }
    
    return `
        <div class="order-product-item">
            <select class="product-select" onchange="updateOrderRow(this)">
                <option value="">Select product...</option>
                ${productOptions.join('')}
            </select>
            <select class="size-select">
                <option value="small">Small</option>
                <option value="large">Large</option>
            </select>
            <input type="number" class="quantity-input" value="1" min="1" onchange="calculateOrderTotal()">
            <input type="text" class="row-total" readonly value="$0.00">
        </div>
    `;
}

function updateOrderRow(select) {
    const row = select.closest('.order-product-item');
    const option = select.options[select.selectedIndex];
    const sizeSelect = row.querySelector('.size-select');
    
    if (option.dataset.large) {
        sizeSelect.innerHTML = `
            <option value="small">Small ($${option.dataset.small})</option>
            <option value="large">Large ($${option.dataset.large})</option>
        `;
    } else {
        sizeSelect.innerHTML = `<option value="small">$${option.dataset.small}</option>`;
    }
    
    calculateOrderTotal();
}

function calculateOrderTotal() {
    const rows = document.querySelectorAll('.order-product-item');
    let subtotal = 0;
    
    rows.forEach(row => {
        const select = row.querySelector('.product-select');
        const sizeSelect = row.querySelector('.size-select');
        const quantity = parseInt(row.querySelector('.quantity-input').value) || 0;
        const rowTotalInput = row.querySelector('.row-total');
        
        if (select.value) {
            const option = select.options[select.selectedIndex];
            const price = sizeSelect.value === 'large' 
                ? parseFloat(option.dataset.large) || 0
                : parseFloat(option.dataset.small) || 0;
            
            const rowTotal = price * quantity;
            rowTotalInput.value = formatCurrency(rowTotal);
            subtotal += rowTotal;
        }
    });
    
    const discount = parseFloat(document.getElementById('order-discount').value);
    const shipping = parseFloat(document.getElementById('order-shipping').value) || 0;
    const total = subtotal * (1 - discount) + shipping;
    
    document.getElementById('order-subtotal').value = formatCurrency(subtotal);
    document.getElementById('order-total').value = formatCurrency(total);
}

async function handleOrderSubmit(e) {
    e.preventDefault();
    const formData = new FormData(orderForm);
    const customerSelect = document.getElementById('order-customer');
    const selectedCustomer = leads.find(l => l.id === customerSelect.value);
    
    // Gather order items
    const items = [];
    const rows = document.querySelectorAll('.order-product-item');
    rows.forEach(row => {
        const product = row.querySelector('.product-select').value;
        const size = row.querySelector('.size-select').value;
        const quantity = parseInt(row.querySelector('.quantity-input').value) || 0;
        
        if (product && quantity > 0) {
            items.push({ product, size, quantity });
        }
    });
    
    const orderData = {
        leadId: formData.get('leadId') || null,
        customerName: selectedCustomer?.company || 'Walk-in',
        customerEmail: selectedCustomer?.email || '',
        items,
        subtotal: parseFloat(document.getElementById('order-subtotal').value.replace(/[$,]/g, '')),
        discount: parseFloat(document.getElementById('order-discount').value),
        shipping: parseFloat(document.getElementById('order-shipping').value) || 0,
        total: parseFloat(document.getElementById('order-total').value.replace(/[$,]/g, '')),
        notes: formData.get('notes') || ''
    };
    
    try {
        await apiPost('/orders', orderData);
        showToast('Order created successfully', 'success');
        closeModals();
        await loadOrders();
        await loadStats();
    } catch (error) {
        showToast('Failed to create order', 'error');
    }
}

async function updateOrderStatus(id) {
    const order = orders.find(o => o.id === id);
    if (!order) return;
    
    const statuses = ['pending', 'processing', 'shipped', 'completed', 'cancelled'];
    const currentIndex = statuses.indexOf(order.status);
    const nextStatus = statuses[(currentIndex + 1) % statuses.length];
    
    try {
        await apiPut(`/orders/${id}`, { status: nextStatus });
        showToast(`Order status updated to ${nextStatus}`, 'success');
        await loadOrders();
    } catch (error) {
        showToast('Failed to update order', 'error');
    }
}

function viewOrder(id) {
    const order = orders.find(o => o.id === id);
    if (!order) return;
    
    let itemsText = '';
    if (order.items && order.items.length > 0) {
        itemsText += order.items.map(i => `- ${i.name || i.product} (${i.size}) x${i.quantity}`).join('\n');
    }
    if (order.bulkItems && order.bulkItems.length > 0) {
        if (itemsText) itemsText += '\n';
        itemsText += '\n[BULK ORDERS]\n';
        itemsText += order.bulkItems.map(i => `- ${i.name} (Bulk) x${i.quantity} lbs`).join('\n');
        if (order.totalBulkLbs) {
            itemsText += `\nTotal: ${order.totalBulkLbs} lbs`;
        }
    }
    if (!itemsText) itemsText = 'No items';
    
    const shippingInfo = order.shippingInfo ? 
        `\n\nShipping:\n${order.shippingInfo.address}\n${order.shippingInfo.city}, ${order.shippingInfo.state} ${order.shippingInfo.zip}` : '';
    const deliveryInfo = order.deliveryInfo?.freeDelivery ? 
        `\n\n✓ FREE DELIVERY (${order.deliveryInfo.distance} miles from Rogue River)` : '';
    
    alert(`Order: ${order.orderNumber}\nCustomer: ${order.customerInfo?.company || order.customerName}\nEmail: ${order.customerInfo?.email || order.customerEmail}\nTotal: ${formatCurrency(order.total)}\nStatus: ${order.status}\n\nItems:\n${itemsText}${shippingInfo}${deliveryInfo}`);
}

// Settings
function populateSettings() {
    if (settings.smtp) {
        document.getElementById('smtp-host').value = settings.smtp.host || '';
        document.getElementById('smtp-port').value = settings.smtp.port || '';
        document.getElementById('smtp-user').value = settings.smtp.user || '';
    }
    if (settings.companyName) {
        document.getElementById('company-name').value = settings.companyName;
    }
    if (settings.businessEmail) {
        document.getElementById('business-email').value = settings.businessEmail;
    }
    if (settings.serpapiKey) {
        document.getElementById('serpapi-key').value = settings.serpapiKey;
    }
}

async function saveSMTPSettings() {
    const smtpData = {
        smtp: {
            host: document.getElementById('smtp-host').value,
            port: parseInt(document.getElementById('smtp-port').value),
            secure: false,
            user: document.getElementById('smtp-user').value,
            pass: document.getElementById('smtp-pass').value
        }
    };
    
    try {
        await apiPut('/settings', smtpData);
        showToast('SMTP settings saved', 'success');
    } catch (error) {
        showToast('Failed to save settings', 'error');
    }
}

async function saveBusinessSettings() {
    const businessData = {
        companyName: document.getElementById('company-name').value,
        businessEmail: document.getElementById('business-email').value
    };
    
    try {
        await apiPut('/settings', businessData);
        showToast('Business settings saved', 'success');
    } catch (error) {
        showToast('Failed to save settings', 'error');
    }
}

async function saveOpenAISettings() {
    const openaiKey = document.getElementById('openai-key').value;
    
    if (!openaiKey) {
        showToast('Please enter an OpenAI API key', 'warning');
        return;
    }
    
    try {
        await apiPut('/settings', { openaiKey });
        showToast('OpenAI settings saved! AI email generation is now enabled.', 'success');
    } catch (error) {
        showToast('Failed to save settings', 'error');
    }
}

async function saveSerpAPISettings() {
    const serpapiKey = document.getElementById('serpapi-key').value;
    
    if (!serpapiKey) {
        showToast('Please enter a SerpAPI key', 'warning');
        return;
    }
    
    try {
        await apiPut('/settings', { serpapiKey });
        showToast('SerpAPI settings saved! Real lead scraping is now enabled.', 'success');
    } catch (error) {
        showToast('Failed to save settings', 'error');
    }
}

// Utility Functions
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function getRankIcon(rank) {
    switch (rank) {
        case 'hot': return '<i class="fas fa-fire"></i>';
        case 'warm': return '<i class="fas fa-sun"></i>';
        case 'cold': return '<i class="fas fa-snowflake"></i>';
        default: return '<i class="fas fa-question"></i>';
    }
}

function getScoreColor(score) {
    if (score >= 70) return 'var(--hot)';
    if (score >= 50) return 'var(--warm)';
    if (score >= 30) return 'var(--cold)';
    return 'var(--text-muted)';
}

function populateForm(form, data) {
    Object.keys(data).forEach(key => {
        const input = form.querySelector(`[name="${key}"]`);
        if (input) {
            if (input.type === 'checkbox') {
                input.checked = data[key];
            } else {
                input.value = data[key];
            }
        }
    });
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Make functions globally available
window.editLead = editLead;
window.deleteLead = deleteLead;
window.qualifyLead = qualifyLead;
window.generateAIEmailForLead = generateAIEmailForLead;
window.sendAIEmailToLead = sendAIEmailToLead;
window.createOrderForm = createOrderForm;
window.removeRecipient = removeRecipient;
window.viewOrder = viewOrder;
window.updateOrderStatus = updateOrderStatus;
window.updateOrderRow = updateOrderRow;
window.calculateOrderTotal = calculateOrderTotal;
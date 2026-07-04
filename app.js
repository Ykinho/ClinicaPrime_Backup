/* ═══════════════════════════════════════════════════════════
   SOFIA 2.0 — app.js (DEFINITIVO)
   Auto-descoberta de modelos · Fallback inteligente · KPI Live
   ═══════════════════════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────────
// DOM REFS
// ─────────────────────────────────────────────
const $ = id => document.getElementById(id);

const onboardingOverlay  = $('onboarding-overlay');
const step1              = $('step-1');
const step2              = $('step-2');
const prog1              = $('prog-1');
const prog2              = $('prog-2');
const btnNextStep        = $('btn-next-step');
const btnSkipWebhook     = $('btn-skip-webhook');
const saveApiKeyBtn      = $('save-api-key');
const apiKeyInput        = $('api-key-input');
const modelSelectOnb     = $('model-select');
const webhookInput       = $('webhook-input');
const toggleKeyVisBtn    = $('toggle-key-visibility');

const appShell           = $('app-shell');
const sidebarEl          = $('sidebar');
const sidebarToggle      = $('sidebar-toggle');
const chatMessages       = $('chat-messages');
const userInput          = $('user-input');
const sendButton         = $('send-button');
const typingIndicator    = $('typing-indicator');
const agentStatusText    = $('agent-status-text');
const modelBadge         = $('model-badge');
const toastContainer     = $('toast-container');

const kpiLeadsToday      = $('kpi-leads-today');
const kpiLeadsTotal      = $('kpi-leads-total');
const kpiConvRate        = $('kpi-conv-rate');

const extractedName      = $('extracted-name');
const extractedPhone     = $('extracted-phone');
const extractedProcedure = $('extracted-procedure');
const extractedTime      = $('extracted-time');
const completionFill     = $('completion-fill');
const completionLabel    = $('completion-label');

const sheetsDot          = $('sheets-dot');
const statusSheets       = $('status-sheets');
const logsList           = $('logs-list');

const openConfigBtn      = $('open-config-btn');
const newChatBtn         = $('new-chat-btn');
const clearChatBtn       = $('clear-chat-btn');
const closeConfigBtn     = $('close-config-btn');
const saveConfigModal    = $('save-config-modal');
const configModal        = $('config-modal');
const apiKeyInputModal   = $('api-key-input-modal');
const modelSelectModal   = $('model-select-modal');
const webhookInputModal  = $('webhook-input-modal');
const welcomeTime        = $('welcome-time');

// ─────────────────────────────────────────────
// ESTADO GLOBAL
// ─────────────────────────────────────────────
let API_KEY     = localStorage.getItem('sofia_api_key')     || '';
let MODEL_NAME  = localStorage.getItem('sofia_model_name')  || 'auto';
let WEBHOOK_URL = localStorage.getItem('sofia_webhook_url') || 'https://script.google.com/macros/s/AKfycbxrgSw1N0bJ24EAPBRDQCzLvSgkf2dGIjRvTezrcHftfeC7mdOJ8tOB6zXD9JdJGfVy/exec';

// Modelos descobertos e testados via API (populados dinamicamente)
let AVAILABLE_MODELS  = JSON.parse(localStorage.getItem('sofia_models_cache') || '[]');
let ACTIVE_MODEL      = localStorage.getItem('sofia_active_model') || '';

let chatHistory   = [];
let leadSent      = false;
let currentLead   = { name: null, phone: null, procedure: null, time: null };
let leadsLog      = JSON.parse(localStorage.getItem('sofia_leads_log') || '[]');

// ─────────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────────
const SYSTEM_PROMPT = `Você é a Sofia, a assistente virtual premium da Clínica Prime (Estética Avançada & Odontologia).

Sua missão principal é qualificar leads de forma natural, acolhedora e persuasiva.

**Dados que você DEVE coletar (um de cada vez, de forma fluida):**
1. Nome completo do paciente
2. Procedimento de interesse (ex: Botox, Harmonização Facial, Lentes de Contato Dental, Limpeza, Preenchimento, Bichectomia)
3. Número de WhatsApp com DDD (apenas os dígitos são suficientes)
4. Disponibilidade de horário: Peça para o paciente escolher o **dia e o horário exato** (ex: "temos vaga amanhã às 14h ou sexta às 10h").

**Regras de Ouro:**
- Nunca faça mais de uma pergunta por vez. Pareça humana, não um formulário.
- Use linguagem premium, calorosa, empática e sofisticada.
- Use emojis com moderação e elegância (1 a 2 por mensagem).
- Respostas curtas e diretas: máximo 2 a 3 linhas.
- Se o paciente perguntar sobre preços, diga que a equipe médica fará uma avaliação personalizada e gratuita.
- Se fugir do tema clínica, redirecione com gentileza.
- Ao final da coleta, confirme os dados e diga que a equipe entrará em contato em até 2 horas.
- Nunca invente informações médicas. Para dúvidas clínicas, sugira consulta presencial.`;

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────
const sleep   = ms => new Promise(r => setTimeout(r, ms));
const now     = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const todayStr= () => new Date().toLocaleDateString('pt-BR');

// ─────────────────────────────────────────────
// AUTO-DESCOBERTA DE MODELOS (CORAÇÃO DO SISTEMA)
// Consulta a própria API para saber quais modelos
// estão disponíveis para a chave do usuário.
// Depois testa qual responde mais rápido e usa esse.
// ─────────────────────────────────────────────
async function discoverAndSelectBestModel() {
    if (!API_KEY) return;

    agentStatusText.textContent = 'Detectando melhor modelo...';
    modelBadge.textContent = '⏳ detectando...';

    try {
        // 1. Buscar lista completa de modelos disponíveis para esta API key
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}&pageSize=100`
        );

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // 2. Filtrar apenas modelos que suportam generateContent e são Flash/Pro (não embeddings, etc.)
        const PREFERRED_KEYWORDS = ['flash', 'pro', 'lite'];
        const BLOCKED_KEYWORDS   = ['embedding', 'vision', 'aqa', 'text-', 'chat-'];

        const candidates = (data.models || [])
            .filter(m => {
                const name  = m.name.toLowerCase();
                const methods = m.supportedGenerationMethods || [];
                return methods.includes('generateContent')
                    && PREFERRED_KEYWORDS.some(k => name.includes(k))
                    && !BLOCKED_KEYWORDS.some(k => name.includes(k));
            })
            .map(m => ({
                id:          m.name.replace('models/', ''),
                displayName: m.displayName || m.name.replace('models/', ''),
                inputLimit:  m.inputTokenLimit || 0,
            }))
            // Sort: prefer models with higher token limits (usually more capable + stable)
            .sort((a, b) => b.inputLimit - a.inputLimit);

        AVAILABLE_MODELS = candidates;
        localStorage.setItem('sofia_models_cache', JSON.stringify(candidates));

        console.log(`[Sofia] ${candidates.length} modelos encontrados:`, candidates.map(m => m.id));

        // 3. Se o usuário escolheu um modelo específico (não 'auto'), usa ele
        if (MODEL_NAME !== 'auto' && MODEL_NAME) {
            ACTIVE_MODEL = MODEL_NAME;
            updateModelBadge(ACTIVE_MODEL);
            updateModelSelects();
            agentStatusText.textContent = 'Assistente Virtual • Online';
            return;
        }

        // 4. Modo AUTO: testar modelos em paralelo com uma chamada mínima e usar o primeiro que responder
        await pickFastestModel(candidates.slice(0, 5)); // Testa os 5 primeiros

    } catch (err) {
        console.warn('[Model Discovery]', err);
        // Fallback: usa o modelo salvo ou o mais seguro
        ACTIVE_MODEL = MODEL_NAME !== 'auto' ? MODEL_NAME : 'gemini-1.5-flash';
        updateModelBadge(ACTIVE_MODEL);
        agentStatusText.textContent = 'Assistente Virtual • Online';
    }
}

async function pickFastestModel(candidates) {
    // Envia uma mensagem de ping mínima para cada modelo e usa o primeiro que responder com sucesso
    const testPayload = {
        contents: [{ role: 'user', parts: [{ text: 'Olá' }] }],
        generationConfig: { maxOutputTokens: 5 }
    };

    const races = candidates.map(m =>
        fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m.id}:generateContent?key=${API_KEY}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(testPayload),
            signal:  AbortSignal.timeout(10000)
        })
        .then(r => r.ok ? m.id : Promise.reject(new Error(`${m.id}: ${r.status}`)))
    );

    try {
        // Promise.any: usa o primeiro que RESOLVER (funcionar)
        ACTIVE_MODEL = await Promise.any(races);
        localStorage.setItem('sofia_active_model', ACTIVE_MODEL);
        updateModelBadge(ACTIVE_MODEL);
        updateModelSelects();
        showToast(`Modelo selecionado automaticamente: ${ACTIVE_MODEL}`, '✅', 'success');
    } catch {
        // Todos falharam — tenta o mais conservador
        ACTIVE_MODEL = 'gemini-1.5-flash';
        updateModelBadge(ACTIVE_MODEL);
    }

    agentStatusText.textContent = 'Assistente Virtual • Online';
}

function updateModelBadge(modelId) {
    if (modelBadge) modelBadge.textContent = modelId;
}

function updateModelSelects() {
    // Popula os selects com os modelos reais descobertos via API
    const opts = AVAILABLE_MODELS.map(m =>
        `<option value="${m.id}" ${m.id === ACTIVE_MODEL ? 'selected' : ''}>${m.displayName}</option>`
    ).join('');

    if (opts && modelSelectOnb)   modelSelectOnb.innerHTML   = `<option value="auto">✨ Automático (Recomendado)</option>${opts}`;
    if (opts && modelSelectModal) modelSelectModal.innerHTML = `<option value="auto">✨ Automático</option>${opts}`;
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
function init() {
    if (welcomeTime) welcomeTime.textContent = now();

    if (!API_KEY) {
        onboardingOverlay.style.display = 'flex';
        appShell.classList.add('hidden');
    } else {
        onboardingOverlay.style.display = 'none';
        appShell.classList.remove('hidden');
        applySettings();
        refreshKPIs();
        renderLogs();
        // Descoberta automática de modelos ao iniciar
        discoverAndSelectBestModel();
    }
}

function applySettings() {
    updateModelBadge(ACTIVE_MODEL || MODEL_NAME);
    updateSheetStatus();
    if (apiKeyInputModal)  apiKeyInputModal.value  = API_KEY;
    if (modelSelectModal)  modelSelectModal.value  = MODEL_NAME;
    if (webhookInputModal) webhookInputModal.value = WEBHOOK_URL;
}

function updateSheetStatus() {
    if (WEBHOOK_URL) {
        sheetsDot.className      = 'int-dot active';
        statusSheets.textContent = 'Conectado';
    } else {
        sheetsDot.className      = 'int-dot';
        statusSheets.textContent = 'Pendente';
    }
}

// ─────────────────────────────────────────────
// ONBOARDING
// ─────────────────────────────────────────────
toggleKeyVisBtn.addEventListener('click', () => {
    const inp = apiKeyInput;
    inp.type = inp.type === 'password' ? 'text' : 'password';
    $('eye-icon').innerHTML = inp.type === 'password'
        ? `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`
        : `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`;
});

btnNextStep.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
        showToast('Por favor, insira sua API Key para continuar.', '⚠️', 'warning');
        apiKeyInput.focus();
        return;
    }
    step1.classList.remove('active');
    step2.classList.add('active');
    prog1.classList.remove('active');
    prog2.classList.add('active');
});

async function activateApp() {
    const key     = apiKeyInput.value.trim();
    const model   = modelSelectOnb.value;
    const webhook = webhookInput.value.trim();

    if (!key) {
        showToast('Por favor, insira uma API Key válida.', '❌', 'error');
        return;
    }

    API_KEY     = key;
    MODEL_NAME  = model;
    WEBHOOK_URL = webhook;

    localStorage.setItem('sofia_api_key',     key);
    localStorage.setItem('sofia_model_name',  model);
    localStorage.setItem('sofia_webhook_url', webhook);

    onboardingOverlay.style.display = 'none';
    appShell.classList.remove('hidden');
    applySettings();
    refreshKPIs();
    renderLogs();

    showToast('Sofia ativada! Detectando melhor modelo...', '🚀', 'success');
    await discoverAndSelectBestModel();
}

saveApiKeyBtn.addEventListener('click', activateApp);
btnSkipWebhook.addEventListener('click', () => { webhookInput.value = ''; activateApp(); });

// ─────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────
sidebarToggle.addEventListener('click', () => sidebarEl.classList.toggle('collapsed'));

// ─────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────
function showToast(text, icon = '⚡', type = 'info') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-text">${text}</span>`;
    toastContainer.appendChild(t);
    setTimeout(() => t.remove(), 5000);
}

// ─────────────────────────────────────────────
// KPIs
// ─────────────────────────────────────────────
function refreshKPIs() {
    const today      = todayStr();
    const todayCount = leadsLog.filter(l => l.date === today).length;
    kpiLeadsToday.textContent = todayCount;
    kpiLeadsTotal.textContent = leadsLog.length;

    if (leadSent) {
        kpiConvRate.textContent  = '✅ Qualificado';
        kpiConvRate.style.color  = 'var(--green-400)';
    } else if (chatHistory.length > 0) {
        kpiConvRate.textContent  = '💬 Em Progresso';
        kpiConvRate.style.color  = 'var(--gold-400)';
    } else {
        kpiConvRate.textContent  = '⏳ Aguardando';
        kpiConvRate.style.color  = 'var(--light-500)';
    }
}

// ─────────────────────────────────────────────
// CAPTURE FIELDS
// ─────────────────────────────────────────────
function updateCaptureFields(lead) {
    const set = (el, val) => {
        el.textContent = val || 'Aguardando…';
        el.className   = val ? 'cl-value' : 'cl-value pending';
    };
    set(extractedName,      lead.name);
    set(extractedPhone,     lead.phone);
    set(extractedProcedure, lead.procedure);
    set(extractedTime,      lead.time);

    const filled = Object.values(lead).filter(Boolean).length;
    completionFill.style.width  = (filled / 4 * 100) + '%';
    completionLabel.textContent = `${filled} / 4 campos`;
    refreshKPIs();
}

function resetCaptureFields() {
    currentLead = { name: null, phone: null, procedure: null, time: null };
    updateCaptureFields(currentLead);
}

// ─────────────────────────────────────────────
// LEADS LOG
// ─────────────────────────────────────────────
function addLeadToLog(lead) {
    leadsLog.unshift({ ...lead, timestamp: now(), date: todayStr() });
    if (leadsLog.length > 50) leadsLog.pop();
    localStorage.setItem('sofia_leads_log', JSON.stringify(leadsLog));
    renderLogs();
    refreshKPIs();
}

let currentLogPage = 1;
const LOGS_PER_PAGE = 3;
let logSearchQuery = "";

window.prevLogPage = () => { currentLogPage--; renderLogs(); };
window.nextLogPage = () => { currentLogPage++; renderLogs(); };
window.searchLogs = (q) => { logSearchQuery = q; currentLogPage = 1; renderLogs(); };

function renderLogs() {
    const logsList = document.getElementById('logs-list');
    if (!logsList) return;

    let filtered = leadsLog;
    if (logSearchQuery) {
        const q = logSearchQuery.toLowerCase();
        filtered = leadsLog.filter(l => 
            (l.name && l.name.toLowerCase().includes(q)) || 
            (l.procedure && l.procedure.toLowerCase().includes(q)) ||
            (l.phone && l.phone.includes(q))
        );
    }

    if (!filtered.length) {
        logsList.innerHTML = '<p class="no-logs">Nenhum lead encontrado.</p>';
        return;
    }

    const totalPages = Math.ceil(filtered.length / LOGS_PER_PAGE);
    if (currentLogPage > totalPages) currentLogPage = totalPages;
    if (currentLogPage < 1) currentLogPage = 1;

    const start = (currentLogPage - 1) * LOGS_PER_PAGE;
    const currentLogs = filtered.slice(start, start + LOGS_PER_PAGE);

    const html = currentLogs.map(l => `
        <div class="log-entry">
            <span class="log-time-badge">${l.date} ${l.timestamp}</span>
            <div class="log-name">👤 ${l.name || '—'}</div>
            <div class="log-proc">💉 ${l.procedure || '—'}</div>
            <div class="log-meta">📱 ${l.phone || '—'} · 📅 ${l.time || '—'}</div>
        </div>
    `).join('');

    const pagination = `
        <div class="log-pagination">
            <button onclick="prevLogPage()" ${currentLogPage === 1 ? 'disabled' : ''}>◀</button>
            <span>${currentLogPage} / ${totalPages}</span>
            <button onclick="nextLogPage()" ${currentLogPage === totalPages ? 'disabled' : ''}>▶</button>
        </div>
    `;

    logsList.innerHTML = html + pagination;
}

// ─────────────────────────────────────────────
// WEBHOOK
// ─────────────────────────────────────────────
async function sendLeadToWebhook(lead) {
    addLeadToLog(lead);
    if (!WEBHOOK_URL) {
        showToast('Lead qualificado! Configure o Google Sheets para salvar automaticamente.', '⚠️', 'warning');
        return;
    }
    try {
        showToast('Sincronizando com Google Sheets…', '☁️', 'info');
        await fetch(WEBHOOK_URL, {
            method: 'POST', 
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(lead)
        });
        showToast('Lead salvo no Google Sheets!', '✅', 'success');
    } catch (err) {
        console.error('[Webhook]', err);
        showToast('Erro ao sincronizar com Google Sheets.', '❌', 'error');
    }
}

// ─────────────────────────────────────────────
// EXTRAÇÃO DE LEAD EM BACKGROUND
// ─────────────────────────────────────────────
async function extractLeadBackground() {
    if (leadSent || chatHistory.length < 4 || !ACTIVE_MODEL) return;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${ACTIVE_MODEL}:generateContent?key=${API_KEY}`;
    const todayStr = new Date().toLocaleString('pt-BR');
    const prompt = `Analise o histórico da conversa e extraia APENAS os dados informados pelo paciente.
Retorne um objeto JSON válido:
{ "name": "string|null", "phone": "digits only|null", "procedure": "string|null", "time": "YYYY-MM-DD HH:mm|null" }
Para o campo 'time', converta o dia e horário falado pelo usuário para o formato exato YYYY-MM-DD HH:mm.
Considere que a data e hora atual do sistema é: ${todayStr}. Ex: se o usuário disser 'amanhã às 14h', calcule a data de amanhã e retorne 'YYYY-MM-DD 14:00'.
Não invente. Campos não informados = null.`;

    try {
        const res  = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: chatHistory,
                systemInstruction: { parts: [{ text: prompt }] },
                generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 200 }
            }),
            signal: AbortSignal.timeout(15000)
        });
        if (!res.ok) return;

        const data  = await res.json();
        const text  = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) return;

        const lead  = JSON.parse(text);
        currentLead = lead;
        updateCaptureFields(lead);

        if (lead.name && lead.phone && lead.procedure && lead.time) {
            leadSent = true;
            sendLeadToWebhook(lead);
            showToast(`🎯 Lead completo: ${lead.name} — ${lead.procedure}`, '🎯', 'success');
        }
    } catch (err) {
        console.warn('[Extraction]', err);
    }
}

// ─────────────────────────────────────────────
// CHAMADA GEMINI — COM FALLBACK INTELIGENTE
// Usa o modelo ativo de
async function callGemini(userText) {
    if (!ACTIVE_MODEL) {
        showToast('Nenhum modelo disponível no momento.', '❌', 'error');
        return 'Desculpe, meus sistemas estão offline no momento.';
    }

    chatHistory.push({ role: 'user', parts: [{ text: userText }] });

    // Injeta a data atual para a IA nunca se perder no tempo
    const dynamicSystemPrompt = SYSTEM_PROMPT + `\n\n[INFORMAÇÃO DO SISTEMA]: Hoje é dia ${new Date().toLocaleString('pt-BR')}. Use isso como base para qualquer cálculo de datas (amanhã, próxima segunda, etc).`;

    const payload = {
        contents: chatHistory,
        systemInstruction: { parts: [{ text: dynamicSystemPrompt }] },
        generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 250
        }
    };

    const modelQueue = [
        ACTIVE_MODEL,
        ...AVAILABLE_MODELS.map(m => m.id).filter(id => id !== ACTIVE_MODEL)
    ].filter(Boolean);

    // Se não temos modelos descobertos ainda, usa a lista de segurança
    if (!modelQueue.length) {
        modelQueue.push('gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-8b');
    }

    for (const model of modelQueue) {
        try {
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`,
                {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify(payload),
                    signal:  AbortSignal.timeout(15000)
                }
            );

            // Modelo sobrecarregado → tenta o próximo silenciosamente
            if (res.status === 429 || res.status === 503) {
                console.warn(`[Sofia] ${model} sobrecarregado (${res.status}), tentando próximo...`);
                continue;
            }

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.error?.message || `HTTP ${res.status}`);
            }

            const data   = await res.json();
            const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!aiText) throw new Error('Resposta vazia.');

            chatHistory.push({ role: 'model', parts: [{ text: aiText }] });

            // Atualiza badge se modelo mudou por fallback silenciosamente
            if (model !== ACTIVE_MODEL) {
                ACTIVE_MODEL = model;
                localStorage.setItem('sofia_active_model', model);
                updateModelBadge(model);
            }

            // Dispara extração de lead quando há dados suficientes
            const hist     = chatHistory.map(h => h.parts[0].text).join(' ');
            const hasPhone = /\d{9,11}/.test(hist.replace(/\D/g, ''));
            const hasTime  = /(manh[ãa]|tarde|turno|horário|horario|dia|às|as|segunda|terça|quarta|quinta|sexta|sábado|sabado|hoje|amanhã|amanha)/i.test(hist);
            if (hasPhone || hasTime || chatHistory.length >= 8) {
                extractLeadBackground();
            }

            return aiText;

        } catch (err) {
            console.error(`[Gemini:${model}]`, err.message);

            if (err.message?.includes('API key not valid') || err.message?.includes('API_KEY_INVALID')) {
                chatHistory.pop();
                return '❌ **Chave de API inválida.** Por favor, atualize nas ⚙️ Configurações.';
            }

            if (err.name === 'TimeoutError' || err.name === 'AbortError') {
                console.warn(`[Sofia] ${model} demorou muito, tentando próximo...`);
                continue;
            }
            // Qualquer outro erro → tenta próximo modelo silenciosamente
        }
    }

    // Todos os modelos falharam
    chatHistory.pop();
    // Apenas aqui avisamos o usuário que todos falharam
    console.warn('Todos os modelos indisponíveis.');

    // Tenta nova descoberta em background para a próxima mensagem
    setTimeout(() => discoverAndSelectBestModel(), 2000);

    return '⚠️ A Sofia está sobrecarregada agora. Aguarde **30 segundos** e envie sua mensagem novamente. Os servidores do Google estão com alta demanda no momento.';
}

// ─────────────────────────────────────────────
// CHAT — MENSAGENS
// ─────────────────────────────────────────────
function addMessage(text, isUser) {
    const group  = document.createElement('div');
    group.className = `message-group ${isUser ? 'user-group' : 'ai-group'}`;

    const avatarSrc = isUser
        ? `https://ui-avatars.com/api/?name=P&background=3A4470&color=fff&rounded=true&bold=true&size=32`
        : `https://ui-avatars.com/api/?name=S&background=C9A84C&color=fff&rounded=true&bold=true&size=32`;

    const content = isUser ? escapeHtml(text) : marked.parse(text);

    group.innerHTML = `
        <div class="msg-avatar"><img src="${avatarSrc}" alt="${isUser ? 'Você' : 'Sofia'}"></div>
        <div class="msg-bubble-wrap">
            <div class="msg-bubble ${isUser ? 'user-bubble' : 'ai-bubble'}">${content}</div>
            <span class="msg-time">${now()}</span>
        </div>`;

    chatMessages.appendChild(group);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (isUser) {
        const qr = $('quick-replies');
        if (qr) qr.style.display = 'none';
    }
}

function escapeHtml(t) {
    return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─────────────────────────────────────────────
// ENVIAR MENSAGEM
// ─────────────────────────────────────────────
async function handleSend() {
    const text = userInput.value.trim();
    if (!text || !API_KEY) {
        if (!API_KEY) showToast('Configure sua API Key primeiro.', '⚠️', 'warning');
        return;
    }

    addMessage(text, true);
    userInput.value = '';
    autoResize();
    sendButton.disabled = true;
    typingIndicator.classList.remove('hidden');
    agentStatusText.textContent = 'Sofia está digitando…';
    chatMessages.scrollTop = chatMessages.scrollHeight;

    const reply = await callGemini(text);

    typingIndicator.classList.add('hidden');
    agentStatusText.textContent = 'Assistente Virtual • Online';
    addMessage(reply, false);
    sendButton.disabled = false;
    userInput.focus();
}

window.sendQuickReply = t => { userInput.value = t; handleSend(); };

// ─────────────────────────────────────────────
// TEXTAREA AUTO-RESIZE
// ─────────────────────────────────────────────
function autoResize() {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
}

userInput.addEventListener('input', autoResize);
userInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
});
sendButton.addEventListener('click', handleSend);

// ─────────────────────────────────────────────
// CONFIG MODAL
// ─────────────────────────────────────────────
openConfigBtn.addEventListener('click', () => {
    if (apiKeyInputModal)  apiKeyInputModal.value  = API_KEY;
    if (modelSelectModal)  modelSelectModal.value  = MODEL_NAME;
    if (webhookInputModal) webhookInputModal.value = WEBHOOK_URL;
    configModal.classList.remove('hidden');
});

closeConfigBtn.addEventListener('click', () => configModal.classList.add('hidden'));
configModal.addEventListener('click', e => { if (e.target === configModal) configModal.classList.add('hidden'); });

saveConfigModal.addEventListener('click', async () => {
    const key     = apiKeyInputModal.value.trim();
    const model   = modelSelectModal.value;
    const webhook = webhookInputModal.value.trim();

    if (!key) { showToast('API Key não pode ser vazia.', '❌', 'error'); return; }

    API_KEY     = key;
    MODEL_NAME  = model;
    WEBHOOK_URL = webhook;

    // Se escolheu AUTO ou mudou a key, redescobre modelos
    const needsRediscovery = model === 'auto' || key !== localStorage.getItem('sofia_api_key');

    localStorage.setItem('sofia_api_key',     key);
    localStorage.setItem('sofia_model_name',  model);
    localStorage.setItem('sofia_webhook_url', webhook);

    applySettings();
    configModal.classList.add('hidden');
    showToast('Configurações salvas!', '✅', 'success');

    if (needsRediscovery) {
        ACTIVE_MODEL = '';
        await discoverAndSelectBestModel();
    } else {
        ACTIVE_MODEL = model;
        updateModelBadge(model);
    }
});

// ─────────────────────────────────────────────
// NOVO ATENDIMENTO
// ─────────────────────────────────────────────
function startNewChat() {
    chatHistory = [];
    leadSent    = false;
    resetCaptureFields();
    refreshKPIs();

    chatMessages.innerHTML = `
        <div class="message-group ai-group">
            <div class="msg-avatar"><img src="https://ui-avatars.com/api/?name=S&background=C9A84C&color=fff&rounded=true&bold=true&size=32" alt="Sofia"></div>
            <div class="msg-bubble-wrap">
                <div class="msg-bubble ai-bubble">
                    Olá! 👋 Sou a <strong>Sofia</strong>, assistente virtual da <strong>Clínica Prime</strong>.<br><br>
                    Estou aqui para ajudá-lo a agendar procedimentos estéticos ou odontológicos com toda a conveniência que você merece. ✨<br><br>
                    Com qual tratamento posso te ajudar hoje?
                </div>
                <span class="msg-time">${now()}</span>
            </div>
        </div>`;

    const qr = $('quick-replies');
    if (qr) qr.style.display = 'flex';
    userInput.focus();
}

newChatBtn.addEventListener('click', startNewChat);
clearChatBtn.addEventListener('click', startNewChat);

// ─────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────
init();

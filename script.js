const categories = ['Ingenieria', 'Medicina', 'Artes', 'Ciencias Sociales', 'Derecho'];

const catalog = [
  { titulo: 'Calculo de Stewart', autor: 'James Stewart', estado: 'Disponible', formato: 'PDF/ePub' },
  { titulo: 'Anatomia de Gray', autor: 'Henry Gray', estado: 'Prestado', formato: 'ePub' },
  { titulo: 'Derecho Civil I', autor: 'L. Diez-Picazo', estado: 'Disponible', formato: 'PDF' },
  { titulo: 'IA Moderna', autor: 'Stuart Russell', estado: 'Disponible', formato: 'Web/Interactive' },
  { titulo: 'Don Quijote', autor: 'Cervantes', estado: 'Disponible', formato: 'PDF' }
];

const emptyDocumentContext = {
  title: 'Ningun documento cargado',
  fileUrl: '',
  pages: 0,
  topic: 'Esperando PDF',
  summary: 'Sube un archivo PDF para activar la vista previa y el chat contextual.',
  highlights: [
    'La lectura del documento empezara solo cuando subas un PDF.',
    'Hasta entonces no se enviara ningun texto a la IA.'
  ],
  sourceLabel: 'Sin PDF',
  uploadStatus: 'Sube un archivo PDF para activar el visor y el analisis del documento.'
};

const MAX_CONTEXT_TEXT = 12000;

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

let activeDocumentUrl = null;
let documentContext = createDocumentContext(emptyDocumentContext);
const pdfViewerState = {
  pdfDoc: null,
  currentPage: 1,
  totalPages: 0,
  loadRequestId: 0
};
let pdfResizeTimeout = null;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function normalizeWhitespace(text = '') {
  return text.replace(/\u0000/g, ' ').replace(/\s+/g, ' ').trim();
}

function clampText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function shortenText(text, maxLength) {
  return clampText(normalizeWhitespace(text), maxLength);
}

function buildSummaryFromText(text) {
  const clean = normalizeWhitespace(text);
  if (!clean) {
    return 'No hay un resumen disponible para este PDF.';
  }

  return shortenText(clean, 220);
}

function buildHighlightsFromText(text) {
  const clean = text.replace(/\r/g, '\n');
  const candidates = [
    ...clean.split(/\n+/),
    ...clean.split(/(?<=[.!?])\s+/)
  ];
  const highlights = [];
  const seen = new Set();

  candidates.forEach((candidate) => {
    const value = shortenText(candidate, 180);
    const key = value.toLowerCase();

    if (value.length < 35 || seen.has(key) || highlights.length >= 5) {
      return;
    }

    seen.add(key);
    highlights.push(value);
  });

  return highlights;
}

function formatPageLabel(totalPages) {
  return `${totalPages} ${totalPages === 1 ? 'pagina' : 'paginas'}`;
}

function humanizeFileName(fileName) {
  return fileName.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim();
}

function createDocumentContext(source = {}) {
  const fallbackText = [
    source.title || '',
    source.summary || '',
    ...(source.highlights || [])
  ].join(' ');
  const extractedText = clampText(
    normalizeWhitespace(source.extractedText || fallbackText),
    MAX_CONTEXT_TEXT
  );
  const highlights = source.highlights?.length
    ? source.highlights.map((item) => shortenText(item, 180))
    : buildHighlightsFromText(extractedText);

  return {
    title: source.title || 'Documento sin titulo',
    fileUrl: source.fileUrl || '',
    pages: Number.isFinite(source.pages) ? source.pages : 0,
    topic: source.topic || 'Documento PDF',
    summary: source.summary || buildSummaryFromText(extractedText),
    highlights: highlights.length
      ? highlights
      : ['No se detectaron fragmentos de texto destacados en este documento.'],
    extractedText,
    sourceLabel: source.sourceLabel || 'PDF cargado',
    uploadStatus: source.uploadStatus || 'PDF listo para consulta.'
  };
}

function hasActiveDocument() {
  return Boolean(documentContext.fileUrl);
}

function setActiveDocumentUrl(url, isObjectUrl = false) {
  if (activeDocumentUrl && activeDocumentUrl !== url) {
    URL.revokeObjectURL(activeDocumentUrl);
  }

  activeDocumentUrl = isObjectUrl ? url : null;
}

function updateDocumentContext(source, options = {}) {
  documentContext = createDocumentContext(source);
  setActiveDocumentUrl(documentContext.fileUrl, options.isObjectUrl);
  renderDocumentContext();
}

function setPdfViewerMessage(message, isError = false) {
  const loadingState = document.getElementById('pdfLoadingState');
  const errorState = document.getElementById('pdfErrorState');
  const canvas = document.getElementById('pdfCanvas');

  loadingState.textContent = message;
  loadingState.classList.toggle('hidden', isError);
  errorState.classList.toggle('hidden', !isError);
  canvas.classList.toggle('hidden', true);
}

function setChatAvailability(enabled) {
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');

  chatInput.disabled = !enabled;
  sendBtn.disabled = !enabled;
  chatInput.placeholder = enabled
    ? 'Ej: Que dice el PDF sobre prestamos temporales?'
    : 'Sube un PDF para habilitar el chat';
}

function updatePdfControls() {
  const hasDocument = Boolean(pdfViewerState.pdfDoc);
  const pageIndicator = document.getElementById('pdfPageIndicator');
  const prevPageBtn = document.getElementById('prevPageBtn');
  const nextPageBtn = document.getElementById('nextPageBtn');

  pageIndicator.textContent = hasDocument
    ? `Pagina ${pdfViewerState.currentPage} de ${pdfViewerState.totalPages}`
    : 'Sin vista previa';
  prevPageBtn.disabled = !hasDocument || pdfViewerState.currentPage <= 1;
  nextPageBtn.disabled = !hasDocument || pdfViewerState.currentPage >= pdfViewerState.totalPages;
}

async function renderPdfPage(pageNumber, requestId = pdfViewerState.loadRequestId) {
  if (!pdfViewerState.pdfDoc) {
    return;
  }

  const canvas = document.getElementById('pdfCanvas');
  const loadingState = document.getElementById('pdfLoadingState');
  const errorState = document.getElementById('pdfErrorState');
  const canvasWrap = document.getElementById('pdfCanvasWrap');
  const page = await pdfViewerState.pdfDoc.getPage(pageNumber);

  if (requestId !== pdfViewerState.loadRequestId) {
    return;
  }

  const baseViewport = page.getViewport({ scale: 1 });
  const availableWidth = Math.max(canvasWrap.clientWidth - 32, 260);
  const scale = Math.min(Math.max(availableWidth / baseViewport.width, 0.6), 1.8);
  const viewport = page.getViewport({ scale });
  const pixelRatio = window.devicePixelRatio || 1;
  const context = canvas.getContext('2d');

  canvas.width = Math.floor(viewport.width * pixelRatio);
  canvas.height = Math.floor(viewport.height * pixelRatio);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);

  loadingState.classList.remove('hidden');
  loadingState.textContent = `Renderizando pagina ${pageNumber}...`;
  errorState.classList.add('hidden');
  canvas.classList.add('hidden');

  await page.render({
    canvasContext: context,
    viewport
  }).promise;

  if (requestId !== pdfViewerState.loadRequestId) {
    return;
  }

  pdfViewerState.currentPage = pageNumber;
  updatePdfControls();
  loadingState.classList.add('hidden');
  canvas.classList.remove('hidden');
}

async function loadPdfPreview(source) {
  if (!window.pdfjsLib) {
    setPdfViewerMessage('No se pudo cargar el visor PDF.', true);
    updatePdfControls();
    return;
  }

  const requestId = pdfViewerState.loadRequestId + 1;
  pdfViewerState.loadRequestId = requestId;
  pdfViewerState.pdfDoc = null;
  pdfViewerState.currentPage = 1;
  pdfViewerState.totalPages = 0;
  updatePdfControls();
  setPdfViewerMessage('Cargando vista previa del PDF...');

  try {
    const loadingTask = window.pdfjsLib.getDocument(source);
    const pdfDoc = await loadingTask.promise;

    if (requestId !== pdfViewerState.loadRequestId) {
      return;
    }

    pdfViewerState.pdfDoc = pdfDoc;
    pdfViewerState.totalPages = pdfDoc.numPages;
    pdfViewerState.currentPage = 1;
    updatePdfControls();
    await renderPdfPage(1, requestId);
  } catch (error) {
    if (requestId !== pdfViewerState.loadRequestId) {
      return;
    }

    pdfViewerState.pdfDoc = null;
    pdfViewerState.totalPages = 0;
    pdfViewerState.currentPage = 1;
    updatePdfControls();
    setPdfViewerMessage('No se pudo generar la vista previa del PDF.', true);
  }
}

function changePdfPage(step) {
  if (!pdfViewerState.pdfDoc) {
    return;
  }

  const nextPage = pdfViewerState.currentPage + step;
  if (nextPage < 1 || nextPage > pdfViewerState.totalPages) {
    return;
  }

  renderPdfPage(nextPage);
}

function initPdfViewerControls() {
  document.getElementById('prevPageBtn').addEventListener('click', () => {
    changePdfPage(-1);
  });

  document.getElementById('nextPageBtn').addEventListener('click', () => {
    changePdfPage(1);
  });

  window.addEventListener('resize', () => {
    if (!pdfViewerState.pdfDoc) {
      return;
    }

    window.clearTimeout(pdfResizeTimeout);
    pdfResizeTimeout = window.setTimeout(() => {
      renderPdfPage(pdfViewerState.currentPage);
    }, 150);
  });
}

function getLiveData() {
  return categories.map((cat) => ({
    categoria: cat,
    prestamos: randomInt(50, 500),
    descargas: randomInt(100, 1000),
    usuarios: randomInt(10, 150)
  }));
}

let liveData = getLiveData();

function updateClock() {
  const now = new Date();
  document.getElementById('last-update').textContent = now.toLocaleTimeString();
}

function updateKPIs() {
  const totalUsers = liveData.reduce((acc, row) => acc + row.usuarios, 0);
  const totalDownloads = liveData.reduce((acc, row) => acc + row.descargas, 0);

  document.getElementById('kpi-users').textContent = totalUsers;
  document.getElementById('kpi-users-change').textContent = `${randomInt(-5, 10)}%`;
  document.getElementById('kpi-downloads').textContent = totalDownloads;
  document.getElementById('kpi-server').textContent = `${randomInt(20, 45)}%`;
}

function renderCharts() {
  const barTrace = {
    x: liveData.map((d) => d.categoria),
    y: liveData.map((d) => d.prestamos),
    type: 'bar',
    marker: { color: '#2563eb' }
  };

  const barLayout = {
    title: 'Prestamos por facultad (tiempo real)',
    margin: { t: 50, l: 40, r: 20, b: 50 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)'
  };

  Plotly.newPlot('barChart', [barTrace], barLayout, { responsive: true });

  const pieTrace = {
    labels: liveData.map((d) => d.categoria),
    values: liveData.map((d) => d.descargas),
    type: 'pie',
    hole: 0.45
  };

  const pieLayout = {
    title: 'Distribucion de descargas digitales',
    margin: { t: 50, l: 20, r: 20, b: 20 },
    paper_bgcolor: 'rgba(0,0,0,0)'
  };

  Plotly.newPlot('pieChart', [pieTrace], pieLayout, { responsive: true });
}

function renderCatalog(filter = '') {
  const tbody = document.querySelector('#catalogTable tbody');
  tbody.innerHTML = '';

  const filtered = catalog.filter((item) => {
    const text = `${item.titulo} ${item.autor}`.toLowerCase();
    return text.includes(filter.toLowerCase());
  });

  filtered.forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.titulo}</td>
      <td>${item.autor}</td>
      <td>${item.estado}</td>
      <td>${item.formato}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderDocumentContext() {
  document.getElementById('doc-title').textContent = documentContext.title;
  document.getElementById('doc-description').textContent = documentContext.summary;
  document.getElementById('doc-pages').textContent = formatPageLabel(documentContext.pages);
  document.getElementById('doc-topic').textContent = documentContext.topic;
  const docLink = document.getElementById('docLink');
  const fallbackLink = document.getElementById('pdfFallbackLink');

  docLink.href = documentContext.fileUrl || '#';
  fallbackLink.href = documentContext.fileUrl || '#';
  docLink.classList.toggle('is-disabled', !hasActiveDocument());
  docLink.setAttribute('aria-disabled', String(!hasActiveDocument()));
  document.getElementById('contextBadge').textContent = documentContext.sourceLabel;
  document.getElementById('uploadStatus').textContent = documentContext.uploadStatus;

  const highlights = document.getElementById('documentHighlights');
  highlights.innerHTML = '';

  documentContext.highlights.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'highlight-item';
    div.textContent = item;
    highlights.appendChild(div);
  });

  setChatAvailability(hasActiveDocument());

  if (hasActiveDocument()) {
    loadPdfPreview(documentContext.fileUrl);
    return;
  }

  pdfViewerState.loadRequestId += 1;
  pdfViewerState.pdfDoc = null;
  pdfViewerState.currentPage = 1;
  pdfViewerState.totalPages = 0;
  updatePdfControls();
  setPdfViewerMessage('Sube un PDF para ver la vista previa.');
}

async function extractPdfData(file) {
  if (!window.pdfjsLib) {
    throw new Error('No se pudo cargar el lector de PDF.');
  }

  const buffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pageTexts = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str).join(' ');
    pageTexts.push(pageText);
  }

  const extractedText = normalizeWhitespace(pageTexts.join('\n'));

  if (!extractedText) {
    return {
      pages: pdf.numPages,
      extractedText: '',
      summary: 'El PDF se cargo, pero no contiene texto seleccionable para analizar.',
      highlights: ['El archivo puede ser un escaneo o un PDF protegido sin texto extraible.']
    };
  }

  return {
    pages: pdf.numPages,
    extractedText,
    summary: buildSummaryFromText(extractedText),
    highlights: buildHighlightsFromText(pageTexts.join('\n'))
  };
}

function switchTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  const contents = document.querySelectorAll('.tab-content');

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((button) => button.classList.remove('active'));
      contents.forEach((content) => content.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

function addMessage(text, sender) {
  const chatBox = document.getElementById('chatBox');
  const div = document.createElement('div');
  div.className = `msg ${sender}`;
  div.textContent = text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
  return div;
}

function buildAIContext() {
  if (!hasActiveDocument()) {
    return null;
  }

  return {
    liveMetrics: liveData,
    catalogSnapshot: catalog,
    document: {
      title: documentContext.title,
      summary: documentContext.summary,
      topic: documentContext.topic,
      pages: documentContext.pages,
      highlights: documentContext.highlights,
      extractedText: documentContext.extractedText || 'No se pudo extraer texto del PDF actual.'
    }
  };
}

async function askAI(question) {
  if (!hasActiveDocument()) {
    throw new Error('Primero sube un PDF para activar el analisis del documento.');
  }

  let res;

  try {
    res = await fetch('/api/ask-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: question,
        contextData: buildAIContext()
      })
    });
  } catch (error) {
    throw new Error(
      'No se pudo conectar con la funcion de IA. Ejecuta el proyecto con Netlify o revisa tu despliegue.'
    );
  }

  const rawBody = await res.text();
  let data = {};

  if (rawBody) {
    try {
      data = JSON.parse(rawBody);
    } catch (error) {
      data = { rawBody };
    }
  }

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        'La funcion de IA no existe en esta URL. Inicia el proyecto con `netlify dev` o despliegalo en Netlify.'
      );
    }

    throw new Error(
      data.error ||
      data.rawBody ||
      `La funcion de IA fallo con estado HTTP ${res.status}.`
    );
  }

  if (!data.reply) {
    throw new Error('La funcion de IA respondio sin contenido util.');
  }

  return data.reply;
}

function initChat() {
  const sendBtn = document.getElementById('sendBtn');
  const chatInput = document.getElementById('chatInput');

  addMessage(
    'No hay ningun PDF activo. Sube un archivo para habilitar la lectura y las consultas con IA.',
    'assistant'
  );

  async function handleSend() {
    const text = chatInput.value.trim();
    if (!text || sendBtn.disabled) return;

    addMessage(text, 'user');
    chatInput.value = '';
    sendBtn.disabled = true;

    const loadingMsg = addMessage('Consultando el PDF activo y las metricas del dashboard...', 'assistant');

    try {
      const reply = await askAI(text);
      loadingMsg.textContent = reply;
    } catch (error) {
      loadingMsg.textContent = `Error de IA: ${error.message}`;
    } finally {
      sendBtn.disabled = false;
      chatInput.focus();
    }
  }

  sendBtn.addEventListener('click', handleSend);
  chatInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      handleSend();
    }
  });
}

function initPdfUpload() {
  const pdfUpload = document.getElementById('pdfUpload');

  pdfUpload.addEventListener('change', async (event) => {
    const [file] = event.target.files || [];

    if (!file) {
      return;
    }

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      document.getElementById('uploadStatus').textContent = 'Selecciona un archivo PDF valido.';
      event.target.value = '';
      return;
    }

    pdfUpload.disabled = true;
    document.getElementById('uploadStatus').textContent = `Procesando ${file.name}...`;

    try {
      const pdfData = await extractPdfData(file);
      const fileUrl = URL.createObjectURL(file);

      updateDocumentContext(
        {
          title: humanizeFileName(file.name),
          fileUrl,
          pages: pdfData.pages,
          topic: 'PDF cargado por el usuario',
          summary: pdfData.summary,
          highlights: pdfData.highlights,
          extractedText: pdfData.extractedText,
          sourceLabel: 'PDF cargado',
          uploadStatus: `Archivo listo: ${file.name}. Gemini respondera con este PDF como contexto.`
        },
        { isObjectUrl: true }
      );

      addMessage(`PDF cargado: ${file.name}. Ya puedes consultarme sobre este documento.`, 'assistant');
    } catch (error) {
      document.getElementById('uploadStatus').textContent =
        `No se pudo procesar el PDF: ${error.message}`;
      addMessage(`No pude leer el PDF seleccionado: ${error.message}`, 'assistant');
    } finally {
      pdfUpload.disabled = false;
      event.target.value = '';
    }
  });
}

function refreshData() {
  liveData = getLiveData();
  updateClock();
  updateKPIs();
  renderCharts();
}

document.addEventListener('DOMContentLoaded', () => {
  switchTabs();
  initPdfViewerControls();
  renderCatalog();
  renderDocumentContext();
  updateClock();
  updateKPIs();
  renderCharts();
  initChat();
  initPdfUpload();

  document.getElementById('searchInput').addEventListener('input', (event) => {
    renderCatalog(event.target.value);
  });

  setInterval(refreshData, 30000);
});

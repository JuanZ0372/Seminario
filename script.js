const categories = ['Ingenieria', 'Medicina', 'Artes', 'Ciencias Sociales', 'Derecho'];

const catalog = [
  { titulo: 'Calculo de Stewart', autor: 'James Stewart', estado: 'Disponible', formato: 'PDF/ePub' },
  { titulo: 'Anatomia de Gray', autor: 'Henry Gray', estado: 'Prestado', formato: 'ePub' },
  { titulo: 'Derecho Civil I', autor: 'L. Diez-Picazo', estado: 'Disponible', formato: 'PDF' },
  { titulo: 'IA Moderna', autor: 'Stuart Russell', estado: 'Disponible', formato: 'Web/Interactive' },
  { titulo: 'Don Quijote', autor: 'Cervantes', estado: 'Disponible', formato: 'PDF' }
];

const documentContext = {
  title: 'Guia del Repositorio Digital Universitario',
  fileUrl: 'assets/guia-biblioteca-virtual.pdf',
  pages: 1,
  topic: 'Uso del repositorio y prestamos digitales',
  summary: 'Guia institucional con reglas de acceso, colecciones prioritarias y uso de materiales digitales.',
  highlights: [
    'Acceso disponible 24/7 con credenciales institucionales.',
    'Colecciones clave: Ingenieria, Medicina, Artes, Ciencias Sociales y Derecho.',
    'Los PDF se descargan para estudio personal respetando derechos de autor.',
    'Los prestamos temporales de eBooks duran 7 dias y permiten una renovacion.',
    'El buscador recomienda consultar por titulo, autor o ISBN.',
    'Para estudiantes de primer ingreso se sugieren textos introductorios.',
    'Soporte academico: biblioteca.virtual@universidad.edu.sv.'
  ]
};

documentContext.extractedText = [
  documentContext.title,
  documentContext.summary,
  ...documentContext.highlights
].join(' ');

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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
  document.getElementById('doc-pages').textContent = `${documentContext.pages} pagina`;
  document.getElementById('doc-topic').textContent = documentContext.topic;
  document.getElementById('docLink').href = documentContext.fileUrl;
  document.getElementById('pdfViewer').data = documentContext.fileUrl;

  const highlights = document.getElementById('documentHighlights');
  highlights.innerHTML = '';

  documentContext.highlights.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'highlight-item';
    div.textContent = item;
    highlights.appendChild(div);
  });
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
  return {
    liveMetrics: liveData,
    catalogSnapshot: catalog,
    document: {
      title: documentContext.title,
      summary: documentContext.summary,
      topic: documentContext.topic,
      pages: documentContext.pages,
      highlights: documentContext.highlights,
      extractedText: documentContext.extractedText
    }
  };
}

async function askAI(question) {
  const res = await fetch('/.netlify/functions/ask-ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: question,
      contextData: buildAIContext()
    })
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || 'Error desconocido');
  }

  return data.reply;
}

function initChat() {
  const sendBtn = document.getElementById('sendBtn');
  const chatInput = document.getElementById('chatInput');

  addMessage(
    `Documento cargado: ${documentContext.title}. Puedes preguntar por acceso, colecciones, prestamos digitales o soporte academico.`,
    'assistant'
  );

  async function handleSend() {
    const text = chatInput.value.trim();
    if (!text || sendBtn.disabled) return;

    addMessage(text, 'user');
    chatInput.value = '';
    sendBtn.disabled = true;

    const loadingMsg = addMessage('Consultando la guia y las metricas del dashboard...', 'assistant');

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

function refreshData() {
  liveData = getLiveData();
  updateClock();
  updateKPIs();
  renderCharts();
}

document.addEventListener('DOMContentLoaded', () => {
  switchTabs();
  renderCatalog();
  renderDocumentContext();
  updateClock();
  updateKPIs();
  renderCharts();
  initChat();

  document.getElementById('searchInput').addEventListener('input', (event) => {
    renderCatalog(event.target.value);
  });

  setInterval(refreshData, 30000);
});

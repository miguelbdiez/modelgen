// ============================================================
// public/app.js — Lógica del frontend de ModelGen
// Gestiona el chat, las llamadas a la API del servidor y la
// actualización de las pestañas de resultados.
// Vanilla JavaScript sin frameworks. Requiere JSZip (CDN).
// ============================================================

// ── Estado global del frontend ──────────────────────────────
// Guarda el modelo actual y los últimos artefactos generados
// para que el botón "Descargar todo" tenga acceso a ellos.
const estado = {
  modelo:     null,   // Modelo JSON intermedio actual
  mysql:      '',     // Último SQL generado
  mongodb:    '',     // Último esquema MongoDB
  plantuml:   '',     // Último código PlantUML
  jsonschema: '',     // Último JSON Schema
  java:       ''      // Últimas clases Java
};

// ── Referencias a elementos del DOM ─────────────────────────
const chatMessages   = document.getElementById('chatMessages');
const txtPrompt      = document.getElementById('txtPrompt');
const btnSend        = document.getElementById('btnSend');
const btnReset       = document.getElementById('btnReset');
const btnDownload    = document.getElementById('btnDownload');

// ============================================================
// GESTIÓN DEL CHAT
// ============================================================

/**
 * Envía el mensaje al servidor cuando se pulsa el botón o se presiona Intro.
 * Muestra la animación de "pensando…", llama a /api/prompt
 * y después a /api/generate para actualizar todas las pestañas.
 */
async function enviarMensaje() {
  const texto = txtPrompt.value.trim();
  if (!texto) return;

  // Mostrar mensaje del usuario y limpiar el textarea
  agregarMensajeUsuario(texto);
  txtPrompt.value = '';
  autoResizeTextarea();

  // Mostrar animación de espera
  const msgEspera = mostrarMensajeEspera();
  deshabilitarEntrada(true);

  try {
    // ── Paso 1: Procesar el prompt con la IA ────────────────
    const respuestaPrompt = await llamarAPI('/api/prompt', {
      texto,
      modeloActual: estado.modelo
    });

    // Actualizar el modelo en el estado global
    estado.modelo = respuestaPrompt.modelo;

    // ── Paso 2: Generar todos los artefactos ────────────────
    const artefactos = await llamarAPI('/api/generate', {
      modelo: estado.modelo
    });

    // Guardar artefactos en el estado
    estado.mysql      = artefactos.mysql;
    estado.mongodb    = artefactos.mongodb;
    estado.plantuml   = artefactos.plantuml;
    estado.jsonschema = artefactos.jsonschema;
    estado.java       = artefactos.java;

    // ── Paso 3: Actualizar todas las pestañas ───────────────
    actualizarPestanas();

    // ── Paso 4: Solicitar el diagrama PNG al servidor ───────
    await cargarDiagrama(artefactos.plantuml);

    // ── Mostrar confirmación en el chat ─────────────────────
    eliminarMensaje(msgEspera);
    agregarMensajeAsistente(respuestaPrompt.mensaje);

  } catch (error) {
    eliminarMensaje(msgEspera);
    agregarMensajeError(error.message || 'Error desconocido al procesar el prompt.');
  } finally {
    deshabilitarEntrada(false);
    txtPrompt.focus();
  }
}

// Enviar al hacer click en el botón
btnSend.addEventListener('click', enviarMensaje);

/**
 * Permite enviar con Intro (sin Shift) y hacer salto de línea con Shift+Intro.
 */
txtPrompt.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    enviarMensaje();
  }
});

/**
 * Ajusta automáticamente la altura del textarea al contenido.
 */
txtPrompt.addEventListener('input', autoResizeTextarea);

function autoResizeTextarea() {
  txtPrompt.style.height = 'auto';
  txtPrompt.style.height = Math.min(txtPrompt.scrollHeight, 120) + 'px';
}

// ============================================================
// MENSAJES DEL CHAT
// ============================================================

/**
 * Agrega un mensaje del usuario al historial del chat.
 * @param {string} texto - Texto del mensaje
 */
function agregarMensajeUsuario(texto) {
  const div = crearBurbuja('user', 'TU', `<p>${escaparHTML(texto)}</p>`);
  chatMessages.appendChild(div);
  scrollAlFinal();
}

/**
 * Agrega un mensaje del asistente al historial del chat.
 * @param {string} texto - Texto del mensaje (puede contener <strong>)
 */
function agregarMensajeAsistente(texto) {
  const div = crearBurbuja('assistant', 'MG', `<p>${texto}</p>`);
  chatMessages.appendChild(div);
  scrollAlFinal();
}

/**
 * Agrega un mensaje de error en el chat.
 * @param {string} texto - Descripción del error
 */
function agregarMensajeError(texto) {
  const div = crearBurbuja(
    'assistant',
    '!',
    `<p style="color:#e94560"><strong>Error:</strong> ${escaparHTML(texto)}</p>`
  );
  chatMessages.appendChild(div);
  scrollAlFinal();
}

/**
 * Muestra la animación de "pensando…" mientras la IA procesa.
 * @returns {HTMLElement} Elemento del mensaje de espera (para eliminarlo después)
 */
function mostrarMensajeEspera() {
  const div = crearBurbuja(
    'assistant thinking',
    'MG',
    `<span>Procesando</span>
     <span class="dot-flashing">
       <span></span><span></span><span></span>
     </span>`
  );
  chatMessages.appendChild(div);
  scrollAlFinal();
  return div;
}

/**
 * Elimina un elemento de mensaje del DOM.
 * @param {HTMLElement} elemento - El mensaje a eliminar
 */
function eliminarMensaje(elemento) {
  if (elemento && elemento.parentNode) {
    elemento.parentNode.removeChild(elemento);
  }
}

/**
 * Crea el elemento HTML de una burbuja de chat.
 * @param {string} tipo   - Clase CSS: 'user' o 'assistant'
 * @param {string} avatar - Texto del avatar
 * @param {string} html   - Contenido HTML de la burbuja
 * @returns {HTMLElement} Elemento de mensaje listo para insertar
 */
function crearBurbuja(tipo, avatar, html) {
  const div = document.createElement('div');
  div.className = `message ${tipo}`;
  div.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-bubble">${html}</div>
  `;
  return div;
}

/**
 * Desplaza el historial del chat hasta el mensaje más reciente.
 */
function scrollAlFinal() {
  requestAnimationFrame(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
}

// ============================================================
// ACTUALIZACIÓN DE PESTAÑAS
// ============================================================

/**
 * Actualiza el contenido de todas las pestañas con los artefactos
 * generados a partir del modelo actual.
 */
function actualizarPestanas() {
  // Pestaña Modelo JSON
  document.getElementById('codeModelo').innerHTML =
    resaltarJSON(JSON.stringify(estado.modelo, null, 2));

  // Pestaña MySQL
  document.getElementById('codeMySQL').innerHTML =
    resaltarSQL(estado.mysql);

  // Pestaña MongoDB
  document.getElementById('codeMongoDB').innerHTML =
    resaltarJS(estado.mongodb);

  // Pestaña PlantUML (código fuente)
  document.getElementById('codePlantUML').innerHTML =
    escaparHTML(estado.plantuml);

  // Pestaña JSON Schema
  document.getElementById('codeJSONSchema').innerHTML =
    resaltarJSON(estado.jsonschema);

  // Pestaña Java JPA
  document.getElementById('codeJava').innerHTML =
    resaltarJava(estado.java);
}

/**
 * Solicita al servidor el renderizado del código PlantUML como imagen PNG.
 * @param {string} codigoPlantUML - Código PlantUML a renderizar
 */
async function cargarDiagrama(codigoPlantUML) {
  const contenedor = document.getElementById('diagramaContainer');
  contenedor.innerHTML = '<p class="placeholder-img">Renderizando diagrama…</p>';

  try {
    // Codificar el código PlantUML en base64 (seguro para UTF-8)
    const base64 = codificarBase64UTF8(codigoPlantUML);
    const url    = `/api/diagrama?puml=${encodeURIComponent(base64)}`;

    // El servidor devuelve la imagen PNG directamente
    const img      = document.createElement('img');
    img.src        = url;
    img.alt        = 'Diagrama entidad-relación';
    img.title      = 'Diagrama ER generado con PlantUML';

    img.onerror = () => {
      contenedor.innerHTML =
        '<p class="diagrama-error">No se pudo renderizar el diagrama.<br>' +
        'Comprueba la conexión a internet (requiere plantuml.com).</p>';
    };

    img.onload = () => {
      contenedor.innerHTML = '';
      contenedor.appendChild(img);
    };

    // Insertar provisionalmente para que comience la carga
    contenedor.innerHTML = '';
    contenedor.appendChild(img);

  } catch (error) {
    contenedor.innerHTML =
      `<p class="diagrama-error">Error al cargar el diagrama: ${escaparHTML(error.message)}</p>`;
  }
}

// ============================================================
// NAVEGACIÓN ENTRE PESTAÑAS
// ============================================================

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    // Desactivar pestaña actual
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

    // Activar la pestaña pulsada
    btn.classList.add('active');
    const pane = document.getElementById(`tab-${btn.dataset.tab}`);
    if (pane) pane.classList.add('active');
  });
});

// ============================================================
// BOTONES DE ACCIÓN
// ============================================================

/**
 * Reinicia el modelo: limpia el estado, el chat y los paneles.
 */
btnReset.addEventListener('click', async () => {
  if (!confirm('¿Reiniciar el modelo? Se perderá todo el progreso actual.')) return;

  try {
    await fetch('/api/reset', { method: 'POST' });
  } catch (_) { /* ignorar error de red */ }

  // Limpiar el estado
  estado.modelo     = null;
  estado.mysql      = '';
  estado.mongodb    = '';
  estado.plantuml   = '';
  estado.jsonschema = '';
  estado.java       = '';

  // Limpiar los paneles de código
  ['codeModelo','codeMySQL','codeMongoDB','codePlantUML','codeJSONSchema','codeJava']
    .forEach(id => {
      document.getElementById(id).innerHTML =
        '<span class="placeholder">// Contenido reiniciado. Escribe un nuevo prompt.</span>';
    });

  document.getElementById('diagramaContainer').innerHTML =
    '<p class="placeholder-img">El diagrama ER aparecerá aquí.</p>';

  // Limpiar mensajes del chat (conservar el saludo inicial)
  chatMessages.innerHTML = `
    <div class="message assistant">
      <div class="message-avatar">MG</div>
      <div class="message-bubble">
        <p>Modelo reiniciado. Puedes empezar desde cero describiendo tu nuevo sistema.</p>
      </div>
    </div>`;
});

/**
 * Gestiona los botones "Copiar" de cada pestaña.
 */
document.querySelectorAll('.btn-copy').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const elemento = document.getElementById(targetId);
    if (!elemento) return;

    // Obtener texto plano (sin etiquetas HTML del highlighting)
    const texto = elemento.innerText || elemento.textContent;

    navigator.clipboard.writeText(texto).then(() => {
      btn.textContent = '✓ Copiado';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = targetId === 'codePlantUML' ? 'Copiar código' : 'Copiar';
        btn.classList.remove('copied');
      }, 2000);
    }).catch(() => {
      // Fallback para navegadores sin clipboard API
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(elemento);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('copy');
      sel.removeAllRanges();
    });
  });
});

/**
 * Descarga todos los artefactos actuales como un fichero ZIP.
 * Usa la librería JSZip cargada desde CDN.
 */
btnDownload.addEventListener('click', async () => {
  if (!estado.modelo) {
    alert('Todavía no hay modelo generado. Escribe un prompt primero.');
    return;
  }

  const zip = new JSZip();

  // Añadir cada artefacto al ZIP con su extensión correspondiente
  zip.file('modelo.json',       JSON.stringify(estado.modelo, null, 2));
  zip.file('schema.sql',        estado.mysql);
  zip.file('mongodb.js',        estado.mongodb);
  zip.file('diagrama.puml',     estado.plantuml);
  zip.file('jsonschema.json',   estado.jsonschema);
  zip.file('java_entities.java',estado.java);

  // Generar el ZIP y disparar la descarga
  const blob = await zip.generateAsync({ type: 'blob' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `modelgen_v${estado.modelo.version || 1}.zip`;
  a.click();
  URL.revokeObjectURL(url);
});

// ============================================================
// UTILIDADES DE RED
// ============================================================

/**
 * Realiza una llamada fetch POST a la API del servidor.
 * @param {string} ruta - Ruta del endpoint (ej. '/api/prompt')
 * @param {Object} cuerpo - Objeto a enviar como JSON
 * @returns {Promise<Object>} Respuesta JSON del servidor
 * @throws {Error} Si la respuesta HTTP no es OK
 */
async function llamarAPI(ruta, cuerpo) {
  const respuesta = await fetch(ruta, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(cuerpo)
  });

  const datos = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(datos.error || `Error ${respuesta.status} en ${ruta}`);
  }

  return datos;
}

/**
 * Habilita o deshabilita los controles de entrada del chat.
 * @param {boolean} deshabilitar - true para deshabilitar
 */
function deshabilitarEntrada(deshabilitar) {
  txtPrompt.disabled = deshabilitar;
  btnSend.disabled   = deshabilitar;
}

// ============================================================
// CODIFICACIÓN BASE64 SEGURA PARA UTF-8
// ============================================================

/**
 * Codifica una cadena UTF-8 en base64 de forma segura.
 * Necesario porque btoa() de los navegadores solo soporta ASCII.
 * @param {string} str - Cadena a codificar
 * @returns {string} Cadena en base64
 */
function codificarBase64UTF8(str) {
  // Convertir la cadena a bytes UTF-8 con TextEncoder
  const bytes  = new TextEncoder().encode(str);
  let binario  = '';
  for (let i = 0; i < bytes.length; i++) {
    binario += String.fromCharCode(bytes[i]);
  }
  return btoa(binario);
}

// ============================================================
// SYNTAX HIGHLIGHTING BÁSICO
// Convierte texto plano en HTML con spans de colores.
// ============================================================

/**
 * Aplica syntax highlighting básico a código JSON.
 * @param {string} texto - Texto JSON
 * @returns {string} HTML con spans de colores
 */
function resaltarJSON(texto) {
  return escaparHTML(texto)
    // Claves de objeto: "clave":
    .replace(/"([^"]+)"(\s*:)/g,
      '<span class="kw-key">"$1"</span>$2')
    // Cadenas de valor
    .replace(/:\s*"([^"]*)"/g,
      ': <span class="kw-val">"$1"</span>')
    // Números
    .replace(/:\s*(-?\d+\.?\d*)/g,
      ': <span class="kw-num">$1</span>')
    // Booleanos y null
    .replace(/:\s*(true|false|null)/g,
      ': <span class="kw-bool">$1</span>');
}

/**
 * Aplica syntax highlighting básico a código SQL.
 * @param {string} texto - Texto SQL
 * @returns {string} HTML con spans de colores
 */
function resaltarSQL(texto) {
  const palabrasClaveSQL = [
    'CREATE','TABLE','IF','NOT','EXISTS','PRIMARY','KEY','FOREIGN',
    'REFERENCES','AUTO_INCREMENT','NULL','UNIQUE','INDEX','ALTER',
    'ADD','COLUMN','ENGINE','DEFAULT','CHARSET','COLLATE','CASCADE',
    'ON','DELETE','SET','FOREIGN_KEY_CHECKS','INT','VARCHAR','TEXT',
    'DATE','DATETIME','DECIMAL','TINYINT'
  ];
  let resultado = escaparHTML(texto);

  // Comentarios
  resultado = resultado.replace(/(--[^\n]*)/g,
    '<span class="kw-cmt">$1</span>');

  // Palabras clave SQL
  const re = new RegExp(`\\b(${palabrasClaveSQL.join('|')})\\b`, 'g');
  resultado = resultado.replace(re,
    '<span class="kw-sql">$1</span>');

  // Tipos de datos
  resultado = resultado.replace(
    /\b(VARCHAR|INT|DECIMAL|TINYINT|TEXT|DATE|DATETIME)\b/g,
    '<span class="kw-type">$1</span>');

  // Cadenas
  resultado = resultado.replace(/'([^']*)'/g,
    '<span class="kw-str">\'$1\'</span>');

  return resultado;
}

/**
 * Aplica syntax highlighting básico a código JavaScript (MongoDB).
 * @param {string} texto - Texto JavaScript
 * @returns {string} HTML con spans de colores
 */
function resaltarJS(texto) {
  let resultado = escaparHTML(texto);

  // Comentarios de línea
  resultado = resultado.replace(/(\/\/[^\n]*)/g,
    '<span class="kw-cmt">$1</span>');

  // Palabras clave JS
  resultado = resultado.replace(
    /\b(use|db|const|let|var|function|return|if|else|for|true|false|null)\b/g,
    '<span class="kw-sql">$1</span>');

  // Cadenas entre comillas dobles
  resultado = resultado.replace(/"([^"]*)"/g,
    '<span class="kw-val">"$1"</span>');

  // Números
  resultado = resultado.replace(/\b(\d+)\b/g,
    '<span class="kw-num">$1</span>');

  return resultado;
}

/**
 * Aplica syntax highlighting básico a código Java.
 * @param {string} texto - Texto Java
 * @returns {string} HTML con spans de colores
 */
function resaltarJava(texto) {
  const palabrasClaveJava = [
    'public','private','protected','class','interface','extends','implements',
    'new','return','void','static','final','import','package','null',
    'true','false','this','super'
  ];
  const tiposJava = [
    'String','Integer','Double','Boolean','Date','List','ArrayList',
    'int','double','boolean','long','Serializable'
  ];

  let resultado = escaparHTML(texto);

  // Comentarios de línea
  resultado = resultado.replace(/(\/\/[^\n]*)/g,
    '<span class="kw-cmt">$1</span>');

  // Comentarios de bloque (Javadoc)
  resultado = resultado.replace(/(\/\*[\s\S]*?\*\/)/g,
    '<span class="kw-cmt">$1</span>');

  // Anotaciones JPA
  resultado = resultado.replace(/(@\w+)/g,
    '<span class="kw-ann">$1</span>');

  // Palabras clave Java
  const reKw = new RegExp(`\\b(${palabrasClaveJava.join('|')})\\b`, 'g');
  resultado = resultado.replace(reKw,
    '<span class="kw-jav">$1</span>');

  // Tipos Java
  const reTp = new RegExp(`\\b(${tiposJava.join('|')})\\b`, 'g');
  resultado = resultado.replace(reTp,
    '<span class="kw-jtp">$1</span>');

  // Cadenas
  resultado = resultado.replace(/"([^"]*)"/g,
    '<span class="kw-val">"$1"</span>');

  return resultado;
}

/**
 * Escapa caracteres especiales HTML para evitar XSS en el rendering de código.
 * @param {string} texto - Texto a escapar
 * @returns {string} Texto seguro para insertar como innerHTML
 */
function escaparHTML(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// server.js — Servidor principal de ModelGen
// Gestiona las rutas de la API REST y sirve los ficheros estáticos.
// El modelo JSON se mantiene en memoria durante la sesión.
// ============================================================

require('dotenv').config();

const express = require('express');
const path    = require('path');
const zlib    = require('zlib');
const axios   = require('axios');

// Importar módulos propios
const { procesarPrompt }   = require('./src/parser');
const { fusionarModelos }  = require('./src/merger');
const { generarMySQL }     = require('./src/generators/mysql');
const { generarMongoDB }   = require('./src/generators/mongodb');
const { generarPlantUML }  = require('./src/generators/plantuml');
const { generarJSONSchema }= require('./src/generators/jsonschema');
const { generarJava }      = require('./src/generators/java');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Estado global en memoria ─────────────────────────────────
// El modelo se guarda aquí mientras el servidor esté activo.
let modeloActual = null;

// ── Middleware ───────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// POST /api/prompt
// Recibe el texto del usuario, lo procesa con la IA y
// fusiona el resultado con el modelo existente.
// Body:  { "texto": "...", "modeloActual": {...} }
// Response: { "modelo": {...}, "mensaje": "..." }
// ============================================================
app.post('/api/prompt', async (req, res) => {
  try {
    const { texto, modeloActual: modeloCliente } = req.body;

    if (!texto || texto.trim() === '') {
      return res.status(400).json({ error: 'El texto no puede estar vacío.' });
    }

    // Usar el modelo del servidor; si no existe, usar el del cliente
    const modeloPrevio = modeloActual || modeloCliente || null;

    // Llamar a la IA para extraer el nuevo modelo desde el lenguaje natural
    const modeloIA = await procesarPrompt(texto, modeloPrevio);

    if (modeloPrevio) {
      // Fusionar el modelo IA con el existente
      modeloActual = fusionarModelos(modeloPrevio, modeloIA);
    } else {
      // Primer prompt: inicializar versión e historial
      modeloActual = {
        ...modeloIA,
        version: 1,
        historial: []
      };
    }

    // Construir mensaje de confirmación para el chat
    const nombresEntidades = modeloIA.entidades.map(e => e.nombre).join(', ');
    const nombresRelaciones = (modeloIA.relaciones || []).map(r => r.nombre).join(', ');
    let mensaje = `Modelo actualizado a la versión ${modeloActual.version}.`;
    if (nombresEntidades) mensaje += ` Entidades detectadas: ${nombresEntidades}.`;
    if (nombresRelaciones) mensaje += ` Relaciones: ${nombresRelaciones}.`;

    res.json({ modelo: modeloActual, mensaje });

  } catch (error) {
    console.error('[/api/prompt] Error:', error.message);
    res.status(500).json({ error: error.message || 'Error procesando el prompt.' });
  }
});

// ============================================================
// POST /api/generate
// Genera todos los artefactos a partir del modelo JSON.
// El código de cada generador NO usa IA: solo transforma el JSON.
// Body:  { "modelo": {...} }
// Response: { "mysql", "mongodb", "plantuml", "jsonschema", "java" }
// ============================================================
app.post('/api/generate', (req, res) => {
  try {
    const { modelo } = req.body;

    if (!modelo || !Array.isArray(modelo.entidades)) {
      return res.status(400).json({ error: 'Modelo JSON inválido o incompleto.' });
    }

    // Invocar cada generador de forma independiente
    const mysql      = generarMySQL(modelo);
    const mongodb    = generarMongoDB(modelo);
    const plantuml   = generarPlantUML(modelo);
    const jsonschema = generarJSONSchema(modelo);
    const java       = generarJava(modelo);

    res.json({ mysql, mongodb, plantuml, jsonschema, java });

  } catch (error) {
    console.error('[/api/generate] Error:', error.message);
    res.status(500).json({ error: error.message || 'Error generando artefactos.' });
  }
});

// ============================================================
// GET /api/diagrama
// Renderiza el código PlantUML recibido en base64 como imagen PNG.
// Delega el renderizado al servidor público de PlantUML.
// Query: ?puml=<código PlantUML en base64>
// Response: imagen PNG
// ============================================================
app.get('/api/diagrama', async (req, res) => {
  try {
    const { puml } = req.query;

    if (!puml) {
      return res.status(400).json({ error: 'Falta el parámetro puml.' });
    }

    // Decodificar el base64 recibido del frontend
    const codigoPlantUML = Buffer.from(puml, 'base64').toString('utf8');

    // Re-codificar con el formato propio de PlantUML (deflate + base64 especial)
    const codificado = codificarPlantUML(codigoPlantUML);
    const urlServidor = `https://www.plantuml.com/plantuml/png/${codificado}`;

    // Obtener la imagen PNG del servidor de PlantUML
    const respuesta = await axios.get(urlServidor, {
      responseType: 'arraybuffer',
      timeout: 15000
    });

    res.set('Content-Type', 'image/png');
    res.send(respuesta.data);

  } catch (error) {
    console.error('[/api/diagrama] Error:', error.message);
    res.status(500).json({ error: 'No se pudo renderizar el diagrama.' });
  }
});

// ============================================================
// POST /api/reset
// Reinicia el modelo en memoria a su estado inicial.
// ============================================================
app.post('/api/reset', (req, res) => {
  modeloActual = null;
  res.json({ mensaje: 'Modelo reiniciado correctamente.' });
});

// ── Funciones de codificación PlantUML ──────────────────────

/**
 * Codifica texto PlantUML para usarlo en la URL del servidor PlantUML.
 * El proceso es: comprimir con deflate raw → base64 con alfabeto propio.
 * @param {string} texto - Código PlantUML
 * @returns {string} Cadena codificada lista para la URL
 */
function codificarPlantUML(texto) {
  const comprimido = zlib.deflateRawSync(Buffer.from(texto, 'utf8'), { level: 9 });
  return encode64PlantUML(comprimido);
}

/**
 * Implementa el base64 personalizado de PlantUML.
 * Usa el alfabeto: 0-9 A-Z a-z - _
 * @param {Buffer} datos - Datos comprimidos
 * @returns {string} Cadena base64 con el alfabeto de PlantUML
 */
function encode64PlantUML(datos) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
  let resultado = '';

  for (let i = 0; i < datos.length; i += 3) {
    const b1 = datos[i];
    const b2 = i + 1 < datos.length ? datos[i + 1] : 0;
    const b3 = i + 2 < datos.length ? datos[i + 2] : 0;

    resultado += chars[b1 >> 2];
    resultado += chars[((b1 & 0x3) << 4) | (b2 >> 4)];
    resultado += chars[((b2 & 0xF) << 2) | (b3 >> 6)];
    resultado += chars[b3 & 0x3F];
  }

  return resultado;
}

// ── Arranque del servidor ────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════╗`);
  console.log(`  ║   ModelGen corriendo en puerto ${PORT}   ║`);
  console.log(`  ║   http://localhost:${PORT}              ║`);
  console.log(`  ╚══════════════════════════════════════╝\n`);
});

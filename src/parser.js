// ============================================================
// src/parser.js — Módulo de extracción de modelos mediante IA
// Llama a la API de Groq con el modelo LLaMA para convertir
// texto en lenguaje natural en un modelo JSON de datos.
// Reintenta hasta MAX_REINTENTOS veces si la respuesta no es JSON válido.
// ============================================================

const axios = require('axios');

const GROQ_API_URL  = 'https://api.groq.com/openai/v1/chat/completions';
const MODELO_GROQ   = 'llama-3.3-70b-versatile';
const MAX_REINTENTOS = 3;

// System prompt que instruye a la IA sobre el formato de salida esperado.
// Es crítico que sea preciso: sin este prompt la IA devolvería texto libre.
const SYSTEM_PROMPT =
  'Eres un extractor de modelos de datos. El usuario describe un sistema en ' +
  'lenguaje natural. Si recibes un modelo existente, fusiona la nueva ' +
  'información con él sin perder nada. ' +
  'Responde ÚNICAMENTE con JSON válido siguiendo esta estructura: ' +
  '{entidades: [{nombre, campos: [{nombre, tipo, primaryKey?, unique?, nullable?}]}], ' +
  'relaciones: [{nombre, de, a, tipo}]}. ' +
  'Tipos permitidos: string, integer, float, boolean, date, datetime, text. ' +
  'Sin explicaciones, sin markdown, solo JSON.';

/**
 * Procesa un texto en lenguaje natural y devuelve un modelo JSON de datos.
 * Si se proporciona un modelo previo, se incluye en el contexto para que
 * la IA lo tenga en cuenta al generar el nuevo modelo.
 *
 * @param {string} texto - Descripción del sistema en lenguaje natural
 * @param {Object|null} modeloPrevio - Modelo existente para fusionar, o null
 * @returns {Promise<Object>} Modelo JSON con entidades y relaciones
 * @throws {Error} Si no se consigue JSON válido tras MAX_REINTENTOS intentos
 */
async function procesarPrompt(texto, modeloPrevio = null) {
  let ultimoError = null;

  for (let intento = 1; intento <= MAX_REINTENTOS; intento++) {
    try {
      // Construir el mensaje del usuario.
      // Si hay modelo previo, lo incluimos para que la IA pueda fusionarlo.
      let mensajeUsuario = texto;
      if (modeloPrevio) {
        // Solo enviamos entidades y relaciones (sin version/historial)
        const contexto = {
          entidades:  modeloPrevio.entidades,
          relaciones: modeloPrevio.relaciones
        };
        mensajeUsuario +=
          `\n\nModelo existente (debes fusionar con él): ${JSON.stringify(contexto)}`;
      }

      // Llamada a la API de Groq
      const respuesta = await axios.post(
        GROQ_API_URL,
        {
          model: MODELO_GROQ,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user',   content: mensajeUsuario }
          ],
          temperature: 0.1,   // Temperatura baja → respuestas más deterministas
          max_tokens:  4096
        },
        {
          headers: {
            Authorization:  `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      // Extraer el contenido de la respuesta
      const contenido = respuesta.data.choices[0].message.content.trim();

      // Limpiar posible markdown y parsear el JSON
      const jsonLimpio = extraerJSON(contenido);
      const modelo     = JSON.parse(jsonLimpio);

      // Validar la estructura mínima esperada
      if (!Array.isArray(modelo.entidades)) {
        throw new Error('La respuesta no contiene el campo "entidades".');
      }

      // Garantizar que siempre exista el campo relaciones
      if (!Array.isArray(modelo.relaciones)) {
        modelo.relaciones = [];
      }

      // Asegurar que cada entidad tenga un campo id como clave primaria
      modelo.entidades = modelo.entidades.map(asegurarCampoId);

      return modelo;

    } catch (error) {
      ultimoError = error;
      console.warn(`[parser] Intento ${intento}/${MAX_REINTENTOS} fallido: ${error.message}`);

      // Espera progresiva entre reintentos (1s, 2s, 3s...)
      if (intento < MAX_REINTENTOS) {
        await esperar(1000 * intento);
      }
    }
  }

  throw new Error(
    `La IA no devolvió JSON válido tras ${MAX_REINTENTOS} intentos: ${ultimoError.message}`
  );
}

/**
 * Extrae el bloque JSON de una cadena que puede contener texto adicional
 * o bloques de código markdown (```json ... ```).
 *
 * @param {string} texto - Texto que contiene el JSON
 * @returns {string} Cadena JSON limpia
 */
function extraerJSON(texto) {
  // Eliminar bloques de código markdown si los hay
  let limpio = texto.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

  // Encontrar los límites del objeto JSON
  const inicio = limpio.indexOf('{');
  const fin    = limpio.lastIndexOf('}');

  if (inicio === -1 || fin === -1 || fin <= inicio) {
    throw new Error('No se encontró un objeto JSON válido en la respuesta de la IA.');
  }

  return limpio.substring(inicio, fin + 1);
}

/**
 * Asegura que una entidad tiene exactamente un campo marcado como primaryKey.
 * Si no lo tiene, añade un campo "id" de tipo integer al principio.
 *
 * @param {Object} entidad - Entidad del modelo
 * @returns {Object} Entidad con campo id garantizado
 */
function asegurarCampoId(entidad) {
  const tienePK = (entidad.campos || []).some(c => c.primaryKey);
  if (tienePK) return entidad;

  return {
    ...entidad,
    campos: [
      { nombre: 'id', tipo: 'integer', primaryKey: true, nullable: false },
      ...(entidad.campos || [])
    ]
  };
}

/**
 * Espera un número de milisegundos antes de continuar.
 * @param {number} ms - Milisegundos a esperar
 * @returns {Promise<void>}
 */
function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { procesarPrompt };

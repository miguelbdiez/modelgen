// ============================================================
// src/merger.js — Módulo de fusión de modelos
// Combina el modelo existente con uno nuevo proveniente de la IA,
// preservando toda la información previa y llevando un historial
// completo de versiones.
// ============================================================

/**
 * Fusiona el modelo nuevo (procedente de la IA) con el modelo existente.
 * Estrategia:
 *   - Las entidades nuevas se añaden; las existentes fusionan sus campos.
 *   - Las relaciones nuevas se añaden si no son duplicadas.
 *   - La versión se incrementa y el estado anterior se guarda en el historial.
 *
 * @param {Object} modeloExistente - Estado actual del modelo en memoria
 * @param {Object} modeloNuevo     - Modelo extraído por la IA del último prompt
 * @returns {Object} Modelo fusionado con versión actualizada e historial ampliado
 */
function fusionarModelos(modeloExistente, modeloNuevo) {
  // Guardar snapshot del modelo actual antes de modificarlo
  const historialActualizado = [
    ...(modeloExistente.historial || []),
    {
      version:    modeloExistente.version || 1,
      timestamp:  new Date().toISOString(),
      entidades:  copiarProfundo(modeloExistente.entidades),
      relaciones: copiarProfundo(modeloExistente.relaciones)
    }
  ];

  const entidadesFusionadas  = fusionarEntidades(
    modeloExistente.entidades  || [],
    modeloNuevo.entidades      || []
  );

  const relacionesFusionadas = fusionarRelaciones(
    modeloExistente.relaciones || [],
    modeloNuevo.relaciones     || []
  );

  return {
    entidades:  entidadesFusionadas,
    relaciones: relacionesFusionadas,
    version:    (modeloExistente.version || 1) + 1,
    historial:  historialActualizado
  };
}

/**
 * Fusiona dos listas de entidades.
 * Si una entidad ya existe (mismo nombre, insensible a mayúsculas),
 * se fusionan sus campos. Si es nueva, se añade tal cual.
 *
 * @param {Array} existentes - Entidades actuales del modelo
 * @param {Array} nuevas     - Entidades del nuevo modelo de la IA
 * @returns {Array} Lista de entidades fusionada
 */
function fusionarEntidades(existentes, nuevas) {
  // Copia para no mutar el array original
  const resultado = existentes.map(e => ({ ...e, campos: [...(e.campos || [])] }));

  for (const entidadNueva of nuevas) {
    const idx = resultado.findIndex(
      e => e.nombre.toLowerCase() === entidadNueva.nombre.toLowerCase()
    );

    if (idx === -1) {
      // Entidad completamente nueva → añadir directamente
      resultado.push({ ...entidadNueva });
    } else {
      // Entidad existente → fusionar solo los campos nuevos
      resultado[idx].campos = fusionarCampos(
        resultado[idx].campos     || [],
        entidadNueva.campos       || []
      );
    }
  }

  return resultado;
}

/**
 * Fusiona dos listas de campos de una entidad.
 * Solo se añaden los campos cuyo nombre no existe ya.
 * Los campos existentes no se sobrescriben para respetar
 * la información ya validada.
 *
 * @param {Array} existentes - Campos actuales de la entidad
 * @param {Array} nuevos     - Campos propuestos por la IA
 * @returns {Array} Lista de campos fusionada
 */
function fusionarCampos(existentes, nuevos) {
  const resultado = [...existentes];

  for (const campoNuevo of nuevos) {
    const yaExiste = resultado.some(
      c => c.nombre.toLowerCase() === campoNuevo.nombre.toLowerCase()
    );
    if (!yaExiste) {
      resultado.push({ ...campoNuevo });
    }
  }

  return resultado;
}

/**
 * Fusiona dos listas de relaciones.
 * Se considera duplicada una relación con el mismo origen, destino y tipo.
 *
 * @param {Array} existentes - Relaciones actuales del modelo
 * @param {Array} nuevas     - Relaciones del nuevo modelo de la IA
 * @returns {Array} Lista de relaciones fusionada sin duplicados
 */
function fusionarRelaciones(existentes, nuevas) {
  const resultado = [...existentes];

  for (const relNueva of nuevas) {
    const yaExiste = resultado.some(
      r =>
        r.de.toLowerCase()   === relNueva.de.toLowerCase()   &&
        r.a.toLowerCase()    === relNueva.a.toLowerCase()     &&
        r.tipo               === relNueva.tipo
    );
    if (!yaExiste) {
      resultado.push({ ...relNueva });
    }
  }

  return resultado;
}

/**
 * Crea una copia profunda de un valor mediante serialización JSON.
 * Suficiente para los tipos simples que contiene el modelo.
 *
 * @param {*} valor - Valor a copiar
 * @returns {*} Copia profunda del valor
 */
function copiarProfundo(valor) {
  return JSON.parse(JSON.stringify(valor || []));
}

module.exports = { fusionarModelos };

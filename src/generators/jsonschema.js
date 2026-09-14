// ============================================================
// src/generators/jsonschema.js — Generador de JSON Schema
// Produce un esquema de validación estándar draft-07 con
// definiciones para todas las entidades del modelo. NO usa IA.
// ============================================================

/**
 * Genera un JSON Schema draft-07 completo con definiciones
 * para cada entidad del modelo.
 *
 * @param {Object} modelo - Modelo JSON con entidades y relaciones
 * @returns {string} JSON Schema serializado con indentación de 2 espacios
 */
function generarJSONSchema(modelo) {
  const definiciones = {};

  // Crear una definición $defs para cada entidad
  for (const entidad of modelo.entidades) {
    definiciones[entidad.nombre] = definirEntidad(entidad);
  }

  const esquema = {
    $schema:     'http://json-schema.org/draft-07/schema#',
    $comment:    `Generado por ModelGen — versión ${modelo.version || 1} — ${new Date().toISOString()}`,
    title:       'ModelGen Schema',
    description: 'Esquema de validación del sistema de información',
    definitions: definiciones,
    type:        'object'
  };

  return JSON.stringify(esquema, null, 2);
}

/**
 * Genera la definición JSON Schema para una entidad concreta.
 * Incluye propiedades, tipos, formatos y array de campos requeridos.
 *
 * @param {Object} entidad - Entidad del modelo
 * @returns {Object} Definición JSON Schema de la entidad
 */
function definirEntidad(entidad) {
  const propiedades = {};
  const requeridos  = [];

  for (const campo of (entidad.campos || [])) {
    propiedades[campo.nombre] = definirPropiedad(campo);

    // Un campo es requerido si es PK o está marcado explícitamente como no nullable
    if (campo.primaryKey || campo.nullable === false) {
      requeridos.push(campo.nombre);
    }
  }

  const definicion = {
    type:                 'object',
    title:                entidad.nombre,
    description:          `Entidad ${entidad.nombre} del sistema`,
    properties:           propiedades,
    additionalProperties: false
  };

  if (requeridos.length > 0) {
    definicion.required = requeridos;
  }

  return definicion;
}

/**
 * Genera la definición JSON Schema para un campo individual.
 * Gestiona tipos, formatos, valores nulos y restricciones.
 *
 * @param {Object} campo - Campo de la entidad
 * @returns {Object} Definición de propiedad JSON Schema
 */
function definirPropiedad(campo) {
  const tipoBase = mapearTipoJSON(campo.tipo);
  const formato  = mapearFormato(campo.tipo);

  const propiedad = {};

  // Los campos nullable pueden ser null además de su tipo
  if (campo.nullable !== false && !campo.primaryKey) {
    propiedad.type = [tipoBase, 'null'];
  } else {
    propiedad.type = tipoBase;
  }

  if (formato) {
    propiedad.format = formato;
  }

  // Restricciones específicas por tipo
  if (campo.primaryKey) {
    propiedad.description = 'Clave primaria autoincremental';
    propiedad.minimum     = 1;
  } else if (campo.unique) {
    propiedad.description = `Valor único en la entidad`;
  }

  if (campo.tipo === 'string') {
    propiedad.minLength = 1;
  }

  return propiedad;
}

/**
 * Mapea los tipos del modelo a tipos primitivos de JSON Schema.
 *
 * @param {string} tipo - Tipo del campo en el modelo
 * @returns {string} Tipo JSON Schema
 */
function mapearTipoJSON(tipo) {
  const mapa = {
    string:   'string',
    integer:  'integer',
    float:    'number',
    boolean:  'boolean',
    date:     'string',
    datetime: 'string',
    text:     'string'
  };
  return mapa[tipo] || 'string';
}

/**
 * Devuelve el formato JSON Schema para tipos con representación especial.
 *
 * @param {string} tipo - Tipo del campo en el modelo
 * @returns {string|null} Formato JSON Schema o null si no aplica
 */
function mapearFormato(tipo) {
  const formatos = {
    date:     'date',
    datetime: 'date-time'
  };
  return formatos[tipo] || null;
}

module.exports = { generarJSONSchema };

// ============================================================
// src/generators/mongodb.js — Generador de esquemas MongoDB
// Produce comandos createCollection con validación $jsonSchema
// para cada entidad del modelo. NO usa IA.
// ============================================================

/**
 * Genera el script de MongoDB completo con validación $jsonSchema
 * para todas las entidades del modelo.
 *
 * @param {Object} modelo - Modelo JSON con entidades y relaciones
 * @returns {string} Script JavaScript de MongoDB (Mongosh compatible)
 */
function generarMongoDB(modelo) {
  const bloques = [];

  bloques.push('// ============================================================');
  bloques.push('// Script MongoDB generado automáticamente por ModelGen');
  bloques.push(`// Versión del modelo: ${modelo.version || 1}`);
  bloques.push(`// Fecha: ${new Date().toISOString()}`);
  bloques.push('// Ejecutar con: mongosh < mongodb.js');
  bloques.push('// ============================================================');
  bloques.push('');
  bloques.push('use("modelgen_db");');
  bloques.push('');

  // Crear colección con validación para cada entidad
  for (const entidad of modelo.entidades) {
    bloques.push(generarColeccion(entidad, modelo.relaciones || []));
    bloques.push('');
  }

  // Crear índices únicos
  for (const entidad of modelo.entidades) {
    const camposUnicos = (entidad.campos || []).filter(c => c.unique && !c.primaryKey);
    for (const campo of camposUnicos) {
      bloques.push(`// Índice único: ${entidad.nombre}.${campo.nombre}`);
      bloques.push(
        `db.${entidad.nombre.toLowerCase()}.createIndex(` +
        `{ ${campo.nombre}: 1 }, { unique: true });`
      );
      bloques.push('');
    }
  }

  return bloques.join('\n');
}

/**
 * Genera el comando createCollection con $jsonSchema para una entidad.
 * Las referencias a otras entidades se modelan como ObjectId o array de ObjectId.
 *
 * @param {Object} entidad   - Entidad del modelo
 * @param {Array}  relaciones - Relaciones del modelo
 * @returns {string} Comando db.createCollection completo
 */
function generarColeccion(entidad, relaciones) {
  const propiedades = {};
  const requeridos  = [];

  // Campos propios de la entidad
  for (const campo of (entidad.campos || [])) {
    // MongoDB usa _id nativo; omitir la clave primaria del modelo
    if (campo.primaryKey) continue;

    propiedades[campo.nombre] = { bsonType: mapearBSON(campo.tipo) };

    if (campo.nullable === false) {
      requeridos.push(campo.nombre);
    }
  }

  // Relaciones many-to-one / one-to-one → campo de referencia ObjectId
  const refsSimples = relaciones.filter(
    r => r.de === entidad.nombre &&
         (r.tipo === 'many-to-one' || r.tipo === 'one-to-one')
  );
  for (const rel of refsSimples) {
    propiedades[`${rel.a.toLowerCase()}_id`] = { bsonType: 'objectId' };
  }

  // Relaciones many-to-many → array de ObjectId embebido
  const refsMTM = relaciones.filter(
    r => r.de === entidad.nombre && r.tipo === 'many-to-many'
  );
  for (const rel of refsMTM) {
    propiedades[`${rel.a.toLowerCase()}_ids`] = {
      bsonType: 'array',
      items: { bsonType: 'objectId' }
    };
  }

  // Construir el objeto $jsonSchema
  const jsonSchema = {
    $jsonSchema: {
      bsonType:   'object',
      properties: propiedades
    }
  };
  if (requeridos.length > 0) {
    jsonSchema.$jsonSchema.required = requeridos;
  }

  const esquemaStr = JSON.stringify(jsonSchema, null, 2)
    .split('\n')
    .map((linea, i) => (i === 0 ? linea : '  ' + linea))
    .join('\n');

  return [
    `// Colección: ${entidad.nombre}`,
    `db.createCollection("${entidad.nombre.toLowerCase()}", {`,
    `  validator: ${esquemaStr}`,
    '});'
  ].join('\n');
}

/**
 * Mapea los tipos del modelo a tipos BSON de MongoDB.
 *
 * @param {string} tipo - Tipo del campo en el modelo
 * @returns {string} Tipo BSON
 */
function mapearBSON(tipo) {
  const mapa = {
    string:   'string',
    integer:  'int',
    float:    'double',
    boolean:  'bool',
    date:     'date',
    datetime: 'date',
    text:     'string'
  };
  return mapa[tipo] || 'string';
}

module.exports = { generarMongoDB };

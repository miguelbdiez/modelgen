# ModelGen — Del lenguaje natural al modelo de datos

Describe tu sistema en español, en una frase, y ModelGen te devuelve el esquema MySQL,
el esquema MongoDB, el diagrama entidad-relación, el JSON Schema de validación y las
clases Java con anotaciones JPA. Todo a la vez, y todo coherente entre sí.

Práctica de la asignatura **Modelado de Sistemas de Información**, del Máster
Universitario en Ingeniería Informática (Universidad de Salamanca).

---

## Qué resuelve

El modelado de datos obliga a mantener sincronizados artefactos que dicen lo mismo en
lenguajes distintos: el DDL relacional, el esquema documental, el diagrama para la
documentación y las clases del dominio. Cuando el modelo cambia, o se actualizan todos a
mano o divergen.

ModelGen invierte el flujo: mantiene un **metamodelo JSON como única fuente de verdad** y
deriva de él el resto. La descripción en lenguaje natural sólo alimenta ese metamodelo, y
las peticiones sucesivas **fusionan** en lugar de sobrescribir, con versionado e historial.

Artefactos generados:

| Artefacto       | Tecnología           |
|-----------------|----------------------|
| Modelo base     | JSON (metamodelo)    |
| Base de datos relacional | MySQL (SQL)  |
| Base de datos documental | MongoDB ($jsonSchema) |
| Diagrama ER     | PlantUML             |
| Validación      | JSON Schema draft-07 |
| Capa de negocio | Clases Java + JPA    |

---

## Requisitos previos

| Herramienta | Versión mínima |
|-------------|---------------|
| Node.js     | 18.x           |
| npm         | 9.x            |
| Cuenta Groq | gratuita       |

> **Sin Java ni PlantUML instalados.** El diagrama se renderiza mediante el
> servidor público `plantuml.com`, por lo que se necesita conexión a internet.

---

## Instalación

```bash
# 1. Entrar en la carpeta del proyecto
cd modelgen

# 2. Instalar las dependencias
npm install

# 3. Configurar la clave de API de Groq
#    Editar el fichero .env y sustituir el valor de GROQ_API_KEY
nano .env
```

El fichero `.env` debe quedar así:

```
GROQ_API_KEY=gsk_TuClaveAquí
PORT=3000
```

Puedes obtener una clave gratuita en: <https://console.groq.com>

---

## Arranque

```bash
npm start
```

Si todo va bien, verás:

```
  ╔══════════════════════════════════════╗
  ║   ModelGen corriendo en puerto 3000   ║
  ║   http://localhost:3000              ║
  ╚══════════════════════════════════════╝
```

Abre `http://localhost:3000` en el navegador.

---

## Ejemplo de uso paso a paso

### Paso 1 — Describir el sistema

Escribe en el chat:

> *"Quiero guardar estudiantes con nombre, email y fecha de nacimiento.
> Cada estudiante puede matricularse en varias asignaturas.
> Las asignaturas tienen nombre, código y créditos."*

ModelGen llamará a Groq (LLaMA 3.3 70B) y generará el modelo JSON intermedio.

### Paso 2 — Ver los artefactos generados

El panel derecho mostrará automáticamente:

- **Modelo JSON**: el metamodelo con entidades `Estudiante` y `Asignatura`
- **MySQL**: sentencias `CREATE TABLE` con la tabla intermedia `Matricula`
- **MongoDB**: colecciones con `$jsonSchema` y referencias por `ObjectId`
- **Diagrama ER**: imagen con las relaciones en notación crow's foot
- **JSON Schema**: esquema draft-07 para validar documentos
- **Java JPA**: clases con `@Entity`, `@ManyToMany`, getters y setters

### Paso 3 — Ampliar el modelo

Sin perder lo anterior, escribe un segundo prompt:

> *"Los estudiantes también tienen un tutor que es un profesor.
> Los profesores tienen nombre, email y departamento."*

El modelo se **fusiona** automáticamente: se incrementa la versión (v2),
el historial guarda la versión anterior y se añade la entidad `Profesor`.

### Paso 4 — Descargar todo

Pulsa **"⬇ Descargar todo"** para obtener un ZIP con:

```
modelgen_v2.zip
├── modelo.json
├── schema.sql
├── mongodb.js
├── diagrama.puml
├── jsonschema.json
└── java_entities.java
```

### Paso 5 — Reiniciar

Pulsa **"↺ Reiniciar"** para empezar con un nuevo sistema desde cero.

---

## Estructura del proyecto

```
modelgen/
├── server.js              # Servidor Express: endpoints API y codificación PlantUML
├── package.json
├── .env                   # GROQ_API_KEY (ignorado por git)
├── src/
│   ├── parser.js          # Llama a Groq y extrae el modelo JSON (con reintentos)
│   ├── merger.js          # Fusiona modelos, gestiona versiones e historial
│   └── generators/
│       ├── mysql.js       # Genera SQL (CREATE TABLE, FK, many-to-many)
│       ├── mongodb.js     # Genera schema MongoDB con $jsonSchema
│       ├── plantuml.js    # Genera código PlantUML en notación ER
│       ├── jsonschema.js  # Genera JSON Schema draft-07
│       └── java.js        # Genera clases Java con anotaciones JPA
└── public/
    ├── index.html         # Interfaz: panel chat + panel de pestañas
    ├── style.css          # Tema oscuro (#1a1a2e / #16213e / #0f3460)
    └── app.js             # Lógica frontend: fetch, tabs, highlight, ZIP
```

---

## Endpoints de la API

| Método | Ruta            | Descripción                                      |
|--------|-----------------|--------------------------------------------------|
| POST   | `/api/prompt`   | Procesa texto NL → modelo JSON (fusionado)       |
| POST   | `/api/generate` | Genera todos los artefactos desde el modelo      |
| GET    | `/api/diagrama` | Renderiza PlantUML → PNG (proxy a plantuml.com)  |
| POST   | `/api/reset`    | Reinicia el modelo en memoria del servidor       |

---

## Tecnologías utilizadas

- **Node.js + Express** — servidor web y API REST
- **Groq API (LLaMA 3.3-70b-versatile)** — procesamiento de lenguaje natural
- **PlantUML** — generación y renderizado de diagramas ER
- **JSON Schema draft-07** — esquema de validación estándar
- **MySQL** — generación de DDL relacional
- **MongoDB $jsonSchema** — esquema documental con validación
- **Java JPA** — clases de entidad con anotaciones de mapeo O/R
- **JSZip** — empaquetado de artefactos en ZIP desde el navegador

---

## Solución de problemas

**Error: `GROQ_API_KEY no configurada`**
→ Edita el fichero `.env` y añade tu clave.

**El diagrama no aparece**
→ Comprueba la conexión a internet. El renderizado usa `plantuml.com`.

**La IA devuelve texto en lugar de JSON**
→ El sistema reintenta hasta 3 veces automáticamente. Si falla, simplifica el prompt.

---

## Autor

**Miguel Barranquero Díez** — Máster Universitario en Ingeniería Informática,
Universidad de Salamanca.

## Licencia

MIT. Ver [LICENSE](LICENSE).

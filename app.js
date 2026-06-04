// app.js
// API REST per gestire corsi con salvataggio su file JSON (courses.json)
// Requisiti implementati:
// - CRUD completo per i corsi
// - Dati salvati in courses.json (creato automaticamente se non esiste)
// - Endpoint:
//    POST  /api/courses        -> aggiungi nuovo corso
//    GET   /api/courses        -> ottieni tutti i corsi
//    GET   /api/courses/:id    -> ottieni un corso specifico
//    PUT   /api/courses/:id    -> aggiorna un corso esistente
//    DELETE /api/courses/:id    -> elimina un corso
// - Endpoint aggiuntivo:
//    GET /api/courses/stats   -> statistiche sui corsi
// - Ogni corso: id (auto-increment), name, description, target_date (YYYY-MM-DD),
//   status (Non Iniziato, In Corso, Completato), created_at (timestamp)
// - Gestione errori: campi mancanti, corso non trovato, stato non valido,
//   errori di lettura/scrittura del file
// - Commenti utili per principianti
// - Porta server: 5000

'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

// ---------- Configurazione di base ----------
const app = express();
app.use(express.json()); // per leggere JSON nel body delle richieste

// Percorso del file JSON che conterrà i corsi
const DATA_FILE = path.join(__dirname, 'courses.json');

// Stati validi (italiano, come richiesto)
const VALID_STATUSES = ['Non Iniziato', 'In Corso', 'Completato'];

// Mappa da stato italiano a inglese per le statistiche
const STATUS_ENGLISH = {
  'Non Iniziato': 'Not Started',
  'In Corso': 'In Progress',
  'Completato': 'Completed'
};

// ---------- Funzioni helper per leggere/scrivere i dati ----------
async function ensureDataFile() {
  // Crea il file courses.json se non esiste (viene inizializzato con un array vuoto)
  try {
    await fs.promises.access(DATA_FILE, fs.constants.F_OK);
    // Il file esiste già, non fare nulla
  } catch (err) {
    // Il file non esiste: crealo con un array vuoto
    await fs.promises.writeFile(DATA_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

async function readCourses() {
  // Legge l'array di corsi dal file
  try {
    const content = await fs.promises.readFile(DATA_FILE, 'utf8');
    // Se per qualche motivo il contenuto è vuoto, trattalo come array vuoto
    if (!content) return [];
    const data = JSON.parse(content);
    // Assicurati che sia un array
    if (!Array.isArray(data)) throw new Error('Formato dati invalido');
    return data;
  } catch (err) {
    // Propaga l'errore al chiamante
    throw err;
  }
}

async function writeCourses(courses) {
  // Scrive un array di corsi nel file JSON
  try {
    await fs.promises.writeFile(DATA_FILE, JSON.stringify(courses, null, 2), 'utf8');
  } catch (err) {
    throw err;
  }
}

// Reperimento rapido di un corso per ID
function findCourseIndexById(courses, id) {
  return courses.findIndex((c) => c.id === id);
}

// Validation helper per i campi obbligatori e formati
function validateCoursePayload(payload, requireAll = true) {
  // Se requireAll è vero, controlla tutti i campi: name, description, target_date, status
  // Se false, si usa per update dove alcuni campi potrebbero essere opzionali
  const errors = [];

  if (requireAll || payload.name !== undefined) {
    if (!payload.name) errors.push('name is required');
  }
  if (requireAll || payload.description !== undefined) {
    if (!payload.description) errors.push('description is required');
  }
  if (requireAll || payload.target_date !== undefined) {
    if (!payload.target_date) errors.push('target_date is required');
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.target_date)) {
      errors.push('target_date must be in YYYY-MM-DD');
    }
  }
  if (requireAll || payload.status !== undefined) {
    if (!payload.status) errors.push('status is required');
    else if (!VALID_STATUSES.includes(payload.status)) {
      errors.push('status must be one of "Non Iniziato", "In Corso" o "Completato"');
    }
  }

  return errors;
}

// ---------- Rotte API (CRUD) ----------

// POST /api/courses - Aggiungi un nuovo corso
app.post('/api/courses', async (req, res) => {
  try {
    const { name, description, target_date, status } = req.body;

    // Validazione dei campi obbligatori e formati
    const errors = validateCoursePayload({ name, description, target_date, status }, true);
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    // Leggi i corsi esistenti per calcolare l'ID auto-incrementale
    let courses;
    try {
      courses = await readCourses();
    } catch (err) {
      return res.status(500).json({ error: 'Failed to read courses' });
    }

    const maxId = courses.length > 0 ? Math.max(...courses.map((c) => c.id)) : 0;
    const newCourse = {
      id: maxId + 1,
      name,
      description,
      target_date,
      status,
      created_at: new Date().toISOString(),
    };

    courses.push(newCourse);

    try {
      await writeCourses(courses);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to write courses' });
    }

    return res.status(201).json(newCourse);
  } catch (err) {
    // Sicurezza: cattura errori inaspettati
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/courses - Ottieni tutti i corsi
app.get('/api/courses', async (req, res) => {
  try {
    const courses = await readCourses();
    return res.json(courses);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read courses' });
  }
});

// GET /api/courses/:id - Ottieni un corso specifico
app.get('/api/courses/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid course id' });
  }

  try {
    const courses = await readCourses();
    const course = courses.find((c) => c.id === id);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }
    return res.json(course);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read courses' });
  }
});

// PUT /api/courses/:id - Aggiorna un corso
app.put('/api/courses/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid course id' });
  }

  // Per l'aggiornamento richiediamo esplicitamente tutti i campi
  const { name, description, target_date, status } = req.body;
  const payload = { name, description, target_date, status };

  // Validazione completa dei campi forniti
  const errors = validateCoursePayload(payload, true);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  try {
    const courses = await readCourses();
    const idx = findCourseIndexById(courses, id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Aggiorna i campi nel corso esistente; mantieni created_at intatto
    courses[idx] = {
      ...courses[idx],
      name,
      description,
      target_date,
      status,
    };

    await writeCourses(courses);
    return res.json(courses[idx]);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update course' });
  }
});

// DELETE /api/courses/:id - Elimina un corso
app.delete('/api/courses/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid course id' });
  }

  try {
    const courses = await readCourses();
    const idx = findCourseIndexById(courses, id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const deletedCourse = courses.splice(idx, 1)[0];
    await writeCourses(courses);
    return res.json({ message: 'Course deleted', course: deletedCourse });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete course' });
  }
});

// Nuovo endpoint: GET /api/courses/stats
// Restituisce statistiche sui corsi
app.get('/api/courses/stats', async (req, res) => {
  try {
    const courses = await readCourses();
    const total = courses.length;

    // Conta per status italiano, poi mappa ai nomi in inglese
    const countsEng = {
      'Not Started': 0,
      'In Progress': 0,
      'Completed': 0
    };

    for (const c of courses) {
      const eng = STATUS_ENGLISH[c.status];
      if (eng) {
        countsEng[eng] = (countsEng[eng] ?? 0) + 1;
      }
    }

    // Preparazione dati in formato utile per i client
    const statusesArray = [
      { status: 'Not Started', count: countsEng['Not Started'] },
      { status: 'In Progress', count: countsEng['In Progress'] },
      { status: 'Completed', count: countsEng['Completed'] }
    ];

    return res.json({
      total,
      by_status: countsEng,
      statuses: statusesArray
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to compute statistics' });
  }
});

// ---------- Avvio del server ----------
const PORT = 5000;

// Prima di avviare, assicuriamoci che il file dati esista
(async () => {
  try {
    await ensureDataFile();
    app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Errore durante l\'inizializzazione dei dati:', err);
    process.exit(1);
  }
})();
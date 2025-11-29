/* app.js
 - Handles: local storage, camera capture, OCR with Tesseract, rendering shelf, modal viewing,
   export/import, PWA service worker registration
*/

const fileInput = document.getElementById('fileInput');
const addBookBtn = document.getElementById('addBookBtn');
const shelfTop = document.getElementById('shelfTop');
const shelfBottom = document.getElementById('shelfBottom');
const emptyHint = document.getElementById('emptyHint');
const modal = document.getElementById('modal');
const modalBody = document.getElementById('modalBody');
const modalClose = document.getElementById('modalClose');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const syncToggle = document.getElementById('syncToggle');

const STORAGE_KEY = 'redwoods_bookshelf_v1';

// in-memory list
let books = loadBooks();

/* Utility: random cover color */
function randomCoverColor(i=0){
  const palette = ['#c94b4b','#d77a2b','#6b9f6b','#4b7db5','#9053a3','#d95ca1','#7a5b3a'];
  return palette[i % palette.length];
}

/* Load & Save */
function loadBooks(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return [];
    return JSON.parse(raw);
  } catch(e){
    console.error('Failed to load books', e);
    return [];
  }
}
function saveBooks(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
}

/* Decide which shelf to place a book on */
function placeBookElement(bookElement, index) {
  if (index < 10) {
    shelfTop.appendChild(bookElement);
  } else {
    shelfBottom.appendChild(bookElement);
  }
}
/* Render shelf */
function renderBooks() {
  shelfTop.innerHTML = '';
  shelfBottom.innerHTML = '';

  if (books.length === 0) {
    emptyHint.style.display = 'block';
  } else {
    emptyHint.style.display = 'none';
  }

  books.forEach((b, idx) => {
    const el = document.createElement('div');
    el.className = 'book';
    el.style.background = `linear-gradient(180deg, ${b.cover} 0%, rgba(0,0,0,0.08) 100%)`;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', b.title || 'Note book');

    // label
    const label = document.createElement('div');
    label.className = 'bookLabel';
    label.textContent = b.title || (b.excerpt ? b.excerpt.substring(0, 18) : `Note ${idx+1}`);
    el.appendChild(label);

    // open on click
    el.addEventListener('click', () => openBook(idx));

    // place on top or bottom shelf depending on index
    placeBookElement(el, idx);
  });
}

  books.forEach((b, idx) => {
    const el = document.createElement('div');
    el.className = 'book';
    el.style.background = `linear-gradient(180deg, ${b.cover} 0%, rgba(0,0,0,0.08) 100%)`;
    el.setAttribute('role','button');
    el.setAttribute('aria-label', b.title || 'Note book');

    // small label
    const label = document.createElement('div');
    label.className = 'bookLabel';
    label.textContent = b.title || (b.excerpt ? b.excerpt.substring(0,18) : `Note ${idx+1}`);
    el.appendChild(label);

    // open on click
    el.addEventListener('click', () => openBook(idx));
    shelf.appendChild(el);
  });
}

/* Open book modal */
function openBook(idx){
  const b = books[idx];
  modalBody.innerHTML = '';
  // show image
  if(b.image){
    const img = document.createElement('img');
    img.src = b.image;
    modalBody.appendChild(img);
  }
  // show text (OCR result)
  const heading = document.createElement('h3');
  heading.textContent = b.title || 'Note';
  modalBody.appendChild(heading);

  if(b.text){
    const p = document.createElement('pre');
    p.textContent = b.text;
    modalBody.appendChild(p);
  } else {
    const p2 = document.createElement('p');
    p2.textContent = 'No recognized text found. You can add/edit below.';
    modalBody.appendChild(p2);
  }

  // editable text area to save manual edits
  const textarea = document.createElement('textarea');
  textarea.style.width = '100%';
  textarea.style.minHeight = '150px';
  textarea.value = b.text || '';
  modalBody.appendChild(textarea);

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save Text';
  saveBtn.style.marginTop = '12px';
  saveBtn.addEventListener('click', () => {
    b.text = textarea.value;
    b.title = (textarea.value || '').split('\n')[0].slice(0,30) || b.title;
    saveBooks();
    renderBooks();
    alert('Saved');
  });
  modalBody.appendChild(saveBtn);

  // delete button
  const delBtn = document.createElement('button');
  delBtn.textContent = 'Delete Book';
  delBtn.style.marginLeft = '8px';
  delBtn.addEventListener('click', () => {
    if(confirm('Delete this book?')) {
      books.splice(idx,1);
      saveBooks(); renderBooks(); closeModal();
    }
  });
  modalBody.appendChild(delBtn);

  modal.setAttribute('aria-hidden','false');
}

/* close modal */
function closeModal(){
  modal.setAttribute('aria-hidden','true');
}

/* Add new book flow: open camera, receive file, do OCR and store */
async function handleFile(file){
  // show temporary loader
  const tempId = Date.now();
  const cover = randomCoverColor(books.length);
  const placeholder = {
    id: tempId,
    title: 'Scanning...',
    cover,
    image: null,
    text: '',
    createdAt: new Date().toISOString()
  };
  books.push(placeholder);
  renderBooks();

  try {
    // convert to data URL for display/storage
    const imageData = await readFileAsDataURL(file);
    // replace placeholder image
    placeholder.image = imageData;
    placeholder.title = 'Recognizing...';
    saveBooks();
    renderBooks();

    // OCR with Tesseract
    const worker = Tesseract.createWorker({
      logger: m => {
        // optional: you could surface progress
        // console.log(m);
      }
    });
    await worker.load();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    const { data: { text } } = await worker.recognize(file);
    await worker.terminate();

    // save recognized text
    placeholder.text = text.trim();
    // use first line as title fallback
    if(!placeholder.title || placeholder.title.startsWith('Recognizing')) {
      const firstLine = (text||'').split('\n').find(l => l.trim().length>0) || 'Handwritten Note';
      placeholder.title = firstLine.slice(0,40);
    }
    saveBooks();
    renderBooks();
  } catch (err){
    console.error('capture/ocr failed', err);
    placeholder.title = 'Error (see console)';
    placeholder.image = null;
    saveBooks();
    renderBooks();
    alert('Failed to read note. See console for errors.');
  }
}

/* helper read file -> dataURL */
function readFileAsDataURL(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* Export / Import (backup) */
exportBtn.addEventListener('click', () => {
  const data = JSON.stringify(books, null, 2);
  const blob = new Blob([data], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bookshelf_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

importBtn.addEventListener('click', async () => {
  const f = document.createElement('input');
  f.type = 'file';
  f.accept = 'application/json';
  f.onchange = async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      if(!Array.isArray(parsed)) throw new Error('Invalid file');
      books = parsed;
      saveBooks(); renderBooks();
      alert('Imported successfully');
    } catch (err) {
      alert('Invalid backup file');
    }
  };
  f.click();
});

/* Add Book button triggers camera */
addBookBtn.addEventListener('click', () => {
  fileInput.click();
});
fileInput.addEventListener('change', (ev) => {
  const f = ev.target.files[0];
  if(!f) return;
  handleFile(f);
  // reset input
  fileInput.value = '';
});

/* Modal close handlers */
modalClose.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
  if(e.target === modal) closeModal();
});

/* Initial render */
renderBooks();

/* Service worker registration for PWA offline */
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').then(() => {
    console.log('SW registered');
  }).catch(e => console.warn('SW failed', e));
}

/* OPTIONAL: Sync toggle - placeholder for cloud implementation (Firebase) */
syncToggle.addEventListener('change', (e) => {
  if(e.target.checked){
    alert('Cloud sync is optional. To enable it, you must set up a Firebase project and drop your config into the script (see README instructions).');
  } else {
    // turn off sync behavior if implemented
  }
});

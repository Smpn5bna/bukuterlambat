// v8.3 script - import, manage students, send to Google Sheets, charts, CSV/PDF exports
const sheetURL = "https://script.google.com/macros/s/AKfycbxXzaSjXzn2KLDVb6eHI46r4_AJzbY6uDEJaA5my0yfaWtA4OU3VD6VC69gvUjtm7Aubg/exec";

let students = JSON.parse(localStorage.getItem('lts_students')||'[]'); // array of {id,name,klass}
let lateness = JSON.parse(localStorage.getItem('lts_lateness')||'[]'); // array of {id,name,klass,date,time,reason}

// save to localStorage
function saveAll() {
  localStorage.setItem('lts_students', JSON.stringify(students));
  localStorage.setItem('lts_lateness', JSON.stringify(lateness));
}

// toast helper
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(()=>t.classList.add('hidden'), 2500);
}

// import button handler
document.getElementById('importBtn').addEventListener('click', function() {
  const f = document.getElementById('fileInput').files[0];
  if(!f) return alert('Pilih file CSV atau Excel terlebih dahulu');
  const reader = new FileReader();
  reader.onload = function(e) {
    let data, wb;
    try {
      data = new Uint8Array(e.target.result);
      wb = XLSX.read(data, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header:1, raw:false });
      rows.forEach(function(r) {
        if(r.length >= 2) {
          const name = String(r[0]).trim();
          const klass = String(r[1]).trim();
          if(name && klass) students.push({ id: Date.now()+Math.random(), name: name, klass: klass });
        }
      });
      saveAll(); renderAll(); toast('Import Excel selesai');
      return;
    } catch(err) {
      // try parsing as text (CSV)
    }
    // fallback for CSV text
    const text = e.target.result;
    const lines = text.split(/\\r?\\n/).map(l=>l.trim()).filter(Boolean);
    lines.forEach(function(line) {
      const parts = line.split(/\\t|,|;|\\s{2,}|\\s+/).filter(Boolean);
      if(parts.length >= 2) {
        const klass = parts.pop();
        const name = parts.join(' ');
        students.push({ id: Date.now()+Math.random(), name: name, klass: klass });
      }
    });
    saveAll(); renderAll(); toast('Import CSV selesai');
  };
  // try as arraybuffer first
  reader.readAsArrayBuffer(f);
});

// add student manually
document.getElementById('addStudent').addEventListener('click', function() {
  const name = document.getElementById('newName').value.trim();
  const klass = document.getElementById('newClass').value.trim();
  if(!name || !klass) return alert('Isi nama dan kelas');
  students.push({ id: Date.now()+Math.random(), name: name, klass: klass });
  document.getElementById('newName').value = ''; document.getElementById('newClass').value = '';
  saveAll(); renderAll(); toast('Siswa ditambahkan');
});

// clear students
document.getElementById('clearStudents').addEventListener('click', function() {
  if(!confirm('Hapus semua data siswa?')) return;
  students = []; saveAll(); renderAll(); toast('Semua siswa dihapus');
});

// render functions
function renderAll() {
  renderClassSummary();
  renderStudentList();
  populateClassSelects();
  renderLatenessTable();
  updateCharts();
}

function renderClassSummary() {
  const counts = {};
  students.forEach(s => counts[s.klass] = (counts[s.klass]||0) + 1);
  const el = document.getElementById('classSummary');
  if(Object.keys(counts).length === 0) {
    el.innerHTML = '<div class="summary">Belum ada data siswa.</div>'; return;
  }
  el.innerHTML = Object.entries(counts).map(function(kv){ return '<div><strong>'+kv[0]+'</strong>: '+kv[1]+' siswa</div>'; }).join('');
}

function renderStudentList() {
  const wrap = document.getElementById('studentList'); wrap.innerHTML = '';
  students.forEach(function(s,i){
    const div = document.createElement('div');
    div.className = 'student-item';
    div.innerHTML = '<span>'+escapeHtml(s.klass)+' - '+escapeHtml(s.name)+'</span><div><button data-i="'+i+'" class="delStu">Hapus</button></div>';
    wrap.appendChild(div);
  });
}

// delete student handler
document.getElementById('studentList').addEventListener('click', function(e){
  if(e.target.classList.contains('delStu')){
    const i = Number(e.target.dataset.i);
    if(confirm('Hapus siswa ini?')) {
      students.splice(i,1); saveAll(); renderAll(); toast('Siswa dihapus');
    }
  }
});

// populate class selects
function populateClassSelects() {
  const set = Array.from(new Set(students.map(s=>s.klass))).sort();
  const selectClass = document.getElementById('selectClass');
  const filterClass = document.getElementById('filterClass');
  selectClass.innerHTML = '<option value="">-- Pilih Kelas --</option>';
  filterClass.innerHTML = '<option value="">Semua Kelas</option>';
  set.forEach(function(k){ selectClass.innerHTML += '<option value="'+k+'">'+k+'</option>'; filterClass.innerHTML += '<option value="'+k+'">'+k+'</option>'; });
  selectClass.addEventListener('change', function(){ populateStudents(selectClass.value); });
}

function populateStudents(klass) {
  const sel = document.getElementById('selectStudent'); sel.innerHTML = '<option value="">-- Pilih Siswa --</option>';
  students.filter(s=>s.klass===klass).forEach(function(s){ sel.innerHTML += '<option value="'+s.id+'">'+escapeHtml(s.name)+'</option>'; });
}

// set automatic date/time inputs
function setNow() {
  const now = new Date();
  document.getElementById('tanggal').value = now.toISOString().slice(0,10);
  document.getElementById('jam').value = now.toTimeString().slice(0,5);
}
setNow(); setInterval(setNow, 30*1000);

// Save lateness and send to Google Sheets
document.getElementById('saveBtn').addEventListener('click', function(){
  const sid = document.getElementById('selectStudent').value; if(!sid) return alert('Pilih siswa dulu!');
  const s = students.find(function(x){ return String(x.id)===String(sid); }); if(!s) return alert('Siswa tidak ditemukan');
  const date = document.getElementById('tanggal').value; const time = document.getElementById('jam').value; const reason = document.getElementById('reason').value||'';
  const rec = { id: Date.now()+Math.random(), name: s.name, klass: s.klass, date: date, time: time, reason: reason };
  lateness.unshift(rec); saveAll(); renderLatenessTable(); updateCharts(); toast('Keterlambatan dicatat');
  // send to Google Sheets (POST) - use no-cors to avoid preflight
  try {
    fetch(sheetURL, { method: 'POST', mode: 'no-cors', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ nama: s.name, kelas: s.klass, alasan: reason, tanggal: date, jam: time }) });
  } catch(e) { console.warn('Send failed', e); }
});

// render lateness table
function renderLatenessTable(list) {
  const data = list || lateness;
  const wrap = document.getElementById('latenessTable');
  if(!data.length) { wrap.innerHTML = '<div class="summary">Belum ada catatan keterlambatan.</div>'; return; }
  const rows = data.map(function(r,i){ return '<tr><td>'+escapeHtml(r.name)+'</td><td>'+escapeHtml(r.klass)+'</td><td>'+r.date+'</td><td>'+r.time+'</td><td>'+escapeHtml(r.reason||'')+'</td><td><button class="delLate" data-i="'+i+'">Hapus</button></td></tr>'; }).join('');
  wrap.innerHTML = '<table class="table"><thead><tr><th>Nama</th><th>Kelas</th><th>Tanggal</th><th>Jam</th><th>Alasan</th><th>Aksi</th></tr></thead><tbody>'+rows+'</tbody></table>';
}

// delete lateness handler
document.getElementById('latenessTable').addEventListener('click', function(e){
  if(e.target.classList.contains('delLate')){
    const i = Number(e.target.dataset.i);
    if(confirm('Hapus catatan?')){ lateness.splice(i,1); saveAll(); renderLatenessTable(); updateCharts(); toast('Catatan dihapus'); }
  }
});

// filters
document.getElementById('applyFilter').addEventListener('click', function(){
  const q = (document.getElementById('searchQ').value||'').toLowerCase();
  const k = document.getElementById('filterClass').value;
  const from = document.getElementById('fromDate').value; const to = document.getElementById('toDate').value;
  let data = lateness.slice();
  if(q) data = data.filter(function(r){ return (r.name||'').toLowerCase().includes(q) || (r.reason||'').toLowerCase().includes(q); });
  if(k) data = data.filter(function(r){ return r.klass===k; });
  if(from) data = data.filter(function(r){ return r.date>=from; });
  if(to) data = data.filter(function(r){ return r.date<=to; });
  renderLatenessTable(data);
});
document.getElementById('resetFilter').addEventListener('click', function(){ document.getElementById('searchQ').value=''; document.getElementById('filterClass').value=''; document.getElementById('fromDate').value=''; document.getElementById('toDate').value=''; renderLatenessTable(); });

// export CSV
document.getElementById('exportCsv').addEventListener('click', function(){
  if(!lateness.length) return toast('Belum ada data');
  const rows = [['Nama','Kelas','Tanggal','Jam','Alasan']].concat(lateness.map(function(r){ return [r.name,r.klass,r.date,r.time,r.reason||'']; }));
  const csv = rows.map(function(r){ return r.map(function(c){ return '\"'+String(c).replace(/\"/g,'\"\"')+'\"'; }).join(','); }).join('\\n');
  const blob = new Blob([csv],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='keterlambatan.csv'; a.click(); URL.revokeObjectURL(a.href); toast('CSV diekspor');
});

// monthly CSV
document.getElementById('exportMonthlyCsv').addEventListener('click', function(){
  if(!lateness.length) return toast('Belum ada data');
  const byMonth = {}; lateness.forEach(function(r){ const m = r.date.slice(0,7); byMonth[m] = (byMonth[m]||0)+1; });
  const rows = [['Bulan','Jumlah']].concat(Object.entries(byMonth).sort());
  const csv = rows.map(function(r){ return r.map(function(c){ return '\"'+String(c).replace(/\"/g,'\"\"')+'\"'; }).join(','); }).join('\\n');
  const blob = new Blob([csv],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='rekap_bulanan.csv'; a.click(); URL.revokeObjectURL(a.href); toast('Rekap bulanan diunduh');
});

// download PDF
document.getElementById('downloadPdf').addEventListener('click', async function(){
  const doc = document.createElement('div'); doc.style.padding='12px'; doc.style.background='#fff'; doc.innerHTML='<h2>Rekap Keterlambatan</h2>';
  const byClass = {}; lateness.forEach(function(r){ byClass[r.klass] = (byClass[r.klass]||0)+1; });
  doc.innerHTML += '<h3>Per Kelas</h3>' + Object.entries(byClass).map(function(kv){ return '<div>'+kv[0]+': '+kv[1]+'</div>'; }).join('');
  const byMonth = {}; lateness.forEach(function(r){ const m = r.date.slice(0,7); byMonth[m] = (byMonth[m]||0)+1; });
  doc.innerHTML += '<h3>Per Bulan</h3>' + Object.entries(byMonth).sort().map(function(kv){ return '<div>'+kv[0]+': '+kv[1]+'</div>'; }).join('');
  document.body.appendChild(doc);
  const canvas = await html2canvas(doc,{scale:1.5}); const img = canvas.toDataURL('image/jpeg',0.95); const { jsPDF } = window.jspdf; const pdf = new jsPDF('p','mm','a4'); const imgProps = pdf.getImageProperties(img); const pdfWidth = pdf.internal.pageSize.getWidth()-20; const pdfHeight = (imgProps.height * pdfWidth)/imgProps.width; pdf.addImage(img,'JPEG',10,10,pdfWidth,pdfHeight); pdf.save('rekap_keterlambatan.pdf'); document.body.removeChild(doc); toast('PDF diunduh');
});

// charts
const pieCtx = document.getElementById('pieChart').getContext('2d');
const barCtx = document.getElementById('barChart').getContext('2d');
let pieChart = null, barChart = null;
function updateCharts() {
  const byClass = {}; lateness.forEach(function(r){ byClass[r.klass] = (byClass[r.klass]||0)+1; });
  const labels = Object.keys(byClass); const values = labels.map(function(l){ return byClass[l]; });
  if(pieChart) pieChart.destroy();
  pieChart = new Chart(pieCtx, { type: 'pie', data: { labels: labels, datasets: [{ data: values, backgroundColor: labels.map(()=>randColor()) }] }, options: { responsive:true } });
  const byMonth = {}; lateness.forEach(function(r){ const m = r.date.slice(0,7); byMonth[m] = (byMonth[m]||0)+1; });
  const mlabels = Object.keys(byMonth).sort(); const mvalues = mlabels.map(function(m){ return byMonth[m]; });
  if(barChart) barChart.destroy();
  barChart = new Chart(barCtx, { type: 'bar', data: { labels: mlabels, datasets: [{ label:'Keterlambatan', data: mvalues, backgroundColor:'rgba(14,165,233,0.8)' }] }, options:{ responsive:true, scales:{ y:{ beginAtZero:true } } } });
}
function randColor(){ const r=Math.floor(Math.random()*200)+30; const g=Math.floor(Math.random()*200)+30; const b=Math.floor(Math.random()*200)+30; return 'rgba('+r+','+g+','+b+',0.85)'; }
function escapeHtml(t){ return String(t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function initial(){ document.getElementById('year').textContent = new Date().getFullYear(); renderAll(); }
initial();

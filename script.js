// ====== CONFIG: ganti hanya URL ini jika perlu ======
const sheetURL = "https://script.google.com/macros/s/AKfycbx7rU80Zx1Py5kOoF9ZuYrVfNzI5XL1skaQmSXvoJKxT9AGwU8yKaR7gdr7_qeifH-WCg/exec";

// ====== state ======
let students = [];        // {id,name,klass}
let lateness = [];        // {id,name,klass,date,time,reason}
let pieChart = null, barChart = null;

// ====== UI refs ======
const el = id => document.getElementById(id);
const toastEl = el('toast');
function toast(msg){ toastEl.textContent = msg; toastEl.classList.remove('hidden'); setTimeout(()=>toastEl.classList.add('hidden'),2200); }

// ====== Load initial data from Google Sheets (expects JSON {siswa,keterlambatan}) ======
async function loadFromServer(){
  try{
    const res = await fetch(sheetURL);
    const data = await res.json();
    students = (data.siswa||[]).map((s,i)=>({ id: Date.now()+i, name: s.nama, klass: s.kelas }));
    lateness = (data.keterlambatan||[]).map((r,i)=>({ id: Date.now()+i, name: r.nama, klass: r.kelas, date: r.tanggal, time: r.jam, reason: r.alasan||'' }));
    renderAll();
    toast('Data server dimuat');
  }catch(e){
    console.warn('Load failed', e);
    // fallback to localStorage
    students = JSON.parse(localStorage.getItem('lts_students')||'[]');
    lateness = JSON.parse(localStorage.getItem('lts_lateness')||'[]');
    renderAll();
    toast('Gunakan mode lokal (offline)');
  }
}

// ====== Save helpers ======
function saveLocal(){ localStorage.setItem('lts_students', JSON.stringify(students)); localStorage.setItem('lts_lateness', JSON.stringify(lateness)); }
async function postToServer(payload){
  try{
    await fetch(sheetURL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    toast('Sinkron ke server');
  }catch(e){
    console.warn('Post failed', e);
    toast('Gagal sinkron, data disimpan lokal');
    saveLocal();
  }
}

// ====== Import CSV/Excel (simple) ======
el('importBtn').addEventListener('click', ()=>{
  const f = el('fileInput').files[0];
  if(!f) return alert('Pilih file CSV / TXT terlebih dahulu');
  const reader = new FileReader();
  reader.onload = (ev)=>{
    const text = ev.target.result;
    // split lines, support separators comma/semicolon/tab. Allow names with spaces.
    const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    lines.forEach(line=>{
      // try CSV with two columns; last column treated as class
      const parts = line.split(/[,;|\t]/).map(p=>p.trim()).filter(Boolean);
      if(parts.length>=2){
        const klass = parts.pop();
        const name = parts.join(' ');
        students.push({ id: Date.now()+Math.random(), name, klass });
      }
    });
    // push to server (replace full list)
    postToServer({ type:'uploadSiswa', siswa: students.map(s=>({ nama:s.name, kelas:s.klass })) });
    renderAll();
    el('fileInput').value='';
    toast('Import selesai');
  };
  // read as text (works for CSV/TXT)
  reader.readAsText(f,'UTF-8');
});

// ====== Add student manual ======
el('addStudent').addEventListener('click', ()=>{
  const name = el('newName').value.trim(); const klass = el('newClass').value.trim();
  if(!name||!klass) return alert('Isi nama dan kelas');
  students.push({ id: Date.now()+Math.random(), name, klass });
  el('newName').value=''; el('newClass').value='';
  postToServer({ type:'uploadSiswa', siswa: students.map(s=>({ nama:s.name, kelas:s.klass })) });
  renderAll();
});

// ====== Clear students ======
el('clearStudents').addEventListener('click', ()=>{ if(!confirm('Hapus semua siswa?')) return; students=[]; postToServer({ type:'uploadSiswa', siswa: [] }); renderAll(); });

// ====== Render helpers ======
function renderAll(){
  renderClassSummary(); renderStudentList(); populateClassSelects(); renderLatenessTable(); updateCharts(); el('year').textContent = new Date().getFullYear();
}

function renderClassSummary(){
  const counts = {}; students.forEach(s=>counts[s.klass]=(counts[s.klass]||0)+1);
  const out = Object.keys(counts).length ? Object.entries(counts).map(([k,c])=>`<div><strong>${k}</strong>: ${c} siswa</div>`).join('') : '<div class="summary">Belum ada data siswa.</div>';
  el('classSummary').innerHTML = out;
}

function renderStudentList(){
  const wrap = el('studentList'); wrap.innerHTML='';
  students.forEach((s,i)=>{ const d = document.createElement('div'); d.className='student-item'; d.innerHTML = `<span>${s.klass} — ${s.name}</span><div><button data-i="${i}" class="delStu">Hapus</button></div>`; wrap.appendChild(d); });
}
document.getElementById('studentList').addEventListener('click', (e)=>{ if(e.target.classList.contains('delStu')){ const i=Number(e.target.dataset.i); if(confirm('Hapus siswa ini?')){ students.splice(i,1); postToServer({ type:'uploadSiswa', siswa: students.map(s=>({ nama:s.name, kelas:s.klass })) }); renderAll(); } }});

// ====== Populate class selects & students by class ======
function populateClassSelects(){
  const set = Array.from(new Set(students.map(s=>s.klass))).sort();
  const selClass = el('selectClass'); const filterClass = el('filterClass');
  selClass.innerHTML = '<option value="">-- Pilih Kelas --</option>';
  filterClass.innerHTML = '<option value="">Semua Kelas</option>';
  set.forEach(k=>{ selClass.innerHTML += `<option value="${k}">${k}</option>`; filterClass.innerHTML += `<option value="${k}">${k}</option>`; });
  selClass.onchange = ()=> populateStudents(selClass.value);
}
function populateStudents(klass){
  const sel = el('selectStudent'); sel.innerHTML = '<option value="">-- Pilih Siswa --</option>';
  students.filter(s=>s.klass===klass).forEach(s=> sel.innerHTML += `<option value="${s.id}">${s.name}</option>`);
}

// ====== Auto date/time ======
function setNow(){ const now=new Date(); el('tanggal').value = now.toISOString().slice(0,10); el('jam').value = now.toTimeString().slice(0,5); }
setNow(); setInterval(setNow,30000);

// ====== Save lateness (POST single record to server) ======
el('saveBtn').addEventListener('click', async ()=>{
  const sid = el('selectStudent').value; if(!sid) return alert('Pilih siswa dulu!');
  const s = students.find(x=>String(x.id)===String(sid)); if(!s) return alert('Siswa tidak ditemukan');
  const date = el('tanggal').value; const time = el('jam').value; const reason = el('reason').value||'';
  const rec = { id: Date.now()+Math.random(), name:s.name, klass:s.klass, date, time, reason };
  // push locally and try send to server
  lateness.unshift(rec);
  postToServer({ type:'tambahTerlambat', nama: s.name, kelas: s.klass, tanggal: date, jam: time, alasan: reason, guru: '' });
  renderLatenessTable(); updateCharts(); toast('Keterlambatan dicatat');
});

// ====== Render lateness table ======
function renderLatenessTable(list=null){
  const data = list||lateness; const wrap = el('latenessTable');
  if(!data.length){ wrap.innerHTML = '<div class="summary">Belum ada catatan keterlambatan.</div>'; return; }
  const rows = data.map((r,i)=>`<tr><td>${r.name}</td><td>${r.klass}</td><td>${r.date}</td><td>${r.time}</td><td>${r.reason||''}</td><td><button class="delLate" data-i="${i}">Hapus</button></td></tr>`).join('');
  wrap.innerHTML = `<table class="table"><thead><tr><th>Nama</th><th>Kelas</th><th>Tanggal</th><th>Jam</th><th>Alasan</th><th>Aksi</th></tr></thead><tbody>${rows}</tbody></table>`;
}
el('latenessTable').addEventListener('click',(e)=>{ if(e.target.classList.contains('delLate')){ const i=Number(e.target.dataset.i); if(confirm('Hapus catatan?')){ lateness.splice(i,1); saveLocal(); renderLatenessTable(); updateCharts(); } }});

// ====== Filters ======
el('applyFilter').addEventListener('click', ()=>{
  const q = (el('searchQ').value||'').toLowerCase(); const k = el('filterClass').value; const from = el('fromDate').value; const to = el('toDate').value;
  let data = lateness.slice();
  if(q) data = data.filter(r=> (r.name||'').toLowerCase().includes(q) || (r.reason||'').toLowerCase().includes(q));
  if(k) data = data.filter(r=> r.klass===k);
  if(from) data = data.filter(r=> r.date>=from);
  if(to) data = data.filter(r=> r.date<=to);
  renderLatenessTable(data);
});
el('resetFilter').addEventListener('click', ()=>{ el('searchQ').value=''; el('filterClass').value=''; el('fromDate').value=''; el('toDate').value=''; renderLatenessTable(); });

// ====== Export CSVs ======
el('exportCsv').addEventListener('click', ()=>{
  if(!lateness.length) return toast('Belum ada data');
  const rows = [['Nama','Kelas','Tanggal','Jam','Alasan']].concat(lateness.map(r=>[r.name,r.klass,r.date,r.time,r.reason||'']));
  const csv = rows.map(r=> r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='keterlambatan.csv'; a.click(); URL.revokeObjectURL(a.href); toast('CSV diekspor');
});

el('exportMonthlyCsv').addEventListener('click', ()=>{
  if(!lateness.length) return toast('Belum ada data');
  const byMonth = {}; lateness.forEach(r=>{ const m = r.date.slice(0,7); byMonth[m]=(byMonth[m]||0)+1; });
  const rows = [['Bulan','Jumlah']].concat(Object.entries(byMonth).sort());
  const csv = rows.map(r=> r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='rekap_bulanan.csv'; a.click(); URL.revokeObjectURL(a.href); toast('Rekap bulanan diunduh');
});

// ====== Download PDF ringkasan ======
el('downloadPdf').addEventListener('click', async ()=>{
  const div = document.createElement('div'); div.style.padding='12px'; div.style.background='#fff';
  div.innerHTML = `<h2>Rekap Keterlambatan</h2>`;
  const byClass={}; lateness.forEach(r=>byClass[r.klass]=(byClass[r.klass]||0)+1);
  div.innerHTML += '<h3>Per Kelas</h3>' + Object.entries(byClass).map(([k,c])=>`<div>${k}: ${c}</div>`).join('');
  const byMonth={}; lateness.forEach(r=>{ const m=r.date.slice(0,7); byMonth[m]=(byMonth[m]||0)+1; });
  div.innerHTML += '<h3>Per Bulan</h3>' + Object.entries(byMonth).sort().map(([m,c])=>`<div>${m}: ${c}</div>`).join('');
  document.body.appendChild(div);
  const canvas = await html2canvas(div,{scale:1.5});
  const img = canvas.toDataURL('image/jpeg',0.95);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('p','mm','a4');
  const imgProps = pdf.getImageProperties(img);
  const pdfWidth = pdf.internal.pageSize.getWidth()-20;
  const pdfHeight = (imgProps.height * pdfWidth)/imgProps.width;
  pdf.addImage(img,'JPEG',10,10,pdfWidth,pdfHeight);
  pdf.save('rekap_keterlambatan.pdf');
  document.body.removeChild(div);
  toast('PDF diunduh');
});

// ====== Charts ======
const pieCtx = el('pieChart').getContext('2d'); const barCtx = el('barChart').getContext('2d');
function updateCharts(){
  const byClass={}; lateness.forEach(r=>byClass[r.klass]=(byClass[r.klass]||0)+1);
  const labels = Object.keys(byClass); const values = labels.map(l=>byClass[l]);
  if(pieChart) pieChart.destroy();
  pieChart = new Chart(pieCtx,{ type:'pie', data:{ labels, datasets:[{ data: values, backgroundColor: labels.map(()=>randColor()) }] }, options:{responsive:true} });
  const byMonth={}; lateness.forEach(r=>{ const m=r.date.slice(0,7); byMonth[m]=(byMonth[m]||0)+1; });
  const mlabels = Object.keys(byMonth).sort(); const mvalues = mlabels.map(m=>byMonth[m]);
  if(barChart) barChart.destroy();
  barChart = new Chart(barCtx,{ type:'bar', data:{ labels: mlabels, datasets:[{ label:'Keterlambatan', data: mvalues, backgroundColor:'rgba(14,165,233,0.85)' }] }, options:{responsive:true, scales:{ y:{ beginAtZero:true } }} });
}
function randColor(){ const r=Math.floor(Math.random()*200)+30; const g=Math.floor(Math.random()*200)+30; const b=Math.floor(Math.random()*200)+30; return `rgba(${r},${g},${b},0.85)`; }

// ====== init ======
function init(){ renderAll(); loadFromServer(); }
init();

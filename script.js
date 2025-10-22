const sheetURL =
  "https://script.google.com/macros/s/AKfycbxXzaSjXzn2KLDVb6eHI46r4_AJzbY6uDEJaA5my0yfaWtA4OU3VD6VC69gvUjtm7Aubg/exec";

let siswaData = [];
let keterlambatanData = [];

// 🔹 Ambil data awal dari Google Sheets
async function loadData() {
  try {
    const res = await fetch(sheetURL);
    const data = await res.json();
    siswaData = data.siswa || [];
    keterlambatanData = data.keterlambatan || [];
    renderKelas();
    renderRekap();
  } catch (e) {
    console.error(e);
    alert("Gagal memuat data dari server. Coba periksa koneksi.");
  }
}

document.getElementById("importBtn").onclick = () => {
  const file = document.getElementById("fileInput").files[0];
  if (!file) return alert("Pilih file terlebih dahulu!");
  const reader = new FileReader();
  reader.onload = (e) => {
    const lines = e.target.result.split("\n").map(l => l.trim()).filter(Boolean);
    siswaData = lines.map(line => {
      const [nama, kelas] = line.split(";").map(s => s.trim());
      return { nama, kelas };
    });
    renderKelas();
    saveDataOnline(); // Simpan otomatis ke Google Sheets
    alert("Data siswa berhasil diimpor!");
  };
  reader.readAsText(file, "UTF-8");
};

document.getElementById("addSiswaBtn").onclick = () => {
  const nama = document.getElementById("newNama").value.trim();
  const kelas = document.getElementById("newKelas").value.trim();
  if (!nama || !kelas) return alert("Isi nama dan kelas!");
  siswaData.push({ nama, kelas });
  renderKelas();
  saveDataOnline();
  document.getElementById("newNama").value = "";
  document.getElementById("newKelas").value = "";
};

function renderKelas() {
  const kelasSelect = document.getElementById("kelasSelect");
  const namaSelect = document.getElementById("namaSelect");
  const list = document.getElementById("siswaList");

  const kelasSet = [...new Set(siswaData.map(s => s.kelas))];
  kelasSelect.innerHTML = '<option value="">--Pilih Kelas--</option>' +
    kelasSet.map(k => `<option>${k}</option>`).join("");

  list.innerHTML = siswaData.map(s =>
    `${s.nama} (${s.kelas}) <button onclick="hapusSiswa('${s.nama}')">Hapus</button>`
  ).join("<br>");

  kelasSelect.onchange = () => {
    const kelasDipilih = kelasSelect.value;
    const filter = siswaData.filter(s => s.kelas === kelasDipilih);
    namaSelect.innerHTML = filter.map(s => `<option>${s.nama}</option>`).join("");
  };
}

function hapusSiswa(nama) {
  siswaData = siswaData.filter(s => s.nama !== nama);
  renderKelas();
  saveDataOnline();
}

// 🔹 Simpan semua data (siswa & keterlambatan) ke Google Sheets
async function saveDataOnline() {
  const payload = { siswa: siswaData, keterlambatan: keterlambatanData };
  await fetch(sheetURL, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

document.getElementById("submitBtn").onclick = () => {
  const kelas = document.getElementById("kelasSelect").value;
  const nama = document.getElementById("namaSelect").value;
  if (!kelas || !nama) return alert("Pilih kelas dan nama siswa!");
  const tanggal = new Date();
  const data = {
    nama,
    kelas,
    tanggal: tanggal.toLocaleDateString("id-ID"),
    jam: tanggal.toLocaleTimeString("id-ID"),
  };
  keterlambatanData.push(data);
  saveDataOnline();
  renderRekap();
  alert(`Keterlambatan ${nama} berhasil dicatat!`);
};

// 🔹 Rekap grafik & jumlah
function renderRekap() {
  const rekapInfo = document.getElementById("rekapInfo");
  rekapInfo.innerHTML = `Jumlah keterlambatan bulan ini: <b>${keterlambatanData.length}</b> siswa`;

  const ctx = document.getElementById("grafikChart").getContext("2d");
  new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"],
      datasets: [{
        label: "Jumlah Terlambat",
        data: Array(12).fill(0).map((_, i) => keterlambatanData.filter(k => 
          new Date(k.tanggal).getMonth() === i).length),
      }]
    }
  });
}

document.getElementById("downloadRekapBtn").onclick = () => {
  const csv = "Nama;Kelas;Tanggal;Jam\n" +
    keterlambatanData.map(k => `${k.nama};${k.kelas};${k.tanggal};${k.jam}`).join("\n");
  const link = document.createElement("a");
  link.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  link.download = "rekap_keterlambatan.csv";
  link.click();
};

// Jalankan saat halaman dibuka
loadData();


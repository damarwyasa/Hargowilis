import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';

// File data ada di public/data/ (di-serve apa adanya oleh Vite):
const PATH_ATAP = './data/atap_bangunan.geojson';
const PATH_DUSUN = './data/Batas_Dusun_Hargowilis.geojson';
const PATH_KALURAHAN = './data/Batas_Kalurahan_Hargowilis.geojson';
const PATH_XYZ = './tiles/{z}/{x}/{y}.webp'; // tile ada di public/tiles/{z}/{x}/{y}.webp
const NAMES = Array.from({length:14}, (_,i) => `Hargowilis ${String(i+1).padStart(2,'0')}`);
const COLORS = ['#38bdf8','#f97316','#d946ef','#84cc16','#3b82f6','#ef4444','#a855f7','#14b8a6','#10b981','#eab308','#6366f1','#fb7185','#22d3ee','#f59e0b'];
const colorOf = (name) => COLORS[Math.max(0, NAMES.indexOf(name)) % COLORS.length];
const $ = id => document.getElementById(id);
const fmtNumber = n => Number(n).toLocaleString('id-ID', {maximumFractionDigits:0});
const safe = v => String(v ?? '—').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const canonical = raw => {
  const s=String(raw??'').trim();
  const match=s.match(/(?:hargowilis\s*)?(\d{1,2})$/i);
  return match ? `Hargowilis ${match[1].padStart(2,'0')}` : s;
};
function dusunName(properties){
  if(!properties) return '';
  const key=Object.keys(properties).find(k=>k.trim().toLowerCase()==='dusun')
    || Object.keys(properties).find(k=>/dusun|pedukuhan/i.test(k));
  return key?canonical(properties[key]):'';
}
function featureCollection(json){
  if(json?.type==='FeatureCollection' && Array.isArray(json.features)) return json.features;
  if(json?.type==='Feature') return [json];
  throw new Error('Isi file bukan GeoJSON FeatureCollection/Feature yang valid');
}

// Perhitungan geometri ringan, tanpa library tambahan.
const DEG=Math.PI/180, R=6378137;
function ringArea(ring){
  if(!Array.isArray(ring)||ring.length<3) return 0;
  let s=0;
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length];
    s+=(b[0]-a[0])*DEG*(2+Math.sin(a[1]*DEG)+Math.sin(b[1]*DEG));
  }
  return Math.abs(s*R*R/2);
}
function polyArea(poly){
  if(!Array.isArray(poly)||!poly.length) return 0;
  return Math.max(0,ringArea(poly[0])-poly.slice(1).reduce((n,ring)=>n+ringArea(ring),0));
}
function geometryArea(geom){
  if(geom?.type==='Polygon')return polyArea(geom.coordinates);
  if(geom?.type==='MultiPolygon')return geom.coordinates.reduce((n,p)=>n+polyArea(p),0);
  return 0;
}
function insideRing(pt,ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    if(((a[1]>pt[1])!==(b[1]>pt[1])) && pt[0] < (b[0]-a[0])*(pt[1]-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}
function insidePolygon(pt,poly){
  return !!(poly?.length && insideRing(pt,poly[0]) && !poly.slice(1).some(r=>insideRing(pt,r)));
}
function insideGeometry(pt,g){
  if(!g || !pt)return false;
  if(g.type==='Polygon') return insidePolygon(pt,g.coordinates);
  if(g.type==='MultiPolygon')return g.coordinates.some(poly=>insidePolygon(pt,poly));
  return false;
}
function representativePoint(g){
  let polys=[];
  if(g?.type==='Polygon') polys=[g.coordinates];
  if(g?.type==='MultiPolygon') polys=g.coordinates;
  if(!polys.length)return null;
  const poly=polys.reduce((a,b)=>polyArea(a)>polyArea(b)?a:b);
  const ring=poly[0];
  if(!ring?.length)return null;
  let crossSum=0,xSum=0,ySum=0;
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],cross=a[0]*b[1]-b[0]*a[1];
    crossSum+=cross;xSum+=(a[0]+b[0])*cross;ySum+=(a[1]+b[1])*cross;
  }
  if(Math.abs(crossSum)>1e-15){
    const center=[xSum/(3*crossSum),ySum/(3*crossSum)];
    if(insidePolygon(center,poly))return center;
  }
  const xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const mid=[(minX+maxX)/2,(minY+maxY)/2];
  if(insidePolygon(mid,poly))return mid;
  for(const n of [7,15,31]) for(let iy=0;iy<n;iy++) for(let ix=0;ix<n;ix++){
    const p=[minX+(ix+.5)/n*(maxX-minX),minY+(iy+.5)/n*(maxY-minY)];
    if(insidePolygon(p,poly))return p;
  }
  return ring[0];
}

const map=L.map('map',{minZoom:13,maxZoom:21,zoomControl:true}).setView([-7.80,110.37],13);
map.createPane('dusunPane');map.getPane('dusunPane').style.zIndex=355;
map.createPane('atapPane');map.getPane('atapPane').style.zIndex=420;
map.createPane('kalurahanPane');map.getPane('kalurahanPane').style.zIndex=445;
const osm=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
  maxNativeZoom:19,maxZoom:21,attribution:'&copy; OpenStreetMap contributors'
}).addTo(map);
const orthofoto=L.tileLayer(PATH_XYZ,{
  minZoom:13,maxNativeZoom:19,maxZoom:21,tileSize:256,
  attribution:'Orthofoto: sesuaikan sumber dan izin penggunaan'
}).addTo(map);
const esri=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{
  maxNativeZoom:19,maxZoom:21,
  attribution:'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community'
});
function setBasemap(mode){
  [osm,orthofoto,esri].forEach(layer=>map.removeLayer(layer));
  if(mode==='esri') esri.addTo(map);
  else if(mode==='osm') osm.addTo(map);
  else {osm.addTo(map);orthofoto.addTo(map);} // OSM sebagai cadangan di luar cakupan XYZ lokal.
}
document.querySelectorAll('input[name="basemap"]').forEach(el=>{
  el.addEventListener('change',()=>{if(el.checked)setBasemap(el.value);});
});
let measureMode=null;
const bangunan=L.geoJSON(null,{
  pane:'atapPane',style:()=>({color:'#facc15',weight:1.8,fillColor:'#facc15',fillOpacity:.12}),
  onEachFeature:(feature,layer)=>{
    const index=roofItems.length+1;
    const item={feature,layer,index,area:geometryArea(feature.geometry),point:representativePoint(feature.geometry),dusun:'',searchText:''};
    layer.on('click',()=>{if(!measureMode)selectBuilding(item);});
    layer.on('mouseover',()=>{if(item!==selectedRoof)layer.setStyle({weight:3,fillOpacity:.24});});
    layer.on('mouseout',()=>{if(item!==selectedRoof)bangunan.resetStyle(layer);});
    roofItems.push(item);
  }
}).addTo(map);
const batasKalurahan=L.geoJSON(null,{
  pane:'kalurahanPane',style:{color:'#fa5478',weight:4,opacity:1,dashArray:'9 7',fillOpacity:0},
  onEachFeature:(feature,layer)=>layer.on('click',()=>{if(!measureMode)showDetail('Batas Kalurahan Hargowilis',feature.properties||{});})
}).addTo(map);
const roofItems=[];
const dusunEntries=new Map();
let selectedRoof=null, selectedDusun='', dusunOpacity=.40, loadedAtap=false, loadedDusun=false, loadedKalurahan=false;
let legendExpanded=false;
const loadingErrors=[];

const mqMobile=window.matchMedia('(max-width:700px)');
const workEl=$('work');
const isRail=()=>workEl.classList.contains('rail')&&!mqMobile.matches;
const openFlyout=()=>workEl.classList.add('flyout');
const closeFlyout=()=>workEl.classList.remove('flyout');
function viewTab(id){
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===id));
  document.querySelectorAll('.pane').forEach(p=>p.classList.toggle('active',p.id==='tab-'+id));
  if(mqMobile.matches) $('sidebar').classList.add('mobile-open');
  else if(isRail()) openFlyout();
}
// Klik tab: saat panel disembunyikan, klik ikon yang sedang terbuka menutup panel melayang.
document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{
  if(isRail()&&workEl.classList.contains('flyout')&&btn.classList.contains('active')){closeFlyout();return;}
  viewTab(btn.dataset.tab);
}));
$('sidebarToggle').addEventListener('click',()=>$('sidebar').classList.toggle('mobile-open'));

// Sembunyikan / tampilkan panel samping (desktop).
function applyRail(on){
  workEl.classList.toggle('rail',on);
  closeFlyout();
  const b=$('railToggle');
  b.setAttribute('aria-expanded',String(!on));
  b.setAttribute('aria-label',on?'Tampilkan panel':'Sembunyikan panel');
}
function setRail(on){
  const left0=$('map').getBoundingClientRect().left;
  applyRail(on);
  const left1=$('map').getBoundingClientRect().left;
  map.invalidateSize({pan:false});
  // jaga agar isi peta tidak "melompat" saat lebar panel berubah
  if(left1!==left0) map.panBy([left1-left0,0],{animate:false});
  try{localStorage.setItem('panelRail',on?'1':'0');}catch(err){}
}
$('railToggle').addEventListener('click',()=>{
  if(mqMobile.matches){$('sidebar').classList.remove('mobile-open');return;}
  setRail(!workEl.classList.contains('rail'));
});
$('flyClose').addEventListener('click',closeFlyout);
// Tutup panel melayang saat klik di luar panel (kontrol zoom/legenda tidak menutup) atau tekan Esc.
document.addEventListener('pointerdown',e=>{
  if(!isRail()||!workEl.classList.contains('flyout'))return;
  if(e.target.closest('#sidebar,.leaflet-control'))return;
  closeFlyout();
},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&isRail())closeFlyout();});
try{if(localStorage.getItem('panelRail')==='1')applyRail(true);}catch(err){}
function showDetail(title,props,extra=''){
  const keys=Object.keys(props||{});
  $('detail').innerHTML=`<div class="info-title">${safe(title)}</div>${extra?`<p class="hint">${safe(extra)}</p>`:''}`+
    (keys.length?`<table class="attrtable">${keys.map(k=>`<tr><th>${safe(k)}</th><td>${safe(props[k])}</td></tr>`).join('')}</table>`:
    '<div class="empty">Tidak ada atribut yang tersedia pada objek ini.</div>');
  viewTab('informasi');
}
function buildingTitle(item){
  const p=item.feature.properties||{};
  const key=Object.keys(p).find(k=>/^(id|fid|id_bangunan|kode_bangunan|namobj|nama_bangunan)$/i.test(k));
  const v=key?p[key]:null;
  return v!==null && v!==undefined && String(v).trim()!=='' ? `Bangunan ${String(v)}` : `Poligon ${item.index}`;
}
function selectBuilding(item){
  if(selectedRoof)bangunan.resetStyle(selectedRoof.layer);
  selectedRoof=item;
  if(!map.hasLayer(bangunan)){$('toggleAtap').checked=true;bangunan.addTo(map);updateLegend();}
  item.layer.setStyle({color:'#f43f5e',weight:3.3,fillColor:'#facc15',fillOpacity:.28});
  item.layer.bringToFront();
  map.fitBounds(item.layer.getBounds(),{padding:[70,70],maxZoom:19});
  showDetail(buildingTitle(item),item.feature.properties||{},
    `Dusun (perkiraan spasial): ${item.dusun||'Belum teridentifikasi'} • Luas horizontal (perkiraan): ${fmtNumber(item.area)} m²`);
}
function styleDusun(name){return {color:colorOf(name),weight:2.5,opacity:1,fillColor:colorOf(name),fillOpacity:dusunOpacity};}
function ensureDusun(name){
  if(!dusunEntries.has(name))dusunEntries.set(name,{name,layers:[],features:[],count:0,visible:true});
  return dusunEntries.get(name);
}
function addDusun(feature){
  const name=dusunName(feature.properties);
  if(!name) return;
  const e=ensureDusun(name);
  const geo=L.geoJSON(feature,{
    pane:'dusunPane',style:styleDusun(name),
    onEachFeature:(f,layer)=>{
      layer.bindTooltip(name,{permanent:true,direction:'center',className:'dusun-label',opacity:.93});
      layer.on('click',()=>{if(!measureMode)showDetail(name,f.properties||{},'Klik batang pada tab Statistik untuk mencari bangunan di dusun ini.');});
    }
  }).addTo(map);
  e.layers.push(geo);e.features.push(feature);
}
function allDusunBounds(){
  const bounds=L.latLngBounds([]);
  dusunEntries.forEach(e=>e.layers.forEach(ly=>bounds.extend(ly.getBounds())));
  return bounds;
}
function setDusunVisible(name,visible){
  const e=dusunEntries.get(name); if(!e)return;
  e.visible=visible;
  e.layers.forEach(ly=>visible?ly.addTo(map):map.removeLayer(ly));
  const check=document.getElementById('cb-'+name.replaceAll(' ','-'));
  if(check)check.checked=visible;
  updateMasterCheckbox();updateLegend();
}
function updateMasterCheckbox(){
  const entries=Array.from(dusunEntries.values()), count=entries.filter(e=>e.visible).length;
  $('toggleAllDusun').checked=entries.length>0 && count===entries.length;
  $('toggleAllDusun').indeterminate=count>0 && count<entries.length;
  $('dusunCheckedCount').textContent=`${count}/${entries.length}`;
}
function buildDusunControls(){
  const holder=$('dusunOptions');holder.innerHTML='';
  const list=Array.from(dusunEntries.keys()).sort((a,b)=>a.localeCompare(b,'id',{numeric:true}));
  list.forEach(name=>{
    const line=document.createElement('label');line.className='option';
    const cb=document.createElement('input');cb.type='checkbox';cb.checked=dusunEntries.get(name).visible;
    cb.id='cb-'+name.replaceAll(' ','-');cb.addEventListener('change',()=>setDusunVisible(name,cb.checked));
    const sw=document.createElement('span');sw.className='swatch';sw.style.background=colorOf(name)+'66';sw.style.borderColor=colorOf(name);
    const txt=document.createElement('span');txt.textContent=name;txt.className='grow';
    line.append(cb,sw,txt);holder.appendChild(line);
  });
  updateMasterCheckbox();
}
$('toggleAllDusun').addEventListener('change',e=>{
  // Simpan pilihan sebelum checkbox induk diperbarui oleh sinkronisasi anak.
  const turnOn=e.target.checked;
  dusunEntries.forEach(entry=>setDusunVisible(entry.name,turnOn));
});
$('collapseDusun').addEventListener('click',()=>{
  const el=$('dusunOptions');const closed=el.classList.toggle('collapsed');
  $('collapseDusun').textContent=closed?'▸':'▾';$('collapseDusun').setAttribute('aria-expanded',String(!closed));
});
[
  ['toggleAtap',bangunan],['toggleKalurahan',batasKalurahan]
].forEach(([id,layer])=>$(id).addEventListener('change',e=>{
  e.target.checked?layer.addTo(map):map.removeLayer(layer);
  updateLegend();
}));

const legend=L.control({position:'bottomright'});
legend.onAdd=()=>{
  const div=L.DomUtil.create('div','legend');div.id='legendBox';
  div.innerHTML='<div class="legend-head"><strong>LEGENDA PETA</strong>'+
    '<button type="button" class="legend-toggle" id="legendToggle" aria-expanded="true" aria-label="Sembunyikan legenda" title="Sembunyikan / tampilkan legenda">'+
    '<svg class="ico ic-min" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>'+
    '<svg class="ico ic-list" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></svg>'+
    '</button></div><div id="legendBody"></div>';
  L.DomEvent.disableClickPropagation(div);L.DomEvent.disableScrollPropagation(div);
  return div;
};
legend.addTo(map);
// Minimalkan / tampilkan legenda (posisi tetap kanan bawah).
function setLegendMin(on){
  $('legendBox').classList.toggle('min',on);
  const b=$('legendToggle');
  b.setAttribute('aria-expanded',String(!on));
  b.setAttribute('aria-label',on?'Tampilkan legenda':'Sembunyikan legenda');
  try{localStorage.setItem('legendMin',on?'1':'0');}catch(err){}
}
$('legendToggle').addEventListener('click',()=>setLegendMin(!$('legendBox').classList.contains('min')));
try{if(localStorage.getItem('legendMin')==='1')setLegendMin(true);}catch(err){}
function updateLegend(){
  const selected=Array.from(dusunEntries.values()).filter(e=>e.visible);
  const parts=[];
  if(map.hasLayer(bangunan))parts.push('<div class="legend-item"><span class="ls" style="background:#facc1555;border-color:#c49508"></span>Atap Bangunan</div>');
  if(map.hasLayer(batasKalurahan) && loadedKalurahan)parts.push('<div class="legend-item"><span class="ls ls-line"></span>Batas Kalurahan</div>');
  if(selected.length){
    parts.push(`<details ${legendExpanded?'open':''} id="legendDusun"><summary>Batas Dusun (${selected.length})</summary>`);
    selected.forEach(e=>parts.push(`<div class="legend-item"><span class="ls" style="background:${colorOf(e.name)}66;border-color:${colorOf(e.name)}"></span>${safe(e.name)}</div>`));
    parts.push('</details>');
  }
  $('legendBody').innerHTML=parts.join('');
  $('legendDusun')?.addEventListener('toggle',e=>{legendExpanded=e.target.open;});
}
function updateMapLabels(){
  $('map').classList.toggle('hide-labels',map.getZoom()>16);
}
map.on('zoomend',updateMapLabels);updateMapLabels();

function updateSearchIndex(){
  roofItems.forEach(item=>{
    const p=item.feature.properties||{};
    item.searchText=(buildingTitle(item)+' '+item.dusun+' '+Object.entries(p).map(([k,v])=>k+' '+String(v??'')).join(' ')).toLocaleLowerCase('id-ID');
  });
}
function refreshFilters(){
  const select=$('dusunFilter'), old=select.value;
  select.innerHTML='<option value="">Seluruh dusun</option>';
  Array.from(dusunEntries.keys()).sort((a,b)=>a.localeCompare(b,'id',{numeric:true})).forEach(name=>{
    const opt=document.createElement('option');opt.value=name;opt.textContent=name;select.add(opt);
  });
  if(dusunEntries.has(old))select.value=old;
}
function renderSearch(){
  const query=$('searchInput').value.trim().toLocaleLowerCase('id-ID');
  selectedDusun=$('dusunFilter').value;
  const container=$('results');container.innerHTML='';
  if(!loadedAtap){$('resultInfo').textContent='Data bangunan belum terbaca';container.innerHTML='<div class="empty">Periksa file atap_bangunan.geojson.</div>';return;}
  if(!query && !selectedDusun){$('resultInfo').textContent='Siap mencari';container.innerHTML='<div class="empty">Masukkan kata kunci atau pilih dusun untuk menampilkan daftar poligon.</div>';return;}
  const matches=roofItems.filter(it=>(!selectedDusun||it.dusun===selectedDusun)&&(!query||it.searchText.includes(query)));
  $('resultInfo').textContent=`${fmtNumber(matches.length)} poligon ditemukan`;
  if(!matches.length){container.innerHTML='<div class="empty">Tidak ada poligon sesuai pencarian. Coba kata kunci lain atau reset filter.</div>';return;}
  matches.slice(0,50).forEach(it=>{
    const btn=document.createElement('button');btn.type='button';btn.className='result';
    const title=document.createElement('strong');title.textContent=buildingTitle(it);
    const sub=document.createElement('small');sub.textContent=`${it.dusun||'Dusun belum teridentifikasi'} • ± ${fmtNumber(it.area)} m²`;
    btn.append(title,sub);btn.addEventListener('click',()=>selectBuilding(it));container.append(btn);
  });
  if(matches.length>50){const more=document.createElement('p');more.className='hint';more.textContent='Menampilkan 50 hasil pertama. Persempit kata kunci agar lebih spesifik.';container.append(more);}
}
$('searchInput').addEventListener('input',renderSearch);
$('dusunFilter').addEventListener('change',renderSearch);
$('clearSearch').addEventListener('click',()=>{$('searchInput').value='';$('dusunFilter').value='';renderSearch();});
function jumpDusun(name){
  if(!dusunEntries.has(name))return;
  $('dusunFilter').value=name;$('searchInput').value='';renderSearch();
  const bounds=L.latLngBounds([]);
  dusunEntries.get(name).layers.forEach(ly=>bounds.extend(ly.getBounds()));
  if(bounds.isValid())map.fitBounds(bounds,{padding:[30,30],maxZoom:16});
  viewTab('pencarian');
}
function assignDusun(){
  if(!loadedAtap||!loadedDusun)return;
  const entries=Array.from(dusunEntries.values());entries.forEach(e=>{e.count=0;});
  roofItems.forEach(item=>{
    let found='';
    if(item.point)for(const e of entries){
      if(e.features.some(f=>insideGeometry(item.point,f.geometry))){found=e.name;break;}
    }
    item.dusun=found;
    if(found)dusunEntries.get(found).count++;
  });
  updateSearchIndex();renderSearch();renderStats();
}
function renderStats(){
  const container=$('dusunChart');container.innerHTML='';
  if(!loadedDusun || !loadedAtap){$('statsStatus').textContent='Menunggu layer poligon atap dan batas dusun...';return;}
  $('statsStatus').classList.add('ok');
  $('statsStatus').textContent='Statistik dihitung dari lokasi poligon atap dan geometri 14 dusun.';
  const entries=Array.from(dusunEntries.values()).sort((a,b)=>a.name.localeCompare(b.name,'id',{numeric:true}));
  const maxCount=Math.max(1,...entries.map(e=>e.count));
  entries.forEach(e=>{
    const btn=document.createElement('button');btn.type='button';btn.className='statbar';
    const top=document.createElement('div');top.className='top';
    const left=document.createElement('span');left.textContent=e.name;
    const right=document.createElement('strong');right.textContent=fmtNumber(e.count);
    top.append(left,right);
    const track=document.createElement('div');track.className='track';
    const fill=document.createElement('div');fill.className='fill';fill.style.width=(100*e.count/maxCount)+'%';fill.style.background=colorOf(e.name);
    track.append(fill);btn.append(top,track);
    btn.addEventListener('click',()=>jumpDusun(e.name));container.append(btn);
  });
  const assigned=entries.reduce((n,e)=>n+e.count,0);
  const missing=roofItems.length-assigned;
  $('statsUnassigned').textContent=missing>0?`${fmtNumber(missing)} poligon belum dapat dihubungkan ke dusun. Periksa cakupan dan konsistensi geometri kedua layer di QGIS.`:'Seluruh poligon berhasil dipadankan dengan batas dusun secara spasial.';
}
function renderMetrics(){
  $('metricAtap').textContent=loadedAtap?fmtNumber(roofItems.length):'—';
  $('metricDusun').textContent=loadedDusun?fmtNumber(dusunEntries.size):'—';
  const area=roofItems.reduce((n,it)=>n+it.area,0);
  $('metricLuas').textContent=loadedAtap?fmtNumber(area):'—';
}
function fitHome(){
  let bounds=null;
  if(loadedKalurahan && batasKalurahan.getLayers().length)bounds=batasKalurahan.getBounds();
  else if(loadedDusun && dusunEntries.size)bounds=allDusunBounds();
  else if(loadedAtap && roofItems.length)bounds=bangunan.getBounds();
  if(bounds?.isValid())map.fitBounds(bounds,{padding:[32,32],maxZoom:16});
}
$('homeBtn').addEventListener('click',fitHome);
function showLoadStatus(){
  const statuses=[loadedAtap?'Atap ✓':'Atap —',loadedDusun?'Dusun ✓':'Dusun —',loadedKalurahan?'Kalurahan ✓':'Kalurahan —'];
  $('mapStatus').textContent=statuses.join('  |  ')+(loadingErrors.length?'  |  Ada data gagal dimuat; periksa Console (F12).':'');
}
async function loadJSON(path){
  const response=await fetch(path,{cache:'no-store'});
  if(!response.ok)throw new Error(`${path} → HTTP ${response.status}`);
  return featureCollection(await response.json());
}
async function boot(){
  const [rAtap,rDusun,rKal]=await Promise.allSettled([
    loadJSON(PATH_ATAP),loadJSON(PATH_DUSUN),loadJSON(PATH_KALURAHAN)
  ]);
  if(rAtap.status==='fulfilled'){
    bangunan.addData({type:'FeatureCollection',features:rAtap.value});
    loadedAtap=true;updateSearchIndex();
  }else{loadingErrors.push(String(rAtap.reason));console.error('Gagal memuat bangunan:',rAtap.reason);}
  if(rDusun.status==='fulfilled'){
    rDusun.value.forEach(addDusun);
    loadedDusun=dusunEntries.size>0;
    if(!loadedDusun){loadingErrors.push('Layer batas dusun tidak memiliki field Dusun yang dapat dikenali');}
    buildDusunControls();refreshFilters();
  }else{loadingErrors.push(String(rDusun.reason));console.error('Gagal memuat dusun:',rDusun.reason);$('dusunOptions').innerHTML='<p class="hint">Batas dusun gagal dimuat. Periksa nama dan path file.</p>';}
  if(rKal.status==='fulfilled'){
    batasKalurahan.addData({type:'FeatureCollection',features:rKal.value});
    loadedKalurahan=batasKalurahan.getLayers().length>0;
  }else{loadingErrors.push(String(rKal.reason));console.error('Gagal memuat kalurahan:',rKal.reason);}
  renderMetrics();assignDusun();renderSearch();renderStats();updateLegend();showLoadStatus();fitHome();
}
// KOORDINAT WGS84 — tampilkan di atas peta dan salin saat diklik.
let lastCoordinates=null;
map.on('mousemove', e=>{
  lastCoordinates=[e.latlng.lat,e.latlng.lng];
  $('coordinates').textContent=`Lat ${e.latlng.lat.toFixed(6)}°  |  Lon ${e.latlng.lng.toFixed(6)}°  · Salin`;
});
$('coordinates').addEventListener('click',async()=>{
  if(!lastCoordinates){$('coordinates').textContent='Gerakkan kursor ke peta terlebih dahulu';return;}
  const val=lastCoordinates.map(x=>x.toFixed(6)).join(', ');
  try{
    await navigator.clipboard.writeText(val);
    $('coordinates').textContent='✓ Koordinat disalin: '+val;
  }catch(err){
    $('coordinates').textContent='Koordinat: '+val+' (pilih untuk salin manual)';
    console.warn('Salin koordinat gagal:',err);
  }
});

// PENGUKURAN JARAK DAN LUAS — pendekatan geodesik pada model bola.
map.createPane('measurePane');map.getPane('measurePane').style.zIndex=630;
const measurements=L.layerGroup().addTo(map);
let measurePoints=[];
let measurementFinal=false;
function formatDistance(m){return m>=1000?`${(m/1000).toLocaleString('id-ID',{maximumFractionDigits:3})} km`:`${m.toLocaleString('id-ID',{maximumFractionDigits:2})} m`;}
function formatArea(m2){return m2>=10000?`${(m2/10000).toLocaleString('id-ID',{maximumFractionDigits:3})} ha`:`${m2.toLocaleString('id-ID',{maximumFractionDigits:2})} m²`;}
function measureDistanceTotal(){let sum=0;for(let i=1;i<measurePoints.length;i++)sum+=map.distance(measurePoints[i-1],measurePoints[i]);return sum;}
function measureAreaTotal(){
  if(measurePoints.length<3)return 0;
  let sum=0;
  for(let i=0;i<measurePoints.length;i++){
    const a=measurePoints[i],b=measurePoints[(i+1)%measurePoints.length];
    sum+=(b.lng-a.lng)*DEG*(2+Math.sin(a.lat*DEG)+Math.sin(b.lat*DEG));
  }
  return Math.abs(sum*R*R/2);
}
function renderMeasurement(){
  measurements.clearLayers();
  measurePoints.forEach(p=>L.circleMarker(p,{pane:'measurePane',radius:5,color:'#0b6782',weight:2,fillColor:'#fff',fillOpacity:1}).addTo(measurements));
  if(measurePoints.length>=2){
    if(measureMode==='area' || (measurementFinal && lastMeasureMode==='area')){
      L.polygon(measurePoints,{pane:'measurePane',color:'#087f8c',weight:3,dashArray:'7 5',fillColor:'#14b8a6',fillOpacity:.22}).addTo(measurements);
    }else{
      L.polyline(measurePoints,{pane:'measurePane',color:'#e11d48',weight:4}).addTo(measurements);
    }
  }
  const mode=measureMode || lastMeasureMode;
  if(!mode||!measurePoints.length){$('measureInfo').textContent='Belum ada pengukuran. Pilih Ukur jarak atau Ukur luas untuk mulai.';return;}
  const value=mode==='area' ? (measurePoints.length>=3?formatArea(measureAreaTotal()):'Min. 3 titik') : formatDistance(measureDistanceTotal());
  $('measureInfo').innerHTML=`<b>${mode==='area'?'Luas':'Jarak'}: ${safe(value)}</b><br>${measurePoints.length} titik • ${measurementFinal?'Pengukuran selesai':'Klik peta untuk menambah titik, lalu tekan Selesai ukur.'}`;
}
let lastMeasureMode=null;
function startMeasure(mode){
  measureMode=mode;lastMeasureMode=mode;measurementFinal=false;measurePoints=[];
  map.doubleClickZoom.disable();
  document.querySelector('.mapwrap').classList.add('measure-active');
  $('measureDistance').classList.toggle('active-tool',mode==='distance');
  $('measureArea').classList.toggle('active-tool',mode==='area');
  renderMeasurement();viewTab('alat');
  $('measureInfo').textContent=mode==='area'?'Mode luas aktif: klik minimal 3 titik pada peta.':'Mode jarak aktif: klik minimal 2 titik pada peta.';
}
function finishMeasure(){
  if(!measureMode)return;
  const minPoints=measureMode==='area'?3:2;
  if(measurePoints.length<minPoints){$('measureInfo').textContent=`Dibutuhkan minimal ${minPoints} titik sebelum selesai.`;return;}
  measurementFinal=true;measureMode=null;
  document.querySelector('.mapwrap').classList.remove('measure-active');
  map.doubleClickZoom.enable();
  $('measureDistance').classList.remove('active-tool');$('measureArea').classList.remove('active-tool');
  renderMeasurement();
}
function clearMeasure(){
  measureMode=null;lastMeasureMode=null;measurePoints=[];measurementFinal=false;
  measurements.clearLayers();map.doubleClickZoom.enable();
  document.querySelector('.mapwrap').classList.remove('measure-active');
  $('measureDistance').classList.remove('active-tool');$('measureArea').classList.remove('active-tool');
  renderMeasurement();
}
map.on('click',e=>{if(measureMode){measurePoints.push(e.latlng);renderMeasurement();}});
$('measureDistance').addEventListener('click',()=>startMeasure('distance'));
$('measureArea').addEventListener('click',()=>startMeasure('area'));
$('measureFinish').addEventListener('click',finishMeasure);
$('measureClear').addEventListener('click',clearMeasure);

// PRINT: satu halaman A4 landscape, judul + peta (tanpa halaman statistik).
async function printMap(){
  if(document.fullscreenElement){
    try{await document.exitFullscreen();}catch(err){console.warn('Keluar fullscreen gagal:',err);}
  }
  // Tutup popup agar informasi yang kebetulan terbuka tidak menutupi peta saat cetak.
  map.closePopup();
  map.invalidateSize({pan:false});
  window.print();
}
$('printBtn').addEventListener('click',printMap);
$('printFromTools').addEventListener('click',printMap);
// Leaflet perlu menyesuaikan ukuran tile dengan lebar peta di halaman cetak.
window.addEventListener('beforeprint',()=>{map.invalidateSize({pan:false});});
window.addEventListener('afterprint',()=>setTimeout(()=>map.invalidateSize({pan:false}),150));

// FULLSCREEN PETA.
$('fullscreenBtn').addEventListener('click',async()=>{
  try{
    if(document.fullscreenElement)await document.exitFullscreen();
    else if(document.querySelector('.mapwrap').requestFullscreen)await document.querySelector('.mapwrap').requestFullscreen();
    else alert('Browser ini tidak mendukung fullscreen.');
  }catch(err){console.warn('Fullscreen tidak tersedia:',err);}
});
document.addEventListener('fullscreenchange',()=>{
  $('fullscreenBtn').textContent=document.fullscreenElement?'⛶ Keluar':'⛶ Fullscreen';
  setTimeout(()=>map.invalidateSize(),120);
});

// EKSPOR GEOMETRI hasil pencarian/filter (bukan citra orthofoto).
$('exportGeojson').addEventListener('click',()=>{
  if(!loadedAtap){alert('Data poligon belum tersedia.');return;}
  const q=$('searchInput').value.trim().toLocaleLowerCase('id-ID');
  const d=$('dusunFilter').value;
  const features=roofItems.filter(it=>(!d||it.dusun===d)&&(!q||it.searchText.includes(q))).map(it=>it.feature);
  if(!features.length){alert('Tidak ada poligon yang cocok dengan filter.');return;}
  const blob=new Blob([JSON.stringify({type:'FeatureCollection',features})],{type:'application/geo+json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='atap_hargowilis_hasil_filter.geojson';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});

orthofoto.on('tileerror',evt=>{ // Missing PNG outside the orthophoto footprint can be normal.
  if(!window._tileWarned){console.warn('Contoh tile PNG yang tidak tersedia:',evt.tile?.src);window._tileWarned=true;}
});
L.control.scale({imperial:false,metric:true}).addTo(map);
updateLegend();boot();

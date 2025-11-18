// Premium upgraded script.js — Drive fetching enabled (uses provided folder IDs & API key)
// IMPORTANT: For Drive fetch to work on GitHub Pages, your Drive files must be publicly viewable (Anyone with link).
// If Drive fetch fails (CORS or permission), script falls back to attempting direct UC links if file IDs are known.

const videoElem = document.getElementById('webcam');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');

const loader = document.getElementById('loader');
const flipBtn = document.getElementById('flipBtn');
const captureBtn = document.getElementById('captureBtn');
const jewelryMode = document.getElementById('jewelry-mode');
const subcat = document.getElementById('subcategory-buttons');
const optionsGroup = document.getElementById('jewelry-options');

let cameraInstance = null;
let facing = 'user';
let currentType = '';
let currentImage = null;
let smoothedLandmarks = null;
let smoothingFactor = 0.2;
let smoothedPoints = {};

// === USER PROVIDED DRIVE CONFIG ===
const API_KEY = "AIzaSyBhi05HMVGg90dPP91zG1RZtNxm-d6hnQw";

const driveFolders = {
  diamond_earrings: "1N0jndAEIThUuuNAJpvuRMGsisIaXCgMZ",
  diamond_necklaces: "1JGV8T03YdzjfW0Dyt9aMPybH8V9-gEhw",
  gold_earrings: "1GMZpcv4A1Gy2xiaIC1XPG_IOAt9NrDpi",
  gold_necklaces: "1QIvX-PrSVrK9gz-TEksqiKlXPGv2hsS5",
};

// show/hide loader
function setLoading(v){ loader.classList.toggle('hidden', !v); }

// load image helper
function loadImage(src){
  return new Promise((res)=>{
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = ()=>res(img);
    img.onerror = ()=>res(null);
    img.src = src;
  });
}

// fetch drive files using API key; returns array of file objects {id, name, mimeType, src}
async function fetchDriveImages(folderId){
  if(!folderId) return [];
  try{
    const q = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&key=${API_KEY}&fields=files(id,name,mimeType)`;
    const r = await fetch(q);
    const j = await r.json();
    if(!j.files) return [];
    // map to usable src (uc link)
    const files = j.files.filter(f=>f.mimeType && f.mimeType.startsWith('image/')).map(f=>{
      // preferred direct view link
      const src = `https://drive.google.com/uc?export=view&id=${f.id}`;
      return { id: f.id, name: f.name, mimeType: f.mimeType, src };
    });
    return files;
  }catch(err){
    console.warn('Drive API fetch error',err);
    return [];
  }
}

// insert thumbnails into optionsGroup
async function insertOptions(type){
  optionsGroup.innerHTML='';
  setLoading(true);
  const folder = driveFolders[type];
  const imgs = await fetchDriveImages(folder);
  if(imgs.length === 0){
    // fallback message + small hint
    const div = document.createElement('div');
    div.className = 'fallback';
    div.style.padding = '12px';
    div.style.color = '#fff';
    div.textContent = 'No images found in Drive. Make sure the folder files are "Anyone with the link - Viewer" and try again.';
    optionsGroup.appendChild(div);
    setLoading(false);
    return;
  }
  for(const f of imgs){
    const btn = document.createElement('button');
    const imgEl = document.createElement('img');
    imgEl.src = f.src;
    imgEl.alt = f.name;
    btn.appendChild(imgEl);
    btn.onclick = async ()=>{
      setLoading(true);
      const imgObj = await loadImage(f.src);
      if(imgObj){
        currentImage = imgObj;
        setTimeout(()=>setLoading(false),200);
      } else {
        alert('Failed to load image. Check file permissions (must be public).');
        setLoading(false);
      }
    };
    optionsGroup.appendChild(btn);
  }
  setLoading(false);
}

// Mediapipe setup
const faceMesh = new FaceMesh({ locateFile: (file)=>`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
faceMesh.setOptions({ maxNumFaces:1, refineLandmarks:true, minDetectionConfidence:0.6, minTrackingConfidence:0.6 });

faceMesh.onResults((results)=>{
  if(videoElem.videoWidth && videoElem.videoHeight){
    canvas.width = videoElem.videoWidth;
    canvas.height = videoElem.videoHeight;
  }
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(results.multiFaceLandmarks && results.multiFaceLandmarks.length>0){
    const newLm = results.multiFaceLandmarks[0];
    if(!smoothedLandmarks) smoothedLandmarks = newLm;
    else{
      smoothedLandmarks = smoothedLandmarks.map((prev,i)=>({ x: prev.x*(1-smoothingFactor) + newLm[i].x*smoothingFactor, y: prev.y*(1-smoothingFactor) + newLm[i].y*smoothingFactor, z: prev.z*(1-smoothingFactor) + newLm[i].z*smoothingFactor }));
    }
  } else {
    smoothedLandmarks = null;
  }
  drawOverlay();
});

// camera start
async function startCamera(){
  if(cameraInstance) cameraInstance.stop();
  cameraInstance = new Camera(videoElem,{
    onFrame: async ()=>{ await faceMesh.send({ image: videoElem }); },
    width: 1280,
    height: 720,
    facingMode: facing
  });
  cameraInstance.start();
}

// flip camera
flipBtn.addEventListener('click', ()=>{
  facing = (facing === 'user') ? 'environment' : 'user';
  startCamera();
});

// capture screenshot with watermark
captureBtn.addEventListener('click', ()=>{
  const outCanvas = document.createElement('canvas');
  outCanvas.width = canvas.width;
  outCanvas.height = canvas.height;
  const outCtx = outCanvas.getContext('2d');
  outCtx.drawImage(videoElem,0,0,outCanvas.width,outCanvas.height);
  outCtx.drawImage(canvas,0,0);
  outCtx.fillStyle = 'rgba(0,0,0,0.45)';
  outCtx.fillRect(outCanvas.width-260, outCanvas.height-74, 250, 54);
  outCtx.font = '20px Poppins';
  outCtx.fillStyle = '#ffd97d';
  outCtx.fillText('TryMyGold', outCanvas.width-200, outCanvas.height-38);
  const a = document.createElement('a');
  a.href = outCanvas.toDataURL('image/png');
  a.download = 'trymygold_capture.png';
  a.click();
});

// drawing overlay
function drawOverlay(){
  if(!smoothedLandmarks) return;
  const w = canvas.width, h = canvas.height;
  const leftEye = smoothedLandmarks[33], rightEye = smoothedLandmarks[263];
  const faceWidth = Math.hypot((rightEye.x-leftEye.x)*w, (rightEye.y-leftEye.y)*h);
  const leftEar = smoothedLandmarks[234] || smoothedLandmarks[132];
  const rightEar = smoothedLandmarks[454] || smoothedLandmarks[361];
  const neck = smoothedLandmarks[152];
  function sPoint(key,nx,ny){
    if(!smoothedPoints[key]) smoothedPoints[key] = {x:nx,y:ny};
    else{
      smoothedPoints[key].x = smoothedPoints[key].x*(1-smoothingFactor) + nx*smoothingFactor;
      smoothedPoints[key].y = smoothedPoints[key].y*(1-smoothingFactor) + ny*smoothingFactor;
    }
    return smoothedPoints[key];
  }
  const le = sPoint('le', leftEar.x*w, leftEar.y*h);
  const re = sPoint('re', rightEar.x*w, rightEar.y*h);
  const nk = sPoint('nk', neck.x*w, neck.y*h);
  ctx.clearRect(0,0,w,h);
  if(currentImage){
    const earScale = faceWidth * 0.48;
    const eW = earScale, eH = earScale * (currentImage.height/currentImage.width);
    ctx.drawImage(currentImage, le.x - eW/2, le.y - eH*0.15, eW, eH);
    ctx.drawImage(currentImage, re.x - eW/2, re.y - eH*0.15, eW, eH);
    const neckScale = faceWidth * 1.2;
    const nW = neckScale, nH = neckScale * (currentImage.height/currentImage.width);
    ctx.drawImage(currentImage, nk.x - nW/2, nk.y - nH*0.1, nW, nH);
  }
}

// UI interactions
jewelryMode.addEventListener('click',(e)=>{
  const btn = e.target.closest('button[data-cat]');
  if(!btn) return;
  currentType = btn.dataset.cat;
  subcat.classList.remove('hidden');
  optionsGroup.classList.add('hidden');
});

subcat.addEventListener('click',(e)=>{
  const btn = e.target.closest('button[data-sub]');
  if(!btn) return;
  const sub = btn.dataset.sub;
  const key = `${sub}_${currentType}`;
  optionsGroup.classList.remove('hidden');
  insertOptions(key);
});

// on load
document.addEventListener('DOMContentLoaded', ()=>{
  setLoading(true);
  startCamera();
  setTimeout(()=>setLoading(false),800);
});
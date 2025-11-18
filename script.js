// Premium upgraded script.js for TryMyGold
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
let facing = 'user'; // start with front camera
let currentType = '';
let currentImage = null;
let smoothedLandmarks = null;
let smoothingFactor = 0.2;
let smoothedPoints = {};

// Google Drive settings (you'll need public images or proper API + CORS)
const API_KEY = ''; // optional if using public direct links
const driveFolders = {
  diamond_earrings: "1N0jndAEIThUuuNAJpvuRMGsisIaXCgMZ",
  diamond_necklaces: "1JGV8T03YdzjfW0Dyt9aMPybH8V9-gEhw",
  gold_earrings: "1GMZpcv4A1Gy2xiaIC1XPG_IOAt9NrDpi",
  gold_necklaces: "1QIvX-PrSVrK9gz-TEksqiKlXPGv2hsS5",
};

// Helper - show/hide loader
function setLoading(v){
  loader.classList.toggle('hidden', !v);
}

// Utility - load image and return Image object
function loadImage(src){
  return new Promise((res)=>{
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = ()=>res(img);
    img.onerror = ()=>res(null);
    img.src = src;
  });
}

// Fetch Drive thumbnails (fallback - may be rate limited). For production, host on CDN.
async function fetchDriveImages(folderId){
  if(!folderId) return [];
  try{
    const q = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&key=${API_KEY}&fields=files(id,name,mimeType)`;
    const r = await fetch(q);
    const j = await r.json();
    if(!j.files) return [];
    return j.files.filter(f=>f.mimeType.includes('image/')).map(f=>({id:f.id,name:f.name,src:`https://drive.google.com/thumbnail?id=${f.id}&sz=w1000`}));
  }catch(e){
    console.warn('Drive fetch failed',e);
    return [];
  }
}

// Insert option thumbnails
async function insertOptions(type){
  optionsGroup.innerHTML='';
  setLoading(true);
  const folder = driveFolders[type];
  const imgs = await fetchDriveImages(folder);
  if(imgs.length===0){
    const fallback = document.createElement('div');
    fallback.className='fallback';
    fallback.textContent = 'No images found in Drive. Add public images or update driveFolders.';
    optionsGroup.appendChild(fallback);
    setLoading(false);
    return;
  }
  for(const f of imgs){
    const btn=document.createElement('button');
    const imgEl=document.createElement('img');
    imgEl.src=f.src;
    imgEl.alt=f.name;
    btn.appendChild(imgEl);
    btn.onclick = async ()=>{
      setLoading(true);
      const imgObj = await loadImage(f.src);
      if(imgObj) {
        // fade transition
        currentImage = imgObj;
        // small delay to smooth visual transition
        setTimeout(()=>setLoading(false),300);
      } else {
        alert('Image failed to load.');
        setLoading(false);
      }
    };
    optionsGroup.appendChild(btn);
  }
  setLoading(false);
}

// Mediapipe FaceMesh setup
const faceMesh = new FaceMesh({locateFile: (file)=>`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`});
faceMesh.setOptions({maxNumFaces:1,refineLandmarks:true,minDetectionConfidence:0.6,minTrackingConfidence:0.6});

faceMesh.onResults((results)=>{
  // clear canvas
  if(videoElem.videoWidth && videoElem.videoHeight){
    canvas.width = videoElem.videoWidth;
    canvas.height = videoElem.videoHeight;
  }
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(results.multiFaceLandmarks && results.multiFaceLandmarks.length>0){
    const newLm = results.multiFaceLandmarks[0];
    if(!smoothedLandmarks) smoothedLandmarks = newLm;
    else{
      smoothedLandmarks = smoothedLandmarks.map((prev,i)=>({x: prev.x*(1-smoothingFactor) + newLm[i].x*smoothingFactor, y: prev.y*(1-smoothingFactor) + newLm[i].y*smoothingFactor, z: prev.z*(1-smoothingFactor) + newLm[i].z*smoothingFactor }));
    }
  } else {
    smoothedLandmarks = null;
  }
  drawOverlay();
});

// Start camera
async function startCamera(){
  if(cameraInstance) cameraInstance.stop();
  cameraInstance = new Camera(videoElem,{
    onFrame: async ()=>{ await faceMesh.send({image:videoElem}); },
    width: 1280,
    height: 720,
    facingMode: facing
  });
  cameraInstance.start();
}

// Flip camera
flipBtn.addEventListener('click', ()=>{
  facing = (facing==='user') ? 'environment' : 'user';
  startCamera();
});

// Capture - generate image with watermark
captureBtn.addEventListener('click', ()=>{
  // draw current overlay one last time to temp canvas
  const outCanvas = document.createElement('canvas');
  outCanvas.width = canvas.width;
  outCanvas.height = canvas.height;
  const outCtx = outCanvas.getContext('2d');
  // draw video frame
  outCtx.drawImage(videoElem,0,0,outCanvas.width,outCanvas.height);
  // draw overlay
  outCtx.drawImage(canvas,0,0);
  // watermark
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

// Draw earrings / necklace based on landmarks
function drawOverlay(){
  if(!smoothedLandmarks) return;
  const w = canvas.width, h = canvas.height;

  // face width using eyes (33 & 263)
  const leftEye = smoothedLandmarks[33], rightEye = smoothedLandmarks[263];
  const faceWidth = Math.hypot((rightEye.x-leftEye.x)*w, (rightEye.y-leftEye.y)*h);

  // ear positions (use landmarks near ears)
  const leftEar = smoothedLandmarks[234] || smoothedLandmarks[132];
  const rightEar = smoothedLandmarks[454] || smoothedLandmarks[361];
  const neck = smoothedLandmarks[152];

  // smooth numeric positions
  function sPoint(key, nx, ny){
    if(!smoothedPoints[key]) smoothedPoints[key] = {x:nx,y:ny};
    else {
      smoothedPoints[key].x = smoothedPoints[key].x*(1-smoothingFactor) + nx*smoothingFactor;
      smoothedPoints[key].y = smoothedPoints[key].y*(1-smoothingFactor) + ny*smoothingFactor;
    }
    return smoothedPoints[key];
  }

  const le = sPoint('le', leftEar.x*w, leftEar.y*h);
  const re = sPoint('re', rightEar.x*w, rightEar.y*h);
  const nk = sPoint('nk', neck.x*w, neck.y*h);

  // draw chosen image if available
  if(currentImage){
    // earrings scale relative to faceWidth
    const earScale = faceWidth * 0.48; // tweak if needed
    const eW = earScale, eH = earScale * (currentImage.height/currentImage.width);
    // draw left/right with slight vertical offset
    ctx.drawImage(currentImage, le.x - eW/2, le.y - eH*0.15, eW, eH);
    ctx.drawImage(currentImage, re.x - eW/2, re.y - eH*0.15, eW, eH);
  }

  // necklace - use different image if available (simple fallback to same)
  if(currentImage){
    const neckScale = faceWidth * 1.2; // wider
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
  // quick hide loader when camera started
  setTimeout(()=>setLoading(false),800);
});
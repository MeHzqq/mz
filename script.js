const canvas = document.getElementById('matrix');
const ctx = canvas?.getContext('2d');

const glyphs = 'アカサタナハマヤラワ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
let width = 0;
let height = 0;
let fontSize = 18;
let columns = [];
let lastFrameTime = 0;
const frameInterval = 72; // slower matrix effect

function resizeMatrix() {
  if (!canvas || !ctx) return;

  const ratio = window.devicePixelRatio || 1;
  width = window.innerWidth;
  height = window.innerHeight;

  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  fontSize = width < 640 ? 14 : 18;
  const columnCount = Math.ceil(width / fontSize);
  columns = Array.from({ length: columnCount }, () => ({
    y: Math.random() * -height,
    speed: (0.55 + Math.random() * 0.5) * fontSize,
  }));
}

function drawMatrix(timestamp = 0) {
  if (!canvas || !ctx) return;
  requestAnimationFrame(drawMatrix);

  if (timestamp - lastFrameTime < frameInterval) return;
  lastFrameTime = timestamp;

  ctx.fillStyle = 'rgba(1, 4, 2, 0.11)';
  ctx.fillRect(0, 0, width, height);
  ctx.font = `${fontSize}px Consolas, SFMono-Regular, Menlo, monospace`;
  ctx.textBaseline = 'top';

  columns.forEach((column, index) => {
    const x = index * fontSize;
    const char = glyphs[Math.floor(Math.random() * glyphs.length)];

    ctx.fillStyle = 'rgba(185, 255, 177, 0.95)';
    ctx.fillText(char, x, column.y);

    ctx.fillStyle = 'rgba(134, 255, 122, 0.58)';
    ctx.fillText(glyphs[Math.floor(Math.random() * glyphs.length)], x, column.y - fontSize);

    column.y += column.speed;

    if (column.y > height + Math.random() * 240) {
      column.y = Math.random() * -height * 0.6;
      column.speed = (0.55 + Math.random() * 0.5) * fontSize;
    }
  });
}

if (canvas && ctx) {
  resizeMatrix();
  requestAnimationFrame(drawMatrix);
  window.addEventListener('resize', resizeMatrix);
}

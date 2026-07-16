const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const color = '#009B4D';
const bgColor = '#FAF5E9';

sizes.forEach(size => {
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="${bgColor}" rx="${size * 0.2}"/>
  <g transform="translate(${size * 0.2}, ${size * 0.2})">
    <path fill="${color}" d="M ${size * 0.3} ${size * 0.15} L ${size * 0.45} ${size * 0.3} L ${size * 0.3} ${size * 0.45} L ${size * 0.15} ${size * 0.3} Z"/>
    <circle cx="${size * 0.3}" cy="${size * 0.45}" r="${size * 0.05}" fill="${color}"/>
  </g>
  <text x="50%" y="75%" text-anchor="middle" font-family="Arial, sans-serif" font-size="${size * 0.15}" font-weight="bold" fill="${color}">NFD</text>
</svg>`;
  
  fs.writeFileSync(path.join(__dirname, `icon-${size}x${size}.svg`), svg);
  console.log(`Created icon-${size}x${size}.svg`);
});

console.log('\nSVG icons created. For production, convert these to PNG using an image converter.');
console.log('For now, update manifest.json to use .svg instead of .png');

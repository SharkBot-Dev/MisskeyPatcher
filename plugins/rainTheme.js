installStyle(`
._pageScrollable {
    background-image: linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.6)), url("https://cdn.pixabay.com/photo/2017/08/18/13/04/glass-2654887_640.jpg");
    color: white;
    background-size: cover;
    background-position: center;
    background-attachment: fixed;
}

.rain-canvas {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: 9999;
}
`);

const canvas = document.createElement('canvas');
canvas.classList.add('rain-canvas');
document.body.appendChild(canvas);

const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const maxRaindrops = 80; 
const raindrops = [];

class Raindrop {
    constructor() {
        this.init();
    }

    init() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * -canvas.height;
        this.length = Math.random() * 20 + 15;   
        this.speed = Math.random() * 15 + 15;
        this.opacity = Math.random() * 0.2 + 0.15; 
    }

    update() {
        this.y += this.speed;
        if (this.y > canvas.height) {
            this.init();
        }
    }

    draw() {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(174, 194, 224, ${this.opacity})`;
        ctx.lineWidth = 1.2;
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x, this.y + this.length);
        ctx.stroke();
    }
}

for (let i = 0; i < maxRaindrops; i++) {
    raindrops.push(new Raindrop());
}

function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    raindrops.forEach(drop => {
        drop.update();
        drop.draw();
    });

    requestAnimationFrame(animate);
}

animate();
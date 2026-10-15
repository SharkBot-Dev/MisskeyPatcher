// 注意！rainTheme.jsと同時に使用できません！！

installStyle(`
#dvd-logo {
    position: fixed;
    top: 0;
    left: 0;
    width: 150px;
    height: 75px;
    display: flex;
    justify-content: center;
    align-items: center;
    user-select: none;
    transition: filter 0.2s;
    z-index: 2147483647; 
    pointer-events: none;
}

.dvd-box {
    background: #fff;
    width: 100%;
    height: 100%;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    box-shadow: 0 4px 15px rgba(0,0,0,0.5);
    font-weight: bold;
    letter-spacing: 1px;
    pointer-events: auto;
}

.dvd-main {
    font-size: 28px;
    font-style: italic;
    font-weight: 900;
    line-height: 1;
}

.dvd-sub {
    font-size: 10px;
    margin-top: 2px;
    letter-spacing: 2px;
}
`);

const dvd_logo = document.createElement("div");
dvd_logo.id = "dvd-logo";

const logo_box = document.createElement("div");
logo_box.className = "dvd-box";

const dvd_main = document.createElement("span");
dvd_main.className = "dvd-main";
dvd_main.textContent = "DVD";

const dvd_sub = document.createElement("span");
dvd_sub.className = "dvd-sub";
dvd_sub.textContent = "VIDEO";

logo_box.appendChild(dvd_main);
logo_box.appendChild(dvd_sub);
dvd_logo.appendChild(logo_box);
document.body.appendChild(dvd_logo);

let posX = Math.random() * (window.innerWidth - 150);
let posY = Math.random() * (window.innerHeight - 75);
let speedX = 3;
let speedY = 3;

let cornerHits = 0;

const colors = [
    '#ff3333', '#33ff33', '#3366ff', '#ffff33', 
    '#ff33ff', '#33ffff', '#ff9933', '#9933ff'
];
let currentColorIndex = 0;

function changeColor() {
    currentColorIndex = (currentColorIndex + 1) % colors.length;
    logo_box.style.color = colors[currentColorIndex];
}

changeColor();

function animate() {
    const stageWidth = window.innerWidth;
    const stageHeight = window.innerHeight;
    const logoWidth = dvd_logo.clientWidth;
    const logoHeight = dvd_logo.clientHeight;

    posX += speedX;
    posY += speedY;

    let hitX = false;
    let hitY = false;
    let hitCorner = false;

    if (posX <= 0) {
        posX = 0;
        speedX = -speedX;
        hitX = true;
    } else if (posX + logoWidth >= stageWidth) {
        posX = stageWidth - logoWidth;
        speedX = -speedX;
        hitX = true;
    }

    if (posY <= 0) {
        posY = 0;
        speedY = -speedY;
        hitY = true;
    } else if (posY + logoHeight >= stageHeight) {
        posY = stageHeight - logoHeight;
        speedY = -speedY;
        hitY = true;
    }

    if (hitX || hitY) {
        changeColor();
                
        if (hitX && hitY) {
            hitCorner = true;
            cornerHits++;
            
            const hitCountEl = document.getElementById('dvd-hit-count');
            if (hitCountEl) {
                hitCountEl.textContent = cornerHits;
            }
                    
            logo_box.style.transform = 'scale(1.2)';
            setTimeout(() => {
                logo_box.style.transform = 'scale(1)';
            }, 200);
        }
    }

    dvd_logo.style.left = posX + 'px';
    dvd_logo.style.top = posY + 'px';

    requestAnimationFrame(animate);
}

window.addEventListener('resize', () => {
    const stageWidth = window.innerWidth;
    const stageHeight = window.innerHeight;
    
    if (posX + dvd_logo.clientWidth > stageWidth) {
        posX = stageWidth - dvd_logo.clientWidth;
    }
    if (posY + dvd_logo.clientHeight > stageHeight) {
        posY = stageHeight - dvd_logo.clientHeight;
    }
});

requestAnimationFrame(animate);
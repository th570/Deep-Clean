const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800; canvas.height = 600;

// --- Game State ---
let gameState = 'MENU';
let player, projectiles, enemies, explosions, wave, spawnedCount, lastShot;
let rerollCost = 15;
let keys = {};
let mouse = { x: 0, y: 0 };
let isMouseDown = false;
let menuActiveTime = 0;

// Audio reference
const bgMusic = document.getElementById('bgMusic');

// --- Background Settings ---
const backgrounds = [
    { name: 'Lobby', color1: '#1a1a2e', color2: '#16213e' },      // Dark Lobby
    { name: 'Classroom', color1: '#2d4059', color2: '#00adb5' },  // Teal/Blue Room
    { name: 'Hospital', color1: '#eeeeee', color2: '#00adb5' },   // Sterile White/Teal
    { name: 'Kitchen', color1: '#393e46', color2: '#f9ed69' }     // Industrial/Yellow
];

function drawEnvironment() {
    const bg = backgrounds[(wave - 1) % backgrounds.length];
    
    // Fill room base color
    ctx.fillStyle = bg.color1;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw floor tile pattern
    ctx.strokeStyle = bg.color2;
    ctx.globalAlpha = 0.1;
    ctx.lineWidth = 1;
    const tileSize = 40;
    for (let x = 0; x < canvas.width; x += tileSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += tileSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    // Room Label
    ctx.fillStyle = bg.color2;
    ctx.font = 'bold 14px Courier New';
    ctx.textAlign = 'right';
    ctx.fillText(`LOCATION: ${bg.name.toUpperCase()}`, canvas.width - 20, canvas.height - 20);
}

function initGame() {
    player = {
        x: 400, y: 300, r: 18, hp: 100, maxHp: 100, 
        speed: 4, fireDelay: 400, damage: 10,
        gold: 50, armor: 1,
        killsInWave: 0, targetKills: 8,
        ricochet: 0, explosive: false, explosiveLevel: 0, lifeSteal: 0,
        multiShot: 1 
    };
    projectiles = []; enemies = []; explosions = [];
    wave = 1; spawnedCount = 0; lastShot = 0; rerollCost = 15;
    
    // Reset upgrade levels on new game
    ALL_UPGRADES.forEach(u => u.level = 0);
    
    gameState = 'PLAYING';
}

const ALL_UPGRADES = [
    { 
        name: "Health Surge", 
        desc: "Max HP +15%", 
        cost: 20, 
        level: 0,
        action: (opt) => { 
            const increase = player.maxHp * 0.15;
            player.maxHp += increase; 
            player.hp += increase; 
            opt.level++;
        } 
    },
    { 
        name: "Martial Prowess", 
        desc: "Base Damage +20%", 
        cost: 25, 
        level: 0,
        action: (opt) => { 
            player.damage *= 1.2; 
            opt.level++;
        } 
    },
    { 
        name: "Extra Spray", 
        desc: "+1 Bullet per shot", 
        cost: 60, 
        level: 0,
        action: (opt) => { 
            player.multiShot++; 
            opt.level++;
        } 
    },
    { 
        name: "Agility Training", 
        desc: "Speed +10%", 
        cost: 20, 
        level: 0,
        action: (opt) => { 
            player.speed *= 1.1; 
            opt.level++;
        } 
    },
    { 
        name: "Ricochet Shot", 
        desc: "Projectiles bounce +1", 
        cost: 50, 
        level: 0,
        action: (opt) => { 
            player.ricochet++; 
            opt.level++;
        } 
    },
    { 
        name: "Explosive Rounds", 
        desc: "Larger AOE Blast", 
        cost: 60, 
        level: 0,
        action: (opt) => { 
            player.explosive = true; 
            player.explosiveLevel++; 
            opt.level++;
        } 
    },
    { 
        name: "Life Steal", 
        desc: "Heal +2% of damage", 
        cost: 45, 
        level: 0,
        action: (opt) => { 
            player.lifeSteal += 0.02; 
            opt.level++;
        } 
    }
];

// --- Input & Controls ---
window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (e.key === 'Escape') togglePause();
});
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

window.addEventListener('blur', () => { keys = {}; });

canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top;
});
canvas.addEventListener('mousedown', () => isMouseDown = true);
window.addEventListener('mouseup', () => isMouseDown = false);

document.getElementById('start-btn').onclick = () => {
    document.getElementById('main-menu').classList.add('hidden');
    bgMusic.volume = 0.4;
    bgMusic.play().catch(e => console.log("Audio play blocked until interaction."));
    initGame();
};

document.getElementById('resume-btn').onclick = () => togglePause();
document.getElementById('quit-btn').onclick = () => {
    document.getElementById('pause-menu').classList.add('hidden');
    document.getElementById('main-menu').classList.remove('hidden');
    bgMusic.pause();
    bgMusic.currentTime = 0;
    gameState = 'MENU';
};

document.getElementById('restart-btn').onclick = () => {
    document.getElementById('game-over').classList.add('hidden');
    bgMusic.currentTime = 0;
    bgMusic.play();
    initGame();
};

function togglePause() {
    if (gameState === 'PLAYING') {
        gameState = 'PAUSED';
        bgMusic.pause();
        document.getElementById('pause-menu').classList.remove('hidden');
    } else if (gameState === 'PAUSED') {
        gameState = 'PLAYING';
        bgMusic.play();
        document.getElementById('pause-menu').classList.add('hidden');
    }
}

function spawnEnemy() {
    if (gameState !== 'PLAYING' || spawnedCount >= player.targetKills) return;

    const edge = Math.floor(Math.random() * 4);
    let x, y;
    if (edge === 0) { x = Math.random() * canvas.width; y = -40; }
    else if (edge === 1) { x = Math.random() * canvas.width; y = canvas.height + 40; }
    else if (edge === 2) { x = -40; y = Math.random() * canvas.height; }
    else { x = canvas.width + 40; y = Math.random() * canvas.height; }

    let hp = 10 + (wave*3);
    let type = { r: 15, hp: hp, maxHp: hp, speed: 1.2 + (wave*0.1), emoji: '🦠', color: '#00ff00' };
    if (wave >= 3 && Math.random() > 0.8) {
        hp = 8 + wave;
        type = { r: 12, hp: hp, maxHp: hp, speed: 2.8 + (wave*0.1), emoji: '🧪', color: '#ff00ff' };
    }
    else if (wave >= 5 && Math.random() > 0.85) {
        hp = 50 + (wave*10);
        type = { r: 25, hp: hp, maxHp: hp, speed: 0.8, emoji: '💩', color: '#8b4513' };
    }

    enemies.push({ x, y, ...type });
    spawnedCount++;
}

function shoot() {
    const now = Date.now();
    if (now - lastShot < player.fireDelay) return;
    lastShot = now;

    const baseAngle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    const spread = 0.2; 

    for (let i = 0; i < player.multiShot; i++) {
        const offset = (i - (player.multiShot - 1) / 2) * spread;
        const angle = baseAngle + offset;
        projectiles.push({
            x: player.x, y: player.y,
            vx: Math.cos(angle) * 9, vy: Math.sin(angle) * 9,
            r: 6, bounces: player.ricochet, hitList: []
        });
    }
}

function createExplosion(x, y) {
    const blastRadius = 60 + (player.explosiveLevel * 20);
    explosions.push({ x, y, r: 5, maxR: blastRadius, alpha: 1 });
    enemies.forEach(en => {
        if (Math.hypot(en.x - x, en.y - y) < blastRadius) en.hp -= player.damage * 0.8;
    });
}

function showGameOver() {
    gameState = 'GAMEOVER';
    bgMusic.pause();
    const highWave = localStorage.getItem('deepCleanHighWave') || 0;
    if (wave > highWave) {
        localStorage.setItem('deepCleanHighWave', wave);
    }
    
    document.getElementById('final-wave').innerText = wave;
    document.getElementById('high-wave').innerText = localStorage.getItem('deepCleanHighWave');
    document.getElementById('game-over').classList.remove('hidden');
}

function update() {
    if (gameState !== 'PLAYING') return;
    if (isMouseDown) shoot();

    if (keys['w'] && player.y > player.r) player.y -= player.speed;
    if (keys['s'] && player.y < canvas.height - player.r) player.y += player.speed;
    if (keys['a'] && player.x > player.r) player.x -= player.speed;
    if (keys['d'] && player.x < canvas.width - player.r) player.x += player.speed;

    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10 || p.x > canvas.width + 10 || p.y < -10 || p.y > canvas.height + 10) {
            projectiles.splice(i, 1); continue;
        }
        for (let j = enemies.length - 1; j >= 0; j--) {
            const en = enemies[j];
            if (p.hitList.includes(en)) continue;
            if (Math.hypot(p.x - en.x, p.y - en.y) < p.r + en.r) {
                en.hp -= player.damage;
                if (player.lifeSteal > 0) player.hp = Math.min(player.maxHp, player.hp + (player.damage * player.lifeSteal));
                if (player.explosive) createExplosion(en.x, en.y);
                if (p.bounces > 0) {
                    p.bounces--; p.hitList.push(en);
                    const next = enemies.find(e => !p.hitList.includes(e));
                    if (next) {
                        const angle = Math.atan2(next.y - p.y, next.x - p.x);
                        p.vx = Math.cos(angle) * 9; p.vy = Math.sin(angle) * 9;
                    }
                } else { projectiles.splice(i, 1); }
                break;
            }
        }
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
        const en = enemies[i];
        const dist = Math.hypot(player.x - en.x, player.y - en.y);
        en.x += (player.x - en.x) / dist * en.speed;
        en.y += (player.y - en.y) / dist * en.speed;

        if (dist < player.r + en.r) {
            player.hp -= 0.7; 
            if (player.hp <= 0) {
                showGameOver();
            }
        }
        if (en.hp <= 0) {
            enemies.splice(i, 1);
            player.killsInWave++;
            player.gold += 5;
            if (player.killsInWave >= player.targetKills && enemies.length === 0) showUpgradeMenu();
        }
    }

    explosions.forEach((ex, i) => {
        ex.r += 5; ex.alpha -= 0.04;
        if (ex.alpha <= 0) explosions.splice(i, 1);
    });
}

function showUpgradeMenu() {
    gameState = 'UPGRADE';
    menuActiveTime = Date.now();
    const menu = document.getElementById('upgrade-menu');
    const cont = document.getElementById('upgrade-options');
    document.getElementById('reroll-cost').innerText = rerollCost;
    cont.innerHTML = '';
    menu.classList.remove('hidden');

    const options = [...ALL_UPGRADES].sort(() => 0.5 - Math.random()).slice(0, 3);
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'upgrade-btn';
        if (player.gold < opt.cost) btn.disabled = true;
        btn.innerHTML = `<strong>${opt.name} (Lvl ${opt.level})</strong><br>${opt.desc} <span class="price-tag">$${opt.cost}</span>`;
        btn.onclick = () => { 
            if (Date.now() - menuActiveTime < 1000) return;
            player.gold -= opt.cost;
            opt.action(opt); 
            hideUpgradeMenu(); 
        };
        cont.appendChild(btn);
    });
}

function hideUpgradeMenu() {
    document.getElementById('upgrade-menu').classList.add('hidden');
    wave++;
    player.killsInWave = 0; spawnedCount = 0;
    player.targetKills = 8 + (wave * 5);
    rerollCost = 15; 
    gameState = 'PLAYING';
}

document.getElementById('reroll-btn').onclick = () => {
    if (Date.now() - menuActiveTime < 1000) return;
    if (player.gold >= rerollCost) {
        player.gold -= rerollCost;
        rerollCost += 10;
        showUpgradeMenu();
    }
};

function draw() {
    if (gameState !== 'MENU' && gameState !== 'GAMEOVER') {
        drawEnvironment();

        ctx.font = '30px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🧹', player.x, player.y);

        enemies.forEach(en => {
            ctx.font = `${en.r * 2.2}px serif`;
            ctx.fillText(en.emoji, en.x, en.y);
            ctx.fillStyle = '#333';
            ctx.fillRect(en.x - 15, en.y - en.r - 10, 30, 4);
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(en.x - 15, en.y - en.r - 10, (en.hp / en.maxHp) * 30, 4);
        });

        ctx.fillStyle = '#00f2ff';
        projectiles.forEach(p => {
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        });

        explosions.forEach(ex => {
            ctx.strokeStyle = `rgba(255, 255, 255, ${ex.alpha})`;
            ctx.lineWidth = 4; ctx.beginPath();
            ctx.arc(ex.x, ex.y, ex.r, 0, Math.PI * 2); ctx.stroke();
        });

        document.getElementById('hp').innerText = Math.max(0, Math.floor(player.hp));
        document.getElementById('wave').innerText = wave;
        document.getElementById('gold').innerText = player.gold;
        document.getElementById('xp-bar').style.width = (player.killsInWave / player.targetKills * 100) + '%';
    } else {
        ctx.fillStyle = '#050505'; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    update();
    requestAnimationFrame(draw);
}

setInterval(spawnEnemy, 1000);
draw();
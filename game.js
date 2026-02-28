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

// --- Music Playlist Logic ---
const playlist = [
    document.getElementById('bgMusic1'),
    document.getElementById('bgMusic2'),
    document.getElementById('bgMusic3'),
    document.getElementById('bgMusic4')
];
let currentTrackIndex = 0;

function playCurrentTrack() {
    const track = playlist[currentTrackIndex];
    track.volume = 0.4;
    track.play().catch(e => console.log("Playback blocked"));
}

function pauseCurrentTrack() {
    playlist[currentTrackIndex].pause();
}

function nextTrack() {
    pauseCurrentTrack();
    playlist[currentTrackIndex].currentTime = 0;
    currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
    playCurrentTrack();
}

// Set up automatic transitions
playlist.forEach(track => {
    track.addEventListener('ended', nextTrack);
});

// --- Background Settings ---
const backgrounds = [
    { name: 'Lobby', color1: '#1a1a2e', color2: '#16213e' },
    { name: 'Classroom', color1: '#2d4059', color2: '#00adb5' },
    { name: 'Hospital', color1: '#eeeeee', color2: '#00adb5' },
    { name: 'Kitchen', color1: '#393e46', color2: '#f9ed69' }
];

function drawEnvironment() {
    const bg = backgrounds[(wave - 1) % backgrounds.length];
    ctx.fillStyle = bg.color1;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
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
        ricochet: 0, explosive: false, explosiveLevel: 0, 
        recoveryRate: 0, // New stat replacing lifeSteal
        multiShot: 1 
    };
    projectiles = []; enemies = []; explosions = [];
    wave = 1; spawnedCount = 0; lastShot = 0; rerollCost = 15;
    ALL_UPGRADES.forEach(u => { u.level = 0; u.cost = u.baseCost; });
    gameState = 'PLAYING';
}

const ALL_UPGRADES = [
    { name: "Health Surge", desc: "Max HP +15%", baseCost: 100, cost: 100, level: 0, action: (opt) => { const inc = player.maxHp * 0.15; player.maxHp += inc; player.hp += inc; opt.level++; opt.cost = Math.floor(opt.cost * 1.4); } },
    { name: "Industrial Bleach", desc: "Base Damage +20%", baseCost: 150, cost: 150, level: 0, action: (opt) => { player.damage *= 1.2; opt.level++; opt.cost = Math.floor(opt.cost * 1.5); } },
    { name: "Extra Spray", desc: "+1 Bullet per shot", baseCost: 400, cost: 400, level: 0, action: (opt) => { player.multiShot++; opt.level++; opt.cost = Math.floor(opt.cost * 2.2); } },
    { name: "Agility Training", desc: "Speed +10%", baseCost: 80, cost: 80, level: 0, action: (opt) => { player.speed *= 1.1; opt.level++; opt.cost = Math.floor(opt.cost * 1.3); } },
    { name: "Ricochet Shot", desc: "Projectiles bounce +1", baseCost: 300, cost: 300, level: 0, action: (opt) => { player.ricochet++; opt.level++; opt.cost = Math.floor(opt.cost * 1.7); } },
    { name: "Explosive Rounds", desc: "Larger AOE Blast", baseCost: 350, cost: 350, level: 0, action: (opt) => { player.explosive = true; player.explosiveLevel++; opt.level++; opt.cost = Math.floor(opt.cost * 1.6); } },
    { 
        name: "Post-Shift Recovery", 
        desc: "Restore 20% of missing HP after wave", 
        baseCost: 500, cost: 500, level: 0, 
        action: (opt) => { 
            player.recoveryRate += 0.20; 
            opt.level++; 
            opt.cost = Math.floor(opt.cost * 1.8);
            if (player.recoveryRate >= 1.0) {
                player.recoveryRate = 1.0;
                opt.maxed = true; // Flag to exclude from random pool
            }
        } 
    }
];

window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; if (e.key === 'Escape') togglePause(); });
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
window.addEventListener('blur', () => { keys = {}; });
canvas.addEventListener('mousemove', e => { const rect = canvas.getBoundingClientRect(); mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top; });
canvas.addEventListener('mousedown', () => isMouseDown = true);
window.addEventListener('mouseup', () => isMouseDown = false);

document.getElementById('start-btn').onclick = () => {
    document.getElementById('main-menu').classList.add('hidden');
    playCurrentTrack();
    initGame();
};

document.getElementById('resume-btn').onclick = () => togglePause();
document.getElementById('quit-btn').onclick = () => {
    document.getElementById('pause-menu').classList.add('hidden');
    document.getElementById('main-menu').classList.remove('hidden');
    pauseCurrentTrack();
    playlist[currentTrackIndex].currentTime = 0;
    gameState = 'MENU';
};

document.getElementById('restart-btn').onclick = () => {
    document.getElementById('game-over').classList.add('hidden');
    playlist[currentTrackIndex].currentTime = 0;
    playCurrentTrack();
    initGame();
};

function togglePause() {
    if (gameState === 'PLAYING') {
        gameState = 'PAUSED';
        pauseCurrentTrack();
        document.getElementById('pause-menu').classList.remove('hidden');
    } else if (gameState === 'PAUSED') {
        gameState = 'PLAYING';
        playCurrentTrack();
        document.getElementById('pause-menu').classList.add('hidden');
    }
}

function spawnEnemy(xParam, yParam, typeOverride) {
    if (gameState !== 'PLAYING') return;
    if (wave % 25 === 0 && spawnedCount === 0 && !typeOverride) {
        enemies.push({ x: canvas.width/2, y: -100, r: 60, hp: 1000 + (wave * 50), maxHp: 1000 + (wave * 50), speed: 0.5, emoji: '👑', color: '#ff0000', isBoss: true, lastSpawn: 0 });
        spawnedCount = player.targetKills; return;
    }
    if (!typeOverride && spawnedCount >= player.targetKills) return;
    let x = xParam, y = yParam;
    if (x === undefined) {
        const edge = Math.floor(Math.random() * 4);
        if (edge === 0) { x = Math.random() * canvas.width; y = -40; }
        else if (edge === 1) { x = Math.random() * canvas.width; y = canvas.height + 40; }
        else if (edge === 2) { x = -40; y = Math.random() * canvas.height; }
        else { x = canvas.width + 40; y = Math.random() * canvas.height; }
    }
    let hp = 10 + (wave*3);
    let type = { r: 15, hp: hp, maxHp: hp, speed: 1.2 + (wave*0.1), emoji: '🦠', color: '#00ff00' };
    if (wave > 10 && Math.random() > 0.5) { type.color = '#ff8800'; type.hp *= 1.5; type.emoji = '👾'; }
    if (wave >= 10 && Math.random() > 0.85) { type = { r: 20, hp: hp * 1.2, maxHp: hp * 1.2, speed: 1.0, emoji: '🧽', color: '#00ffff', splits: true }; }
    else if (wave >= 15 && Math.random() > 0.9) { type = { r: 15, hp: hp * 2, maxHp: hp * 2, speed: 1.5, emoji: '🐍', color: '#2ecc71', isSnake: true, tail: [] }; }
    else if (wave >= 3 && Math.random() > 0.8) { hp = 8 + wave; type = { r: 12, hp: hp, maxHp: hp, speed: 2.8 + (wave*0.1), emoji: '🧪', color: '#ff00ff' }; }
    else if (wave >= 5 && Math.random() > 0.85) { hp = 50 + (wave*10); type = { r: 25, hp: hp, maxHp: hp, speed: 0.8, emoji: '💩', color: '#8b4513' }; }
    enemies.push({ x, y, ... (typeOverride || type) });
    if (!typeOverride) spawnedCount++;
}

function shoot() {
    const now = Date.now();
    if (now - lastShot < player.fireDelay) return;
    lastShot = now;
    const baseAngle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    for (let i = 0; i < player.multiShot; i++) {
        const offset = (i - (player.multiShot - 1) / 2) * 0.2;
        const angle = baseAngle + offset;
        projectiles.push({ x: player.x, y: player.y, vx: Math.cos(angle) * 9, vy: Math.sin(angle) * 9, r: 6, bounces: player.ricochet, hitList: [] });
    }
}

function createExplosion(x, y) {
    const blastRadius = 60 + (player.explosiveLevel * 20);
    explosions.push({ x, y, r: 5, maxR: blastRadius, alpha: 1 });
    enemies.forEach(en => { if (Math.hypot(en.x - x, en.y - y) < blastRadius) en.hp -= player.damage * 0.8; });
}

function showGameOver() {
    gameState = 'GAMEOVER';
    pauseCurrentTrack();
    const highWave = localStorage.getItem('deepCleanHighWave') || 0;
    if (wave > highWave) localStorage.setItem('deepCleanHighWave', wave);
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
        if (p.x < -10 || p.x > canvas.width + 10 || p.y < -10 || p.y > canvas.height + 10) { projectiles.splice(i, 1); continue; }
        for (let j = enemies.length - 1; j >= 0; j--) {
            const en = enemies[j];
            if (p.hitList.includes(en)) continue;
            if (Math.hypot(p.x - en.x, p.y - en.y) < p.r + en.r) {
                en.hp -= player.damage;
                if (player.explosive) createExplosion(en.x, en.y);
                if (p.bounces > 0) {
                    p.bounces--; p.hitList.push(en);
                    const next = enemies.find(e => !p.hitList.includes(e));
                    if (next) { const a = Math.atan2(next.y - p.y, next.x - p.x); p.vx = Math.cos(a) * 9; p.vy = Math.sin(a) * 9; }
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
        if (en.isSnake) {
            en.tail.push({x: en.x, y: en.y});
            if (en.tail.length > 50) en.tail.shift();
            en.tail.forEach(t => { if (Math.hypot(player.x - t.x, player.y - t.y) < player.r + 5) player.hp -= 0.5; });
        }
        if (en.isBoss && Date.now() - en.lastSpawn > 3000) {
            spawnEnemy(en.x, en.y, { r: 12, hp: 20, maxHp: 20, speed: 2, emoji: '🦠', color: '#ff0000' });
            en.lastSpawn = Date.now();
        }
        if (dist < player.r + en.r) { player.hp -= 0.7; if (player.hp <= 0) showGameOver(); }
        if (en.hp <= 0) {
            if (en.splits) {
                for(let k=0; k<2; k++) spawnEnemy(en.x + (Math.random()*20-10), en.y + (Math.random()*20-10), { r: 10, hp: 15, maxHp: 15, speed: 1.8, emoji: '🦠', color: '#00ffff' });
            }
            enemies.splice(i, 1); player.killsInWave++; player.gold += 10;
            if (player.killsInWave >= player.targetKills && enemies.length === 0) showUpgradeMenu();
        }
    }
    explosions.forEach((ex, i) => { ex.r += 5; ex.alpha -= 0.04; if (ex.alpha <= 0) explosions.splice(i, 1); });
}

function showUpgradeMenu() {
    // Apply Post-Shift Recovery heal before showing menu
    if (player.hp < player.maxHp && player.recoveryRate > 0) {
        const missingHp = player.maxHp - player.hp;
        player.hp += missingHp * player.recoveryRate;
    }

    gameState = 'UPGRADE';
    menuActiveTime = Date.now();
    const menu = document.getElementById('upgrade-menu');
    const cont = document.getElementById('upgrade-options');
    document.getElementById('reroll-cost').innerText = rerollCost;
    cont.innerHTML = '';
    menu.classList.remove('hidden');
    
    // Filter out maxed upgrades (like 100% recovery)
    const availableUpgrades = ALL_UPGRADES.filter(u => !u.maxed);
    const options = [...availableUpgrades].sort(() => 0.5 - Math.random()).slice(0, 3);
    
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'upgrade-btn';
        if (player.gold < opt.cost) btn.disabled = true;
        btn.innerHTML = `<strong>${opt.name} (Lvl ${opt.level})</strong><br>${opt.desc} <span class="price-tag">$${opt.cost}</span>`;
        btn.onclick = () => { if (Date.now() - menuActiveTime < 1000) return; player.gold -= opt.cost; opt.action(opt); hideUpgradeMenu(); };
        cont.appendChild(btn);
    });
}

function hideUpgradeMenu() {
    document.getElementById('upgrade-menu').classList.add('hidden');
    wave++; player.killsInWave = 0; spawnedCount = 0;
    player.targetKills = 8 + (wave * 5);
    rerollCost += 5; gameState = 'PLAYING';
}

document.getElementById('reroll-btn').onclick = () => { if (Date.now() - menuActiveTime < 1000) return; if (player.gold >= rerollCost) { player.gold -= rerollCost; rerollCost = Math.floor(rerollCost * 1.5); showUpgradeMenu(); } };
document.getElementById('skip-btn').onclick = () => { if (Date.now() - menuActiveTime < 1000) return; hideUpgradeMenu(); };

function draw() {
    if (gameState !== 'MENU' && gameState !== 'GAMEOVER') {
        drawEnvironment();
        ctx.font = '30px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🧹', player.x, player.y);
        enemies.forEach(en => {
            if (en.isSnake) {
                ctx.fillStyle = 'rgba(46, 204, 113, 0.3)';
                en.tail.forEach(t => { ctx.beginPath(); ctx.arc(t.x, t.y, 5, 0, Math.PI*2); ctx.fill(); });
            }
            ctx.font = `${en.r * 2.2}px serif`;
            ctx.fillText(en.emoji, en.x, en.y);
            ctx.fillStyle = '#333'; ctx.fillRect(en.x - 15, en.y - en.r - 10, 30, 4);
            ctx.fillStyle = en.color; ctx.fillRect(en.x - 15, en.y - en.r - 10, (en.hp / en.maxHp) * 30, 4);
        });
        ctx.fillStyle = '#00f2ff';
        projectiles.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); });
        explosions.forEach(ex => { ctx.strokeStyle = `rgba(255, 255, 255, ${ex.alpha})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(ex.x, ex.y, ex.r, 0, Math.PI * 2); ctx.stroke(); });
        document.getElementById('hp').innerText = Math.max(0, Math.floor(player.hp));
        document.getElementById('wave').innerText = wave;
        document.getElementById('gold').innerText = player.gold;
        document.getElementById('xp-bar').style.width = (player.killsInWave / player.targetKills * 100) + '%';
    } else { ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    update();
    requestAnimationFrame(draw);
}

setInterval(spawnEnemy, 1000);
draw();
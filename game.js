const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800; canvas.height = 600;

// --- Game State ---
let gameState = 'MENU';
let player, projectiles, enemies, explosions, wave, spawnedCount, lastShot;
let bossProjectiles = []; 
let rerollCost = 15;
let keys = {};
let mouse = { x: 0, y: 0 };
let isMouseDown = false;
let isRightMouseDown = false;
let menuActiveTime = 0;
let floatingTexts = [];
let screenShake = 0;
let lastDash = 0;
const DASH_COOLDOWN = 2000;

// --- Bug Bomb State ---
let bombs = [];
let bombsPlacedInCycle = 0;
let lastBombTime = 0;
const BOMB_COOLDOWN = 5000;

// --- Music Playlist Logic ---
const playlist = [
    document.getElementById('bgMusic1'),
    document.getElementById('bgMusic2'),
    document.getElementById('bgMusic3'),
    document.getElementById('bgMusic4')
];
let currentTrackIndex = 0;
let globalVolume = 0.4;

function playCurrentTrack() {
    const track = playlist[currentTrackIndex];
    if (track) {
        track.volume = globalVolume;
        track.play().catch(e => console.log("Playback blocked"));
    }
}

function pauseCurrentTrack() {
    if (playlist[currentTrackIndex]) playlist[currentTrackIndex].pause();
}

function nextTrack() {
    pauseCurrentTrack();
    playlist[currentTrackIndex].currentTime = 0;
    currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
    playCurrentTrack();
}

if (playlist) {
    playlist.forEach(track => {
        if (track) track.addEventListener('ended', nextTrack);
    });
}

const backgrounds = [
    { name: 'Executive Lobby', color1: '#020b14', color2: '#00f2ff' },
    { name: 'Digital Classroom', color1: '#051008', color2: '#2ecc71' },
    { name: 'Sanitized Wing', color1: '#0a0a0a', color2: '#ffffff' },
    { name: 'Industrial Kitchen', color1: '#140d02', color2: '#ffcc00' }
];

function drawEnvironment() {
    ctx.save();
    if (screenShake > 0) {
        ctx.translate(Math.random() * screenShake - screenShake/2, Math.random() * screenShake - screenShake/2);
        screenShake *= 0.9;
    }
    const bg = backgrounds[(wave - 1) % backgrounds.length];
    ctx.fillStyle = bg.color1;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = bg.color2;
    ctx.globalAlpha = 0.05;
    ctx.lineWidth = 1;
    const tileSize = 50;
    for (let x = 0; x < canvas.width; x += tileSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += tileSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
}

function addFloatingText(x, y, text, color = '#fff') {
    floatingTexts.push({ x, y, text, color, life: 1.0, vy: -1 });
}

function initGame(startWave = 1, isCheat = false) {
    player = {
        x: 400, y: 300, r: 18, hp: 100, maxHp: 100, 
        speed: 4, fireDelay: 400, damage: 10,
        gold: isCheat ? 5000 : 50,
        armor: 1,
        killsInWave: 0, targetKills: 8 + (startWave * 5),
        ricochet: 0, explosive: false, explosiveLevel: 0, 
        recoveryRate: 0, 
        multiShot: 1,
        dashDist: 100,
        isDashing: false,
        knockback: 1.2,
        bugBombLevel: 0
    };
    projectiles = []; enemies = []; explosions = []; bossProjectiles = []; floatingTexts = []; bombs = [];
    wave = startWave; spawnedCount = 0; lastShot = 0; rerollCost = 15;
    bombsPlacedInCycle = 0;

    ALL_UPGRADES.forEach(u => { 
        u.level = 0; u.cost = u.baseCost; u.maxed = false; 
        if (isCheat) { 
            const upgradesToApply = Math.floor(startWave / 10) + 3;
            for(let i=0; i < upgradesToApply; i++) { u.action(u); } 
        }
    });

    gameState = 'PLAYING';
}

const ALL_UPGRADES = [
    { name: "HEPA Filter Mask", desc: "Max Integrity +15%", baseCost: 100, cost: 100, level: 0, rarity: 'Common', icon: '🛡️', action: (opt) => { const inc = player.maxHp * 0.15; player.maxHp += inc; player.hp += inc; opt.level++; opt.cost = Math.floor(opt.cost * 1.4); } },
    { name: "Industrial Bleach", desc: "Base Damage +20%", baseCost: 150, cost: 150, level: 0, rarity: 'Common', icon: '🧪', action: (opt) => { player.damage *= 1.2; opt.level++; opt.cost = Math.floor(opt.cost * 1.5); } },
    { name: "Dual-Nozzle Wand", desc: "+1 Projectile per shot", baseCost: 400, cost: 400, level: 0, rarity: 'Legendary', icon: '🔫', action: (opt) => { player.multiShot++; opt.level++; opt.cost = Math.floor(opt.cost * 2.2); } },
    { name: "Hydro-Slide Boots", desc: "Movement Speed +10%", baseCost: 80, cost: 80, level: 0, rarity: 'Common', icon: '🥾', action: (opt) => { player.speed *= 1.1; opt.level++; opt.cost = Math.floor(opt.cost * 1.3); } },
    { name: "High-Pressure Wash", desc: "Bullet Speed & Bounces", baseCost: 300, cost: 300, level: 0, rarity: 'Rare', icon: '🌀', action: (opt) => { player.ricochet++; opt.level++; opt.cost = Math.floor(opt.cost * 1.7); } },
    { name: "Aerosol Combustion", desc: "Explosive Blast Radius", baseCost: 350, cost: 350, level: 0, rarity: 'Rare', icon: '💥', action: (opt) => { player.explosive = true; player.explosiveLevel++; opt.level++; opt.cost = Math.floor(opt.cost * 1.6); } },
    { name: "Bug Bomb", desc: "Right-Click to drop AOE traps", baseCost: 450, cost: 450, level: 0, rarity: 'Rare', icon: '💣', action: (opt) => { player.bugBombLevel++; opt.level++; opt.cost = Math.floor(opt.cost * 1.8); if(opt.level >= 5) opt.maxed = true; } },
    { name: "Post Shift Recovery", desc: "Restore 20% missing HP", baseCost: 500, cost: 500, level: 0, rarity: 'Legendary', icon: '☕', action: (opt) => { player.recoveryRate += 0.20; opt.level++; opt.cost = Math.floor(opt.cost * 1.8); if (player.recoveryRate >= 1.0) { player.recoveryRate = 1.0; opt.maxed = true; } } }
];

window.addEventListener('keydown', e => { 
    keys[e.key.toLowerCase()] = true; 
    if (e.key === 'Escape') togglePause(); 
    if (e.code === 'Space') attemptDash();
});
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
canvas.addEventListener('mousemove', e => { const rect = canvas.getBoundingClientRect(); mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top; });

canvas.addEventListener('mousedown', (e) => { 
    if(e.button === 0) isMouseDown = true; 
    if(e.button === 2) {
        isRightMouseDown = true;
        deployBugBomb();
    }
});
window.addEventListener('mouseup', (e) => { 
    if(e.button === 0) isMouseDown = false; 
    if(e.button === 2) isRightMouseDown = false; 
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

document.getElementById('volume-slider').oninput = (e) => {
    globalVolume = e.target.value;
    if (playlist[currentTrackIndex]) playlist[currentTrackIndex].volume = globalVolume;
};

document.getElementById('start-btn').onclick = () => {
    document.getElementById('main-menu').classList.add('hidden');
    playCurrentTrack();
    initGame();
};

document.getElementById('code-btn').onclick = () => {
    const code = prompt("ENTER OVERRIDE CODE:");
    if (code === 'clean25') {
        document.getElementById('main-menu').classList.add('hidden');
        playCurrentTrack();
        initGame(25, true);
    } else if (code === 'clean50') {
        document.getElementById('main-menu').classList.add('hidden');
        playCurrentTrack();
        initGame(50, true);
    }
};

document.getElementById('resume-btn').onclick = () => togglePause();
document.getElementById('quit-btn').onclick = () => {
    document.getElementById('pause-menu').classList.add('hidden');
    document.getElementById('main-menu').classList.remove('hidden');
    pauseCurrentTrack();
    gameState = 'MENU';
};

document.getElementById('restart-btn').onclick = () => {
    document.getElementById('game-over').classList.add('hidden');
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

function deployBugBomb() {
    if (gameState !== 'PLAYING' || player.bugBombLevel <= 0) return;
    
    const now = Date.now();
    // Check if we are in cooldown
    if (bombsPlacedInCycle >= player.bugBombLevel && now - lastBombTime < BOMB_COOLDOWN) {
        addFloatingText(player.x, player.y - 30, "RECHARGING", "#555");
        return;
    }

    // Reset cycle if cooldown passed
    if (now - lastBombTime >= BOMB_COOLDOWN) {
        bombsPlacedInCycle = 0;
    }

    if (bombsPlacedInCycle < player.bugBombLevel) {
        bombs.push({
            x: player.x,
            y: player.y,
            timer: 2000, // 2 seconds to explode
            radius: 12,
            spawnTime: now
        });
        bombsPlacedInCycle++;
        lastBombTime = now;
        addFloatingText(player.x, player.y, "BOMB DEPLOYED", "#bc13fe");
    }
}

function attemptDash() {
    const now = Date.now();
    if (now - lastDash < DASH_COOLDOWN || gameState !== 'PLAYING') return;
    
    let dx = 0, dy = 0;
    if (keys['w']) dy = -1; if (keys['s']) dy = 1;
    if (keys['a']) dx = -1; if (keys['d']) dx = 1;
    
    if (dx !== 0 || dy !== 0) {
        const angle = Math.atan2(dy, dx);
        player.x += Math.cos(angle) * player.dashDist;
        player.y += Math.sin(angle) * player.dashDist;
        player.x = Math.max(player.r, Math.min(canvas.width - player.r, player.x));
        player.y = Math.max(player.r, Math.min(canvas.height - player.r, player.y));
        lastDash = now;
        screenShake = 5;
    }
}

function spawnEnemy(xParam, yParam, typeOverride) {
    if (gameState !== 'PLAYING') return;

    if (wave % 25 === 0 && spawnedCount === 0 && !typeOverride) {
        const bossCount = Math.floor(wave / 25);
        for (let i = 0; i < bossCount; i++) {
            enemies.push({ 
                x: (canvas.width / (bossCount + 1)) * (i + 1), y: -100, r: 60, 
                hp: 1000 + (wave * 100), maxHp: 1000 + (wave * 100), 
                speed: 0.5, emoji: '👑', color: '#ff3e3e', 
                isBoss: true, lastSpawn: 0, lastShot: 0 
            });
        }
        spawnedCount = 1;
        return;
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

    let hp = 10 + (wave * 3);
    let type = { r: 15, hp: hp, maxHp: hp, speed: 1.2 + (wave * 0.1), emoji: '🦠', color: '#00ff00' };
    
    if (wave > 10 && Math.random() > 0.5) { type.color = '#ff8800'; type.hp *= 1.5; type.emoji = '👾'; }
    if (wave >= 10 && Math.random() > 0.85) { type = { r: 20, hp: hp * 1.2, maxHp: hp * 1.2, speed: 1.0, emoji: '🧽', color: '#00ffff', splits: true }; }
    else if (wave >= 15 && Math.random() > 0.9) { type = { r: 15, hp: hp * 2, maxHp: hp * 2, speed: 1.5, emoji: '🐍', color: '#2ecc71', isSnake: true, tail: [] }; }
    else if (wave >= 3 && Math.random() > 0.8) { hp = 8 + wave; type = { r: 10, hp: hp, maxHp: hp, speed: 2.8 + (wave * 0.1), emoji: '🐇', color: '#ff00ff', name: 'Dust Bunny' }; }
    else if (wave >= 5 && Math.random() > 0.85) { hp = 50 + (wave * 10); type = { r: 25, hp: hp, maxHp: hp, speed: 0.8, emoji: '💩', color: '#8b4513' }; }
    
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
        projectiles.push({ x: player.x, y: player.y, vx: Math.cos(angle) * 11, vy: Math.sin(angle) * 11, r: 6, bounces: player.ricochet, hitList: [] });
    }
}

function createExplosion(x, y, isBig = false) {
    // FIX: Bomb uses a specific radius (180), regular combustion uses player upgrade radius
    const blastRadius = isBig ? 180 : (60 + (player.explosiveLevel * 20));
    
    explosions.push({ x, y, r: 5, maxR: blastRadius, alpha: 1, color: isBig ? '#bc13fe' : '#ffffff' });
    screenShake = isBig ? 15 : 8;
    
    enemies.forEach(en => { 
        const dist = Math.hypot(en.x - x, en.y - y);
        // Only do damage if the enemy is actually within the visual circle
        if (dist < blastRadius) { 
            const dmg = player.damage * (isBig ? 4 : 0.8);
            en.hp -= dmg; 
            addFloatingText(en.x, en.y, `-${Math.floor(dmg)}`, isBig ? '#bc13fe' : '#ffcc00');
        }
    });
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

    // Update Bombs
    bombs.forEach((b, i) => {
        if (Date.now() - b.spawnTime > b.timer) {
            createExplosion(b.x, b.y, true);
            bombs.splice(i, 1);
        }
    });

    projectiles.forEach((p, i) => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10 || p.x > canvas.width + 10 || p.y < -10 || p.y > canvas.height + 10) projectiles.splice(i, 1);
        enemies.forEach(en => {
            if (p.hitList.includes(en)) return;
            if (Math.hypot(p.x - en.x, p.y - en.y) < p.r + en.r) {
                const dmg = player.damage;
                en.hp -= dmg;
                addFloatingText(en.x, en.y, `-${Math.floor(dmg)}`, '#00f2ff');
                if (player.explosive) createExplosion(en.x, en.y);
                if (p.bounces > 0) {
                    p.bounces--; p.hitList.push(en);
                    const next = enemies.find(e => !p.hitList.includes(e));
                    if (next) { const a = Math.atan2(next.y - p.y, next.x - p.x); p.vx = Math.cos(a) * 9; p.vy = Math.sin(a) * 9; }
                } else { projectiles.splice(i, 1); }
            }
        });
    });

    bossProjectiles.forEach((bp, i) => {
        bp.x += bp.vx; bp.y += bp.vy;
        if (Math.hypot(bp.x - player.x, bp.y - player.y) < bp.r + player.r) {
            player.hp -= 10; bossProjectiles.splice(i, 1);
            screenShake = 10;
            addFloatingText(player.x, player.y, "-10", "#ff3e3e");
            if (player.hp <= 0) showGameOver();
        }
    });

    enemies.forEach((en, i) => {
        const dist = Math.hypot(player.x - en.x, player.y - en.y);
        en.x += (player.x - en.x) / dist * en.speed;
        en.y += (player.y - en.y) / dist * en.speed;
        
        if (en.isSnake) {
            en.tail.push({x: en.x, y: en.y});
            if (en.tail.length > 50) en.tail.shift();
            en.tail.forEach(t => { if (Math.hypot(player.x - t.x, player.y - t.y) < player.r + 5) player.hp -= 0.5; });
        }

        if (en.isBoss) {
            if (Date.now() - en.lastSpawn > 1500) { spawnEnemy(en.x, en.y, { r: 12, hp: 25, maxHp: 25, speed: 2.2, emoji: '🦠', color: '#ff3e3e' }); en.lastSpawn = Date.now(); }
            if (Date.now() - en.lastShot > 1000) {
                const angle = Math.atan2(player.y - en.y, player.x - en.x);
                bossProjectiles.push({ x: en.x, y: en.y, vx: Math.cos(angle) * 5, vy: Math.sin(angle) * 5, r: 12, color: '#bc13fe' });
                en.lastShot = Date.now();
            }
        }

        if (dist < player.r + en.r) { 
            player.hp -= 0.7; 
            if (Math.random() > 0.9) addFloatingText(player.x, player.y, "!", "#ff3e3e");
            if (player.hp <= 0) showGameOver(); 
        }
        
        if (en.hp <= 0) {
            if (en.splits) { for(let k=0; k<2; k++) spawnEnemy(en.x + (Math.random()*20-10), en.y + (Math.random()*20-10), { r: 10, hp: 15, maxHp: 15, speed: 1.8, emoji: '🦠', color: '#00ffff' }); }
            player.gold += en.isBoss ? 1000 : 10;
            enemies.splice(i, 1); 
            player.killsInWave++; 
            if (spawnedCount >= player.targetKills && enemies.length === 0) {
                enemies = []; bossProjectiles = []; showUpgradeMenu();
            }
        }
    });

    floatingTexts.forEach((ft, i) => { ft.y += ft.vy; ft.life -= 0.02; if (ft.life <= 0) floatingTexts.splice(i, 1); });
    explosions.forEach((ex, i) => { ex.r += 5; ex.alpha -= 0.04; if (ex.alpha <= 0) explosions.splice(i, 1); });
}

function showUpgradeMenu() {
    if (player.hp < player.maxHp && player.recoveryRate > 0) player.hp += (player.maxHp - player.hp) * player.recoveryRate;
    gameState = 'UPGRADE';
    menuActiveTime = Date.now();
    const menu = document.getElementById('upgrade-menu');
    const cont = document.getElementById('upgrade-options');
    document.getElementById('reroll-cost').innerText = rerollCost;
    cont.innerHTML = '';
    menu.classList.remove('hidden');
    
    const options = [...ALL_UPGRADES.filter(u => !u.maxed)].sort(() => 0.5 - Math.random()).slice(0, 3);
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = `upgrade-btn rarity-${opt.rarity.toLowerCase()}`;
        if (player.gold < opt.cost) btn.disabled = true;
        btn.innerHTML = `<strong>${opt.icon} ${opt.name} (Lvl ${opt.level})</strong>${opt.desc} <span class="price-tag">$${opt.cost}</span>`;
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

        ctx.strokeStyle = (Date.now() - lastShot < player.fireDelay) ? '#ff3e3e' : '#00f2ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 10, 0, Math.PI*2);
        ctx.moveTo(mouse.x - 15, mouse.y); ctx.lineTo(mouse.x + 15, mouse.y);
        ctx.moveTo(mouse.x, mouse.y - 15); ctx.lineTo(mouse.x, mouse.y + 15);
        ctx.stroke();

        ctx.shadowBlur = 15; ctx.shadowColor = '#00f2ff';
        ctx.font = '30px serif'; ctx.textAlign = 'center'; ctx.fillText('🧹', player.x, player.y);
        ctx.shadowBlur = 0;
        
        // Draw Bombs
        bombs.forEach(b => {
            const pulse = Math.sin(Date.now() / 100) * 5;
            ctx.font = `${20 + pulse}px serif`;
            ctx.fillText('💣', b.x, b.y);
            ctx.strokeStyle = '#bc13fe';
            ctx.beginPath();
            ctx.arc(b.x, b.y, 25, 0, Math.PI * 2);
            ctx.stroke();
        });

        enemies.forEach(en => {
            if (en.isSnake) {
                ctx.fillStyle = 'rgba(46, 204, 113, 0.2)';
                en.tail.forEach(t => { ctx.beginPath(); ctx.arc(t.x, t.y, 5, 0, Math.PI*2); ctx.fill(); });
            }
            ctx.font = `${en.r * 2.2}px serif`; ctx.fillText(en.emoji, en.x, en.y);
            ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(en.x - 15, en.y - en.r - 10, 30, 3);
            ctx.fillStyle = en.color; ctx.fillRect(en.x - 15, en.y - en.r - 10, (en.hp / en.maxHp) * 30, 3);
        });

        projectiles.forEach(p => { 
            ctx.fillStyle = '#00f2ff';
            ctx.shadowBlur = 8; ctx.shadowColor = '#00f2ff';
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
        });

        bossProjectiles.forEach(bp => {
            ctx.fillStyle = bp.color; ctx.shadowBlur = 10; ctx.shadowColor = bp.color;
            ctx.beginPath(); ctx.arc(bp.x, bp.y, bp.r, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
        });

        explosions.forEach(ex => { 
            ctx.strokeStyle = ex.color || `rgba(255, 255, 255, ${ex.alpha})`; 
            ctx.lineWidth = 3; 
            ctx.beginPath(); ctx.arc(ex.x, ex.y, ex.r, 0, Math.PI * 2); ctx.stroke(); 
        });
        
        floatingTexts.forEach(ft => {
            ctx.globalAlpha = ft.life;
            ctx.fillStyle = ft.color;
            ctx.font = 'bold 16px Rajdhani';
            ctx.fillText(ft.text, ft.x, ft.y);
            ctx.globalAlpha = 1.0;
        });

        document.getElementById('hp').innerText = Math.max(0, Math.floor(player.hp));
        document.getElementById('hp-bar-fill').style.width = (player.hp / player.maxHp * 100) + '%';
        document.getElementById('wave').innerText = wave;
        document.getElementById('gold').innerText = player.gold;
        
        const progress = Math.min(100, (player.killsInWave / player.targetKills * 100));
        document.getElementById('xp-bar').style.width = progress + '%';
        
        document.getElementById('enemy-count').innerText = `ENEMIES: ${enemies.length + (player.targetKills - spawnedCount)}`;
        
        const dashReady = (Date.now() - lastDash >= DASH_COOLDOWN);
        document.getElementById('dash-status').innerText = dashReady ? "DASH READY [SPACE]" : "RECHARGING...";
        document.getElementById('dash-status').style.color = dashReady ? "#00f2ff" : "#555";

        // Show Bomb Cooldown on HUD if player has it
        if (player.bugBombLevel > 0) {
            const bombReady = (bombsPlacedInCycle < player.bugBombLevel || Date.now() - lastBombTime >= BOMB_COOLDOWN);
            const status = bombReady ? `BOMBS: ${player.bugBombLevel - (Date.now() - lastBombTime < BOMB_COOLDOWN ? bombsPlacedInCycle : 0)}` : "BOMBS RELOADING...";
            ctx.fillStyle = bombReady ? "#bc13fe" : "#555";
            ctx.font = "12px Orbitron";
            ctx.textAlign = "right";
            ctx.fillText(status, canvas.width - 20, canvas.height - 20);
        }

        ctx.restore();
    } else { ctx.fillStyle = '#020b14'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    update();
    requestAnimationFrame(draw);
}

setInterval(() => { if (gameState === 'PLAYING') spawnEnemy(); }, 1000);
draw();
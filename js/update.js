'use strict';
// 逐帧更新：移动 / 弹道 / 实体行为 / 补给 / 波次推进
/* ================= 更新 ================= */
function update(dt) {
  const p = player;
  p.fireCd -= dt;
  p.recoil = Math.max(0, p.recoil - dt * 40);
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) {
      p.reloadT = 0;
      const take = Math.min(curMagSize() - p.mag, p.reserve);
      p.mag += take;
      if (isFinite(p.reserve)) p.reserve -= take;
      if (p.mag === 0) switchWeapon(fallbackWeapon(), true);
    }
  }
  hurtT = Math.max(0, hurtT - dt);
  rapidT = Math.max(0, rapidT - dt);
  p.nadeCd = Math.max(0, p.nadeCd - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.invulnT = Math.max(0, p.invulnT - dt);
  // 血条「伤害残影」：掉血时缓慢追上，把刚损失的那一截血量短暂显示出来
  if (p.hp < p.hpShown) p.hpShown = Math.max(p.hp, p.hpShown - p.maxHp * dt * 0.6);
  else p.hpShown = p.hp;
  p.forceFieldCd = Math.max(0, p.forceFieldCd - dt);
  muzzleT = Math.max(0, muzzleT - dt);
  hitMarkT = Math.max(0, hitMarkT - dt);
  burnCd = Math.max(0, burnCd - dt);
  gameT += dt;
  // 连杀窗口：2.5 秒内没有新击杀就清空
  if (comboT > 0) { comboT -= dt; if (comboT <= 0) { combo = 0; comboT = 0; } }

  // 狙击射线（纯视觉，命中判定在 fireHitscan 里已完成）
  for (let i = beams.length - 1; i >= 0; i--) {
    const bm = beams[i];
    bm.t += dt;
    if (bm.t >= bm.life) beams.splice(i, 1);
  }

  // 血迹/焦痕老化：每秒清理过期贴花；只在确有贴花进入淡出期时才重建合成层，
  // 因此稳态（血迹都还新鲜、没有过期的）下这一步是零开销
  stainT += dt;
  if (stainT >= 1) {
    stainT = 0;
    let changed = false;
    for (let i = stains.length - 1; i >= 0; i--) {
      if (gameT - stains[i].born >= STAIN_LIFE) { stains.splice(i, 1); changed = true; }
    }
    const hold = STAIN_LIFE - STAIN_FADE;
    if (changed || stains.some(s => gameT - s.born > hold)) compositeGround();
  }
  shake -= shake * Math.min(1, dt * 7); if (shake < 0.1) shake = 0;
  waveMsgT = Math.max(0, waveMsgT - dt);

  // 玩家移动
  let dx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  let dy = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  p.moving = !!(dx || dy);
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.x += p.ddx * 900 * dt;
    p.y += p.ddy * 900 * dt;
    parts.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.22, maxLife: 0.22, size: 6, col: 'rgba(143,174,126,0.45)' });
  } else if (dx || dy) {
    const l = Math.hypot(dx, dy); dx /= l; dy /= l;
    p.x += dx * p.speed * upg.speed * dt; p.y += dy * p.speed * upg.speed * dt;
  }
  if (p.moving && p.dashT <= 0) p.walk += dt * 8.5;
  p.x = clamp(p.x, p.r + 8, W - p.r - 8);
  p.y = clamp(p.y, p.r + 8, H - p.r - 8);
  p.ang = Math.atan2(mouse.y - p.y, mouse.x - p.x);

  // 射击（半自动武器需逐次点击）
  const cw = WEAPONS[p.weapon];
  if (mouse.down && p.reloadT <= 0 && p.fireCd <= 0 && (cw.auto !== false || !mouse.semiHeld)) {
    if (p.mag > 0) fireBullet();
    else startReload();
  }

  // 子弹 / 火箭 / 等离子
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;

    // 追踪导弹 / 蜂群：每帧把速度方向朝最近的僵尸转一点（转向速率由 homing 决定）
    if (b.homing) {
      let best = null, bd = 280 * 280;
      for (const z of zombies) {
        const d2 = (z.x - b.x) ** 2 + (z.y - b.y) ** 2;
        if (d2 < bd) { bd = d2; best = z; }
      }
      if (best) {
        const cur = Math.atan2(b.vy, b.vx);
        let diff = Math.atan2(best.y - b.y, best.x - b.x) - cur;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        const sp = Math.hypot(b.vx, b.vy);
        const na = cur + clamp(diff, -b.homing * dt, b.homing * dt);
        b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
      }
    }

    if (b.type === 'rocket' && b.trail !== false && parts.length < CAP.parts) {
      parts.push({ x: b.x, y: b.y, vx: rand(-30, 30), vy: rand(-30, 30), life: 0.3, maxLife: 0.3, size: rand(2, 3.4), col: 'rgba(150,150,140,0.55)' });
    }
    // 跳弹枪：撞到场地边缘就反弹，每次反弹伤害递增；弹完最后一下才真正飞出去
    if (b.bounce > 0 && b.bounces < b.bounce) {
      let hitWall = false;
      if (b.x < 0 || b.x > W) { b.vx = -b.vx; b.x = clamp(b.x, 0, W); hitWall = true; }
      if (b.y < 0 || b.y > H) { b.vy = -b.vy; b.y = clamp(b.y, 0, H); hitWall = true; }
      if (hitWall) {
        b.bounces++;
        b.dmg *= b.bounceGrow;
        const sp2 = Math.hypot(b.vx, b.vy);
        if (sp2 > 0) { const k2 = Math.min(1.35, (sp2 + 90) / sp2); b.vx *= k2; b.vy *= k2; }
        b.life = Math.max(b.life, 0.9);      // 反弹后续命，否则刚弹回来就消失
        if (b.hitIds) b.hitIds.length = 0;   // 清空命中记录：弹回来的这一趟可以再打一遍（同趟内仍不重复计伤）
        sparks(b.x, b.y, Math.atan2(b.vy, b.vx), 6, false);
        rings.push({ x: b.x, y: b.y, t: 0, life: 0.26, col: 'rgba(143,240,200,0.8)' });
        S.pin();
      }
    }
    if (b.life <= 0 || b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30) {
      if (b.type === 'rocket') explode(clamp(b.x, 0, W), clamp(b.y, 0, H), b.splashDmg, b.splash);
      bullets.splice(i, 1); continue;
    }

    let consumed = false;
    for (let j = zombies.length - 1; j >= 0; j--) {
      const z = zombies[j];
      if (!z) continue;   // 连锁爆炸可能已把数组缩短（见主循环同名防御）
      const rad = z.r + (b.type === 'rocket' ? 6 : 4);
      if (b.hitIds && b.hitIds.indexOf(z) >= 0) continue;   // 已穿透过的目标不重复计伤
      if ((b.x - z.x) ** 2 + (b.y - z.y) ** 2 < rad * rad) {
        if (b.type === 'rocket') {
          explode(b.x, b.y, b.splashDmg, b.splash);
          bullets.splice(i, 1);
          consumed = true;
          break;
        }
        let dIn = b.dmg;
        if (z.type === 'shielder') dIn *= 0.6; // 装甲者：子弹 -40%（原 -55% 会让好枪直接变废），爆炸与火焰仍全额
        z.hp -= dIn; z.flash = 0.07;
        if (b.burn && burnCd <= 0) { spawnBurn(b.x, b.y); burnCd = 0.12; }   // 限流：否则 1.2s 内叠三十片，灼烧叠加到 200+dps
        z.x += b.vx * 0.004 * b.knock; z.y += b.vy * 0.004 * b.knock;
        blood(b.x, b.y, Math.atan2(b.vy, b.vx), 5, b.crit ? '#ff3b2f' : undefined);
        sparks(b.x, b.y, Math.atan2(b.vy, b.vx), b.crit ? 9 : 5, b.crit);
        hitMarkT = 0.13;
        if (Math.random() < 0.22) {
          addStain(b.x + rand(-4, 4), b.y + rand(-4, 4), rand(2, 4.5));
        }
        S.hit();
        if (z.hp <= 0) killZombie(j);
        // 穿透：无限（等离子）或有限次数（霰弹 / 加特林）
        if (b.pierce || b.pierceN > 0) {
          if (!b.pierce) b.pierceN--;
          b.hitIds.push(z);
        } else {
          bullets.splice(i, 1);
          consumed = true;
          break;
        }
      }
    }
  }

  // 吞噬滚球：滚动、撞墙反弹、碾过僵尸就吞（每次吞食都变大变强），到时原地内爆
  for (let i = rollers.length - 1; i >= 0; i--) {
    const R2 = rollers[i];
    R2.t += dt; R2.spin += dt * 5.5;
    R2.x += R2.vx * dt; R2.y += R2.vy * dt;
    // 撞墙反弹（球撞墙才像个球）
    if (R2.x < R2.r) { R2.x = R2.r; R2.vx = Math.abs(R2.vx); S.pin(); }
    else if (R2.x > W - R2.r) { R2.x = W - R2.r; R2.vx = -Math.abs(R2.vx); S.pin(); }
    if (R2.y < R2.r) { R2.y = R2.r; R2.vy = Math.abs(R2.vy); S.pin(); }
    else if (R2.y > H - R2.r) { R2.y = H - R2.r; R2.vy = -Math.abs(R2.vy); S.pin(); }
    // 碾过僵尸：吞掉低血的、重创高血的；每只僵尸 0.4 秒内只结算一次
    for (let j = zombies.length - 1; j >= 0; j--) {
      const z = zombies[j];
      if (!z) continue;                                  // 连锁爆炸可能已缩短数组
      if ((z.x - R2.x) ** 2 + (z.y - R2.y) ** 2 > (R2.r + z.r) ** 2) continue;
      if (gameT - (z.rollT === undefined ? -9 : z.rollT) < 0.4) continue;
      z.rollT = gameT;
      let dIn = R2.dmg;
      if (z.type === 'shielder') dIn *= 0.6;
      z.hp -= dIn; z.flash = 0.12;
      // 被吸进球里：血花 + 碎块朝球心飞
      blood(z.x, z.y, Math.atan2(R2.y - z.y, R2.x - z.x), 7, '#ff5a3a');
      hitMarkT = 0.13;
      if (z.hp <= 0) {
        killZombie(j);
        R2.ate++;
        R2.r = Math.min(R2.maxR, R2.r + R2.growR);        // 吞一只长大一点
        R2.dmg += R2.growDmg;
        R2.life = Math.min(R2.life + 0.5, 12);            // 吃得越多滚得越久
        shake = Math.max(shake, 4);
      }
      S.hit();
    }
    if (R2.t >= R2.life) {
      // 到期内爆：伤害与体型挂钩，吃得越大炸得越狠
      const boomDmg = R2.dmg * (1.6 + R2.ate * 0.12);
      explode(R2.x, R2.y, boomDmg, R2.r * 2.1);
      rings.push({ x: R2.x, y: R2.y, t: 0, life: 0.5, col: 'rgba(168,255,107,0.85)' });
      shake = Math.max(shake, 14);
      rollers.splice(i, 1);
    }
  }

  // 僵尸（倒序索引遍历：自爆者结算时会 splice，for...of 的迭代器会因此跳过下一只）
  for (let zi = zombies.length - 1; zi >= 0; zi--) {
    const z = zombies[zi];
    // 长度防御：killZombie 会触发自爆者连锁，把数组缩到比 zi 还短；
    // 此时 zombies[zi] 为 undefined，若不跳过就会读属性抛错并冻结主循环
    if (!z) continue;
    z.flash = Math.max(0, z.flash - dt);
    z.atkCd -= dt;
    z.buffT = Math.max(0, z.buffT - dt);
    z.screamT = Math.max(0, z.screamT - dt);
    z.slowT = Math.max(0, (z.slowT || 0) - dt);   // 宠物光环的减速（每帧被光环重新打上）
    // 行走循环相位：按自身速度推进，快的僵尸迈步更快
    z.anim = (z.anim || 0) + dt * (3.4 + z.speed * 0.028);
    const a = Math.atan2(p.y - z.y, p.x - z.x);
    const sp = z.speed * (z.buffT > 0 ? 1.5 : 1) * (z.slowT > 0 ? 0.55 : 1); // 狂化加速 / 被光环拖慢
    z.x += Math.cos(a) * sp * dt;
    z.y += Math.sin(a) * sp * dt;
    if (z.type === 'runner') { // 疾跑者蛇形走位
      z.wob += dt * 6;
      z.x += Math.cos(a + Math.PI / 2) * Math.sin(z.wob) * 26 * dt;
      z.y += Math.sin(a + Math.PI / 2) * Math.sin(z.wob) * 26 * dt;
    }
    // 吐酸者：中距离定期喷吐酸弹
    if (z.type === 'spitter') {
      z.spitCd -= dt;
      if (z.spitCd <= 0) {
        const d2 = Math.hypot(p.x - z.x, p.y - z.y);
        if (d2 > 110 && d2 < 340) {
          z.spitCd = 2.2;
          const sa = a + rand(-0.06, 0.06);
          acidBolts.push({ x: z.x + Math.cos(sa) * z.r, y: z.y + Math.sin(sa) * z.r,
                           vx: Math.cos(sa) * 265, vy: Math.sin(sa) * 265, life: 2 });
          S.spit();
        } else z.spitCd = 0.5;
      }
    }
    // 尖啸者：周期性狂化周围尸群
    if (z.type === 'screamer') {
      z.screamCd -= dt;
      if (z.screamCd <= 0) {
        z.screamCd = 4; z.screamT = 0.7;
        rings.push({ x: z.x, y: z.y, t: 0, life: 0.8, col: 'rgba(255,110,180,0.75)' });
        for (const o of zombies) {
          if (o !== z && Math.hypot(o.x - z.x, o.y - z.y) < 260) o.buffT = 3;
        }
        S.scream();
      }
    }
    // 自爆者：贴近玩家后起爆引信
    if (z.type === 'bloater') {
      if (z.fuseT < 0 && Math.hypot(p.x - z.x, p.y - z.y) < 95) z.fuseT = 0.6;
      if (z.fuseT > 0) {
        z.fuseT -= dt;
        if (z.fuseT <= 0) { killZombie(zi); continue; }
      }
    }
    // 跃行者：蓄力（地上画出落点圈）→ 一扑一大段 → 落地僵直
    // 位移只发生在"扑"的那一瞬，所以先抵消上面的默认追击位移（同冲撞者的写法）
    if (z.type === 'leaper') {
      const dl = Math.hypot(p.x - z.x, p.y - z.y);
      z.x -= Math.cos(a) * sp * dt;
      z.y -= Math.sin(a) * sp * dt;
      if (z.crouchT > 0) {
        z.crouchT -= dt;
        z.leapA = a;                       // 蓄力期间持续瞄准：地面预警圈才指得准
        if (z.crouchT <= 0) { z.leapT = LEAP_TIME; S.buzz(); }
      } else if (z.leapT > 0) {
        z.leapT -= dt;
        z.x = clamp(z.x + Math.cos(z.leapA || 0) * LEAP_SPEED * dt, z.r, W - z.r);
        z.y = clamp(z.y + Math.sin(z.leapA || 0) * LEAP_SPEED * dt, z.r, H - z.r);
        // 扑击命中：比普通接触伤害重一点，但没有预警就不该有这一下
        if (dl < z.r + p.r + 6 && z.atkCd <= 0) { z.atkCd = 1.1; damagePlayer(z.dmg * 1.3); }
        if (z.leapT <= 0) z.landT = 0.5;
      } else if (z.landT > 0) {
        z.landT -= dt;                     // 落地僵直：这是玩家的输出窗口
      } else {
        z.hopCd = (z.hopCd === undefined ? rand(1.2, 2.6) : z.hopCd) - dt;
        if (z.hopCd <= 0 && dl < 430) { z.crouchT = 0.5; z.hopCd = rand(2.2, 3.6); }
      }
    }
    // 孢囊：周期性治疗周围尸群（自己也回一点）—— 不先处理它，整波都会变厚
    if (z.type === 'spore') {
      z.healCd = (z.healCd === undefined ? rand(1.6, 3.2) : z.healCd) - dt;
      if (z.healCd <= 0) {
        z.healCd = 3.6;
        let healed = 0;
        for (const o of zombies) {
          if (o === z || o.hp >= o.maxHp) continue;
          if (Math.hypot(o.x - z.x, o.y - z.y) > 230) continue;
          o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.16);
          if (healed < 8) flashes.push({ x: o.x, y: o.y, r: o.r + 14, t: 0, life: 0.3 });
          healed++;
        }
        z.hp = Math.min(z.maxHp, z.hp + z.maxHp * 0.06);
        if (healed) {
          rings.push({ x: z.x, y: z.y, t: 0, life: 0.7, col: 'rgba(110,230,170,0.85)' });
          S.heal();
        }
      }
    }
    const d = Math.hypot(p.x - z.x, p.y - z.y);

    // ===== Boss 行为 =====
    if (z.boss === 'butcher') {
      // 屠夫：贴近后周期性震地（范围伤害 + 冲击环），逼你拉开距离
      z.slamCd = (z.slamCd || 0) - dt;
      if (d < 130 && z.slamCd <= 0) {
        z.slamCd = 3.4;
        explode(z.x, z.y, 30, 150, 24);
        rings.push({ x: z.x, y: z.y, t: 0, life: 0.55, col: 'rgba(255,170,80,0.85)' });
        shake = Math.max(shake, 11);
      }
    } else if (z.boss === 'brood') {
      // 腐化母体：太近就后撤，中距离喷酸扇面，周期性召唤尸群（逼你主动压上去）
      if (d < 230) { z.x -= Math.cos(a) * sp * dt * 0.9; z.y -= Math.sin(a) * sp * dt * 0.9; }
      z.spitCd -= dt;
      if (z.spitCd <= 0 && d < 640) {
        z.spitCd = 2.6;
        for (let k = -2; k <= 2; k++) {
          const sa = a + k * 0.16;
          acidBolts.push({ x: z.x + Math.cos(sa) * z.r, y: z.y + Math.sin(sa) * z.r,
                           vx: Math.cos(sa) * 250, vy: Math.sin(sa) * 250, life: 2.4 });
        }
        S.spit();
      }
      z.sumCd = (z.sumCd || 0) - dt;
      if (z.sumCd <= 0) {
        z.sumCd = 9;
        for (let k = 0; k < 5; k++) {
          const sa = rand(0, 6.28);
          spawnAt(Math.random() < 0.6 ? 'runner' : 'normal',
                  z.x + Math.cos(sa) * rand(40, 90), z.y + Math.sin(sa) * rand(40, 90));
        }
        rings.push({ x: z.x, y: z.y, t: 0, life: 0.7, col: 'rgba(200,120,255,0.8)' });
        S.scream();
      }
    } else if (z.boss === 'charger') {
      // 冲撞者：蓄力（站定 + 预警线）→ 直线猛冲 → 撞完硬直（这是你的输出窗口）
      // 注意：三段各自的计时都在自己的分支里递减 —— 若在分支前统一递减，
      // windT 会被先减到 0，导致「蓄力结束 → 开始冲刺」那一步永远不触发（踩过）。
      z.chgCd = (z.chgCd === undefined ? 2.4 : z.chgCd) - dt;
      if (z.windT > 0) {
        z.windT -= dt;
        z.dashA = a;                                        // 持续锁定朝向：玩家看得见它瞄哪
        z.x -= Math.cos(a) * sp * dt;                       // 抵消上面的默认追击位移 → 站定蓄力
        z.y -= Math.sin(a) * sp * dt;
        if (z.windT <= 0) { z.windT = 0; z.dashT = 0.36; S.scream(); shake = Math.max(shake, 7); }
      } else if (z.dashT > 0) {
        z.dashT -= dt;
        z.x -= Math.cos(a) * sp * dt;                       // 抵消默认位移，改走冲刺方向
        z.y -= Math.sin(a) * sp * dt;
        z.x = clamp(z.x + Math.cos(z.dashA) * 760 * dt, z.r, W - z.r);
        z.y = clamp(z.y + Math.sin(z.dashA) * 760 * dt, z.r, H - z.r);
        if (parts.length < CAP.parts - 2) {
          parts.push({ x: z.x, y: z.y, vx: rand(-40, 40), vy: rand(-40, 40),
                       life: 0.22, maxLife: 0.22, size: rand(3, 6), col: 'rgba(210,105,30,0.5)' });
        }
        if (Math.hypot(p.x - z.x, p.y - z.y) < z.r + p.r + 8 && z.atkCd <= 0) {
          z.atkCd = 1.2;
          damagePlayer(z.dmg * 1.7);
          const ka = Math.atan2(p.y - z.y, p.x - z.x);
          p.x = clamp(p.x + Math.cos(ka) * 54, 20, W - 20);   // 撞飞
          p.y = clamp(p.y + Math.sin(ka) * 54, 20, H - 20);
          shake = Math.max(shake, 12);
        }
        if (z.dashT <= 0) { z.dashT = 0; z.dazedT = 1.7; }    // 冲完硬直
      } else if (z.dazedT > 0) {
        z.dazedT -= dt;
        z.x -= Math.cos(a) * sp * dt * 0.85;                // 硬直：几乎不动
        z.y -= Math.sin(a) * sp * dt * 0.85;
      } else if (z.chgCd <= 0 && d < 470) {
        z.windT = 0.75;
        z.chgCd = 4.4;
        rings.push({ x: z.x, y: z.y, t: 0, life: 0.7, col: 'rgba(255,150,60,0.9)' });
        S.buzz();
      }
    } else if (z.boss === 'mortar') {
      // 迫击者：保持远距离，周期性抛射带落点警示的炮弹 —— 区域封锁，逼你一直动
      if (d < 300) { z.x -= Math.cos(a) * sp * dt * 0.8; z.y -= Math.sin(a) * sp * dt * 0.8; }
      z.mortCd = (z.mortCd === undefined ? 1.8 : z.mortCd) - dt;
      if (z.mortCd <= 0 && d < 780) {
        z.mortCd = 3.3;
        const cnt = 1 + (Math.random() < 0.45 ? 1 : 0);
        for (let k = 0; k < cnt; k++) {
          shells.push({
            x: clamp(p.x + rand(-48, 48), 34, W - 34),
            y: clamp(p.y + rand(-48, 48), 34, H - 34),
            t: 0, fuse: 1.15, r: 96, dmg: 46, pdmg: 24
          });
        }
        S.mortar();
      }
    } else if (z.boss === 'necro') {
      // 纳尸者：把附近的尸体重新拉起来（并回复自身）—— 不清场就会被自己的战果反噬
      z.raiseCd = (z.raiseCd === undefined ? 2.4 : z.raiseCd) - dt;
      if (z.raiseCd <= 0 && d < 720) {
        z.raiseCd = 4.6;
        let raised = 0;
        for (let ci = corpses.length - 1; ci >= 0 && raised < 3; ci--) {
          const cp = corpses[ci];
          if (Math.hypot(cp.x - z.x, cp.y - z.y) > 280) continue;
          corpses.splice(ci, 1);
          spawnAt(Math.random() < 0.45 ? 'runner' : 'normal', cp.x, cp.y);
          raised++;
        }
        if (!raised) { spawnAt('normal', z.x + rand(-60, 60), z.y + rand(-60, 60)); raised = 1; }
        z.hp = Math.min(z.maxHp, z.hp + 26 * raised);        // 复生会回血：拖越久越难打
        rings.push({ x: z.x, y: z.y, t: 0, life: 0.8, col: 'rgba(80,220,180,0.85)' });
        flashes.push({ x: z.x, y: z.y, r: 96, t: 0, life: 0.25 });
        S.scream();
      }
    }

    if (z.dmg > 0 && d < z.r + p.r + 2 && z.atkCd <= 0) { z.atkCd = 0.9; damagePlayer(z.dmg); }
  }
  sweepDead();         // 收尾：结算所有 hp<=0 目标（含连锁爆炸/放电留下的残留）
  separateZombies();   // 僵尸互相挤开

  // 宠物：AI + 自主攻击（它自己的击杀也走 killZombie → sweepDead，这里放在收尾之后最干净）
  updatePet(dt);
  for (let i = petArcs.length - 1; i >= 0; i--) {
    petArcs[i].t += dt;
    if (petArcs[i].t >= petArcs[i].life) petArcs.splice(i, 1);
  }

  // 迫击炮弹：落地前一直有落点警示，到点才爆炸（区域封锁，玩家有反应时间）
  for (let i = shells.length - 1; i >= 0; i--) {
    const sh = shells[i];
    sh.t += dt;
    if (sh.t >= sh.fuse) {
      shells.splice(i, 1);
      explode(sh.x, sh.y, sh.dmg, sh.r, sh.pdmg);
      rings.push({ x: sh.x, y: sh.y, t: 0, life: 0.45, col: 'rgba(255,190,90,0.9)' });
      shake = Math.max(shake, 9);
    }
  }

  // 补给
  let tookGun = false;   // 一帧最多换一把枪（见下方武器分支）
  for (let i = pickups.length - 1; i >= 0; i--) {
    const k = pickups[i];
    k.t += dt; k.life -= dt;
    if (k.life <= 0) { pickups.splice(i, 1); continue; }
    const pd = Math.hypot(p.x - k.x, p.y - k.y);
    // 按 X 主动扔下的枪：走开 DROP_ARM_R 之后才允许捡回。落点(34px)只比拾取半径(31px)远 3px，
    // 不设这道闸门的话往前一步就把它捡回来了，丢枪形同虚设。世界掉落的箱子没有该标记，立即可捡。
    if (k.ownDrop) {
      if (pd <= DROP_ARM_R) continue;
      k.ownDrop = false;   // 已经走开，恢复正常拾取
    }
    if (pd < p.r + PICK_R) {
      if (k.type === 'med') {
        if (p.medkits < MEDKIT_CAP) { p.medkits++; pops.push({ x: p.x, y: p.y - 24, txt: t('wMed'), t: 0, life: 0.9 }); }
      } else if (k.type === 'ammo') {
        p.mag = curMagSize(); p.reloadT = 0; rapidT = 3;
        if (isFinite(p.reserve)) p.reserve += curMagSize();
      } else if (k.type === 'nade') {
        if (p.grenades < upg.throwCap) { p.grenades++; pops.push({ x: p.x, y: p.y - 24, txt: t('wNade'), t: 0, life: 0.9 }); }
      } else if (k.type === 'mol') {
        if (p.mols < upg.throwCap) { p.mols++; pops.push({ x: p.x, y: p.y - 24, txt: t('wMol'), t: 0, life: 0.9 }); }
      } else {
        // 一帧只换一把枪：踩进一堆武器箱时逐帧拾取，而不是同一帧里连换数把 ——
        // 否则武器名弹字、拾取音效和掉落物会在瞬间一起炸开
        if (tookGun) continue;
        tookGun = true;
        const wk = k.type.slice(1);
        // 拾取即替换：新枪直接顶掉手里的枪。旧设计把旧枪丢在脚边，而地上的武器箱被捡起时
        // 会把弹药填满 —— 于是「丢下 → 走回去捡」可以无限刷子弹。默认武器不受影响：
        // 它永远在手（备弹打空自动退回），既不会被顶掉，也不会被丢到地上。
        switchWeapon(wk, false);
        // 玩家自己扔下的枪带着当时的弹药状态，捡回来不补满（世界掉落的箱子没有这个字段）
        if (typeof k.mag === 'number') { p.mag = k.mag; p.reserve = k.reserve; }
      }
      S.pickup();
      pickups.splice(i, 1);
    }
  }

  // 粒子
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i];
    q.x += q.vx * dt; q.y += q.vy * dt;
    q.vx -= q.vx * Math.min(1, dt * 4);
    q.vy -= q.vy * Math.min(1, dt * 4);
    q.life -= dt;
    if (q.life <= 0) parts.splice(i, 1);
  }

  // 尸体 / 弹壳 / 击杀飘分
  for (let i = corpses.length - 1; i >= 0; i--) {
    const cp = corpses[i];
    cp.t += dt;
    if (cp.t >= cp.life) corpses.splice(i, 1);
  }
  for (let i = casings.length - 1; i >= 0; i--) {
    const c = casings[i];
    c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vrot * dt;
    c.vx -= c.vx * Math.min(1, dt * 5);
    c.vy -= c.vy * Math.min(1, dt * 5);
    c.life -= dt;
    if (c.life <= 0) casings.splice(i, 1);
  }
  for (let i = pops.length - 1; i >= 0; i--) {
    const q = pops[i];
    q.t += dt; q.y -= 26 * dt;
    if (q.t >= q.life) pops.splice(i, 1);
  }

  // 手雷引信 / 爆炸闪光
  for (let i = nades.length - 1; i >= 0; i--) {
    const n = nades[i];
    n.t += dt; n.fuse -= dt;
    if (n.flightT > 0) {
      n.flightT -= dt;
      n.x += n.vx * dt; n.y += n.vy * dt;
    } else {
      n.vx -= n.vx * Math.min(1, dt * 9);
      n.vy -= n.vy * Math.min(1, dt * 9);
      n.x += n.vx * dt; n.y += n.vy * dt;
    }
    n.x = clamp(n.x, 10, W - 10); n.y = clamp(n.y, 10, H - 10);
    if (n.fuse <= 0) {
      nades.splice(i, 1);
      explode(n.x, n.y, 80, 115);
    }
  }
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i];
    f.t += dt;
    if (f.t >= f.life) flashes.splice(i, 1);
  }

  // 燃烧瓶飞行 / 火焰地带 / 生命回复
  for (let i = mols.length - 1; i >= 0; i--) {
    const n = mols[i];
    n.t += dt; n.fuse -= dt;
    if (n.flightT > 0) {
      n.flightT -= dt;
      n.x += n.vx * dt; n.y += n.vy * dt;
    } else {
      n.vx -= n.vx * Math.min(1, dt * 9);
      n.vy -= n.vy * Math.min(1, dt * 9);
      n.x += n.vx * dt; n.y += n.vy * dt;
    }
    n.x = clamp(n.x, 10, W - 10); n.y = clamp(n.y, 10, H - 10);
    if (n.fuse <= 0) {
      mols.splice(i, 1);
      spawnFire(n.x, n.y);
    }
  }
  for (let i = fireZones.length - 1; i >= 0; i--) {
    const f = fireZones[i];
    f.t += dt; f.tick -= dt;
    if (f.tick <= 0) {
      f.tick = 0.3;
      const fd = f.dmg || 4.5;
      for (let j = zombies.length - 1; j >= 0; j--) {
        const z = zombies[j];
        if (!z) continue;   // 连锁爆炸可能已把数组缩短（见主循环同名防御）
        if (Math.hypot(z.x - f.x, z.y - f.y) < f.r + z.r) {
          z.hp -= fd * upg.fire * critAvg();
          z.flash = 0.05;
          if (z.hp <= 0) killZombie(j);
        }
      }
    }
    if (Math.random() < 0.6 && parts.length < CAP.parts) {
      const a = rand(0, 6.28), d = rand(0, f.r * 0.85);
      parts.push({ x: f.x + Math.cos(a) * d, y: f.y + Math.sin(a) * d,
                   vx: rand(-14, 14), vy: rand(-46, -14),
                   life: rand(0.25, 0.55), maxLife: 0.55, size: rand(1.6, 4),
                   col: ['#ff9a3d', '#ffb347', '#ff6a3a', '#ffe08a'][Math.floor(rand(0, 4))] });
    }
    if (f.t >= f.life) fireZones.splice(i, 1);
  }
  // 酸弹（吐酸者）
  for (let i = acidBolts.length - 1; i >= 0; i--) {
    const b = acidBolts[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (parts.length < CAP.parts) {
      parts.push({ x: b.x, y: b.y, vx: rand(-20, 20), vy: rand(-20, 20), life: 0.25, maxLife: 0.25, size: 2, col: 'rgba(170,220,80,0.5)' });
    }
    let gone = b.life <= 0 || b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30;
    if (!gone && Math.hypot(p.x - b.x, p.y - b.y) < p.r + 5) {
      damagePlayer(9);
      blood(b.x, b.y, rand(0, 6.28), 5, '#7ba32e');
      gone = true;
    }
    if (gone) acidBolts.splice(i, 1);
  }
  // 尖啸冲击环
  for (let i = rings.length - 1; i >= 0; i--) {
    const r0 = rings[i];
    r0.t += dt;
    if (r0.t >= r0.life) rings.splice(i, 1);
  }
  // 特斯拉闪电链：电弧持续放电
  for (let i = teslaChains.length - 1; i >= 0; i--) {
    const tc = teslaChains[i];
    tc.t += dt;
    tc.nodes = tc.nodes.filter(z => zombies.indexOf(z) >= 0); // 死亡节点断开
    for (const z of tc.nodes) {
      z.hp -= tc.dps * upg.dmg * critAvg() * dt; // 持续放电，逐渐扣血
      z.flash = Math.max(z.flash, 0.04);
      const zi = zombies.indexOf(z);
      if (z.hp <= 0 && zi >= 0) killZombie(zi); // 自爆者被电死会引发爆炸连锁，索引可能已被挪动
    }
    if (Math.random() < 0.6 && parts.length < CAP.parts && tc.nodes.length) {
      const z = tc.nodes[Math.floor(rand(0, tc.nodes.length))];
      parts.push({ x: z.x + rand(-10, 10), y: z.y + rand(-10, 10),
                   vx: rand(-50, 50), vy: rand(-50, 50), life: 0.18, maxLife: 0.18,
                   size: rand(1, 2.6), col: '#bfe8ff' });
    }
    if (tc.t >= tc.life || tc.nodes.length === 0) teslaChains.splice(i, 1);
  }
  if (upg.regen > 0) {
    regenT += dt;
    if (regenT >= 5) {
      regenT -= 5;
      player.hp = Math.min(player.maxHp, player.hp + upg.regen);
    }
  }

  // 空投：每 20 秒自动送达必出好货的补给（原 VIP 特权，现已对普通用户开放）
  vipDropT -= dt;
  if (vipDropT <= 0) {
    vipDropT = 20;
    airdrop(p.x + rand(-70, 70), p.y + rand(-70, 70));
    pops.push({ x: p.x, y: p.y - 30, txt: t('airdropMsg'), t: 0, life: 1.4 });
    S.pickup();
  }
  // 紧急力场：生命低于 30% 自动短暂无敌（30 秒一次；原 VIP 特权，现已通用）
  if (p.forceFieldCd <= 0 && p.hp > 0 && p.hp < p.maxHp * 0.3) {
    p.forceFieldCd = 30;
    p.invulnT = Math.max(p.invulnT, 1.5);
    pops.push({ x: p.x, y: p.y - 30, txt: t('forceFieldMsg'), t: 0, life: 1.5 });
    S.zap();
  }

  // Boss 投放：杂兵铺场 1.6 秒后登场
  if (bossIn > 0) {
    bossIn -= dt;
    if (bossIn <= 0) { bossIn = -1; spawnBoss(bossType); }
  }

  // 波次推进
  if (toSpawn > 0) {
    spawnCd -= dt;
    if (spawnCd <= 0) {
      const a = Math.random() * TAU;      // 本股的方向；补的那几只也走这个方向
      spawnZombie(a);
      toSpawn--;
      // 偶尔一涌而上：匀速滴灌本身也很有规律，玩家能数出拍子
      const burst = (toSpawn > 0 && Math.random() < SPAWN_BURST_P)
        ? 1 + (Math.random() < 0.4 ? 1 : 0) : 0;
      for (let k = 0; k < burst && toSpawn > 0; k++) { spawnZombie(a); toSpawn--; }
      // 间隔抖动 + 按额外只数拉长触发间隔：只改节奏的随机性，平均出怪速度不变
      spawnCd = Math.max(0.30, (0.9 - wave * 0.04) * SPAWN_BURST_COMP) * rand(0.55, 1.5);
    }
  } else if (waveActive && zombies.length === 0) {
    waveActive = false;
    addScore(wave * 50);
    waveMsg = fmt(t('waveCleared'), wave); waveMsgT = 2;
    S.clear();
    openCards(); // 三选一强化卡，选择后进入下一波倒计时
  }
  if (!waveActive && nextWaveIn > 0) {
    nextWaveIn -= dt;
    if (nextWaveIn <= 0) { wave++; startWave(wave); }
  }
}

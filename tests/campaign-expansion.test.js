'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {REGION_SCENES,DUNGEONS,SIDE_QUESTS,DIALOGUES}=require('../campaign-expansion');
test('todas as regiões possuem mapas e pontos de interesse',()=>{for(const id of ['village','forest','cave','fire','castle','shadow']){assert.ok(REGION_SCENES[id]);assert.ok(REGION_SCENES[id].landmarks.length>=3);}});
test('cada região possui dungeon com salas de combate e enigma',()=>{for(const id of ['forest','cave','fire','castle','shadow']){assert.equal(DUNGEONS[id].length,4);assert.ok(DUNGEONS[id].some(r=>r.kind==='puzzle'));assert.ok(DUNGEONS[id].some(r=>r.kind==='boss'));}});
test('missões secundárias e diálogos estão disponíveis',()=>{assert.ok(SIDE_QUESTS.length>=5);assert.ok(DIALOGUES.chronicler.length>=2);});

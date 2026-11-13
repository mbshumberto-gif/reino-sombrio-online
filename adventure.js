'use strict';

const { randomUUID } = require('node:crypto');
const { HERO_CLASSES, EQUIPMENT, QUESTS, REGIONS } = require('./game-data');
const World = require('./public/world-data');

const LORE = {
 village:"Há vinte anos, Malakar foi derrotado na Guerra das Sete Lanternas. Antes de desaparecer, lançou uma maldição sobre as famílias que guardavam os antigos selos. Agora, os sinos tocam sozinhos, a névoa avança e moradores desaparecem durante a noite. Aderic acredita que a maldição está despertando — e que o herói marcado pela estrela pode ser a última esperança.",
 forest:"A Floresta Amaldiçoada já foi o coração vivo de Eldoria. Os guardiões élficos protegiam a Árvore-Mãe, cujas raízes mantinham o equilíbrio entre os reinos. Malakar envenenou suas raízes para abrir uma passagem ao mundo das sombras. O Ent Corrompido não nasceu maligno: foi o último guardião a resistir, e sua memória ainda guarda o nome de quem traiu os antigos reis.",
 cave:"Sob as montanhas existe uma cidade mineradora construída em torno de um fragmento caído das estrelas. Os mineiros descobriram que o cristal não era uma fonte de energia, mas uma prisão. Quando tentaram removê-lo, libertaram ecos de pessoas desaparecidas há séculos. A cada corredor, as vozes repetem lembranças de famílias que ainda esperam por seus entes queridos na superfície.",
 fire:"As Terras do Fogo abrigam a Forja do Eclipse, onde Malakar fundiu sua armadura com o metal de uma estrela morta. O calor não vem apenas do vulcão: é alimentado pela esperança roubada dos prisioneiros. O Draco de Brasas protege a chama capaz de quebrar a armadura, mas esqueceu por que jurou proteger aquele lugar.",
 castle:"Vharok foi o mais respeitado comandante de Eldoria. Ele descobriu que o rei pretendia usar os selos para controlar a magia do povo e tentou impedir o ritual. Malakar ofereceu-lhe poder para salvar seus soldados, mas transformou sua lealdade em uma prisão. Nos arquivos do castelo, cartas escondidas revelam que Vharok deixou pistas para quem tivesse coragem de terminar o que ele começou.",
 shadow:"O Reino Sombrio é uma ferida aberta entre a memória e o esquecimento. Malakar alimenta o vazio com as lembranças dos moradores que aprisionou. Se vencer, ninguém se lembrará de Eldoria, nem mesmo aqueles que nascerem depois. Para derrotá-lo, os aventureiros precisarão reunir as histórias que o tirano tentou apagar — e devolver ao povo aquilo que nunca deveria ter sido roubado."
};

const QUESTS_BY_ID = {
  lost_relic: {
    title: 'A Relíquia dos Primeiros Reis', npc: 'chronicler', reward: [85, 110],
    steps: ['Leia a inscrição no Santuário Partido.', 'Abra o relicário na última sala da masmorra.', 'Leve a relíquia ao Cronista Aderic.']
  },
  herbalist: {
    title: 'Uma cesta para Mira', npc: 'healer', reward: [34, 45],
    steps: ['Colha uma maçã de Eldoria.', 'Colha mais uma maçã.', 'Leve as maçãs a Mira.']
  },
  deep_mines: {
    title: 'Mineiros desaparecidos', npc: 'chronicler', region: 'cave', reward: [95, 125],
    steps: ['Procure sinais de mineiros na Gruta do Espelho.', 'Conte a Aderic o que encontrou.']
  },
  ember_shards: {
    title: 'Fragmentos de brasa', npc: 'blacksmith', region: 'fire', reward: [120, 170],
    steps: ['Examine a bigorna da Forja do Eclipse.', 'Leve o fragmento de brasa a Eldrin.']
  },
  royal_records: {
    title: 'A verdade sobre Vharok', npc: 'chronicler', region: 'castle', reward: [160, 200],
    steps: ['Recupere os registros na Biblioteca Proibida.', 'Converse com Aderic sobre a carta de Vharok.']
  },
  void_seals: {
    title: 'Selos do Vazio', npc: 'chronicler', region: 'shadow', reward: [200, 280],
    steps: ['Leia os nomes preservados no Jardim das Lanternas.', 'Leve a lista a Aderic.']
  },
  home_letters: {
    title: 'Cartas que encontraram o caminho', npc: 'chronicler', requires: 'shadow', reward: [180, 240],
    steps: ['Recolha a carta esquecida na Gruta do Espelho.', 'Procure a segunda carta na Biblioteca Proibida.', 'Entregue as cartas a Aderic.']
  },
  lanterns: {
    title: 'As lanternas do amanhecer', npc: 'villager', requires: 'shadow', reward: [180, 250],
    steps: ['Acenda a lanterna na praça da Vila.', 'Acenda a lanterna no Pomar.', 'Acenda a lanterna no Jardim.', 'Volte a Nara e conte quem você encontrou.']
  }
};
const CLUES = {
  'relic-clue': ['lost_relic', 0, 'A inscrição revela que a relíquia repousa atrás do Guardião das Raízes.'],
  relic: ['lost_relic', 1, 'O relicário se abre. Dentro dele, uma folha de prata traz o símbolo dos primeiros reis.'],
  miners: ['deep_mines', 0, 'Você encontra uma saída estreita e o diário dos mineiros. Eles seguiram o curso da água.'],
  embers: ['ember_shards', 0, 'Um fragmento de brasa ainda pulsa na bigorna do Eclipse.'],
  records: ['royal_records', 0, 'Uma carta confirma que Vharok tentou salvar seus soldados antes de servir a Malakar.'],
  seals: ['void_seals', 0, 'Nomes das famílias de Eldoria brilham no altar. O vazio ainda guarda suas memórias.'],
  'letters-grotto': ['home_letters', 0, 'A carta está endereçada a Sera. O filho dela escreveu que voltaria pela nascente.'],
  'letters-archive': ['home_letters', 1, 'Na segunda carta, Vharok deixa instruções para reconduzir as famílias à Vila.'],
  'lamp-village': ['lanterns', 0, 'A chama da praça ilumina o caminho de casa.'],
  'lamp-orchard': ['lanterns', 1, 'A chama do pomar acende entre as macieiras.'],
  'lamp-garden': ['lanterns', 2, 'A última lanterna brilha no Jardim das Lanternas.']
};

const DIALOGUES = {
  chronicler: [
    'Há vinte anos, as Sete Lanternas se apagaram. Aderic guardou uma delas desde aquela noite.',
    'Os selos da floresta foram feitos para proteger Eldoria. Se ouvir alguém sussurrar seu nome no bosque, siga as lanternas.'
  ],
  healer: [
    'A corrupção às vezes deixa marcas que a gente não vê. Sente um pouco antes de voltar para a estrada.',
    'A maçã de Eldoria tem cheiro de chuva. As do pomar antigo atraem até as luzes do aqueduto.'
  ],
  blacksmith: [
    'Meu mestre dizia que uma boa lâmina tem que lembrar a mão de quem a usa.',
    'Traga o que encontrar nas ruínas. Aqui você pode comparar as peças antes de vestir.'
  ],
  villager: [
    'Meu irmão foi procurar as luzes do pomar. Ele dizia que elas conheciam um atalho para casa.',
    'Quando os moradores voltarem, quero acender as lanternas para que ninguém se perca outra vez.'
  ],
  lia: [
    'Eu sou Lia. Cuido deste pomar desde antes de as árvores começarem a sussurrar.',
    'Há uma luz presa no aqueduto. Ela se acalma quando sente o cheiro de maçã fresca.'
  ]
};

const own = (record, key) => typeof key === 'string' && Object.hasOwn(record, key);
const integer = (value, fallback, max = 10000000) => Number.isFinite(value)
  ? Math.min(max, Math.max(0, Math.floor(value))) : fallback;

function newCampaign(code, ownerId, legacy = {}) {
  const cleared = Object.fromEntries(REGIONS.map(({ id }) => [id, legacy.world?.[id] === true]));
  const defeated = Object.fromEntries(REGIONS.map(({ id, enemies }) => {
    const indices = cleared[id] ? enemies.map((_, i) => i) : legacy.defeatedEnemies?.[id];
    return [id, Array.isArray(indices) ? [...new Set(indices.filter(i => Number.isInteger(i) && i >= 0 && i < enemies.length))] : []];
  }));
  const opened = Array.isArray(legacy.openedChests) ? legacy.openedChests.filter(x => typeof x === 'string')
    .map(x => x.startsWith('chest-') ? x : 'chest-' + x) : [];
  const rooms = {};
  if (legacy.dungeon && Object.hasOwn(World.DUNGEONS, legacy.dungeon.region) && Array.isArray(legacy.dungeon.cleared)) {
    rooms[legacy.dungeon.region] = legacy.dungeon.cleared.slice(0, 4).flatMap((done, index) => done === true ? [index] : []);
  }
  return {
    id: randomUUID(), code, revision: 0,
    data: { version: 2, ownerId, epoch: Date.now(), cleared, defeated, opened, rooms, orchardOpen: false,
      lamps: [], legacyMainQuests: legacy.quests || {} }
  };
}

function makeHero(name, classKey, saved = {}) {
  const key = own(HERO_CLASSES, saved.classKey) ? saved.classKey : own(HERO_CLASSES, classKey) ? classKey : 'warrior';
  const spec = HERO_CLASSES[key];
  const maxHp = Math.max(1, integer(saved.maxHp, spec.hp));
  const maxMana = Math.max(1, integer(saved.maxMana, spec.mana));
  const legacyGear = saved.equipment || {};
  const equipment = Object.fromEntries(['weapon', 'armor', 'charm'].map(slot => [slot,
    own(EQUIPMENT, legacyGear[slot]) && EQUIPMENT[legacyGear[slot]].slot === slot ? legacyGear[slot] : null]));
  const owned = Object.values(equipment).filter(Boolean);
  return {
    name: (typeof saved.name === 'string' && saved.name.trim().slice(0, 18)) || name, classKey: key,
    maxHp, hp: integer(saved.hp, maxHp, maxHp), maxMana, mana: integer(saved.mana, maxMana, maxMana),
    level: Math.max(1, integer(saved.level, 1)), xp: integer(saved.xp, 0) % 100, gold: integer(saved.gold, 50),
    baseAttack: integer(saved.baseAttack, integer(saved.attack, spec.attack)),
    baseDefense: integer(saved.baseDefense, integer(saved.defense, spec.defense)),
    baseWeapon: !equipment.weapon && typeof saved.weapon === 'string' ? saved.weapon.slice(0, 60) : spec.weapon,
    baseArmor: !equipment.armor && typeof saved.armor === 'string' ? saved.armor.slice(0, 60) : 'Vestuário de aventureiro',
    potions: integer(saved.potions, 2), apples: 0, skillPoints: integer(saved.skillPoints, 0),
    skillLevel: Math.max(1, integer(saved.skillLevel, 1)), equipment, owned, companions: { lume: 0, lia: false },
    homeCampaign: null
  };
}

function makeMember(room, heroId, legacy = {}) {
  const rawZone = legacy.campaign?.activeRegion;
  let zone = Object.hasOwn(World.zones, rawZone) ? rawZone : 'village';
  const dungeon = legacy.campaign?.dungeon;
  if (dungeon && !dungeon.finished && Object.hasOwn(World.DUNGEONS, dungeon.region)) {
    zone = World.dungeonId(dungeon.region, integer(dungeon.currentRoom, 0, 3));
  }
  const quests = Object.fromEntries(Object.entries(legacy.campaign?.sideQuests || {})
    .filter(([id, progress]) => own(QUESTS_BY_ID, id) && (progress?.accepted || progress?.completed))
    .map(([id, progress]) => [id, { step: progress.completed ? QUESTS_BY_ID[id].steps.length : 0,
      completed: Boolean(progress.completed), legacyProgress: integer(progress.progress, 0) }]));
  const { x, y } = World.safePosition(zone, legacy.x, legacy.y);
  return {
    heroId, campaignId: room.id, revision: 0,
    data: { zone, x, y, facing: ['up','down','left','right'].includes(legacy.facing) ? legacy.facing : 'down',
      quests, checkpoint: { zone, x, y }, seenEnding: false,
      dungeonEligible: dungeon?.cleared?.[3] && !dungeon.finished && Object.hasOwn(World.DUNGEONS, dungeon.region) ? [dungeon.region] : [],
      dungeonRewards: dungeon?.finished && Object.hasOwn(World.DUNGEONS, dungeon.region) ? [dungeon.region] : [] }
  };
}

function heroStats(hero) {
  const gear = Object.values(hero.equipment).map(id => EQUIPMENT[id]).filter(Boolean);
  return {
    attack: gear.reduce((value, item) => value + (item.attack || 0), hero.baseAttack),
    defense: gear.reduce((value, item) => value + (item.defense || 0), hero.baseDefense),
    weapon: EQUIPMENT[hero.equipment.weapon]?.name || hero.baseWeapon,
    armor: EQUIPMENT[hero.equipment.armor]?.name || hero.baseArmor
  };
}

function xpForNext(level) {
  return 100 + 18 * Math.max(0, level - 1);
}

function reward(hero, gold, xp) {
  hero.gold += gold;
  hero.xp += xp;
  while (hero.xp >= xpForNext(hero.level)) {
    hero.xp -= xpForNext(hero.level);
    hero.level++;
    hero.maxHp += 12;
    hero.hp = hero.maxHp;
    hero.maxMana += 8;
    hero.mana = hero.maxMana;
    hero.baseAttack += 2;
    hero.baseDefense++;
    hero.skillPoints++;
  }
}

function canOffer(id, world) {
  const quest = QUESTS_BY_ID[id];
  if (quest.requires) return world.cleared[quest.requires];
  if (!quest.region) return true;
  return world.cleared[REGIONS.find(region => region.id === quest.region)?.unlock] === true;
}

function questJournal(member, world) {
  return Object.entries(QUESTS_BY_ID).flatMap(([id, quest]) => {
    const progress = member.quests[id];
    if (!progress && !canOffer(id, world)) return [];
    return [{ id, title: quest.title, npc: World.NPCS[quest.npc].name,
      objective: progress?.completed ? 'Concluída' : quest.steps[progress?.step || 0],
      accepted: !!progress, completed: !!progress?.completed }];
  });
}

const mainQuest = region => QUESTS.find(quest => quest.region === region);

function publicCampaign(world) {
  return {
    epoch: world.epoch, cleared: world.cleared, defeated: world.defeated, opened: world.opened,
    rooms: world.rooms, orchardOpen: world.orchardOpen, lamps: world.lamps || [],
    quests: QUESTS.map(quest => ({ title: quest.title, completed: Boolean(world.cleared[quest.region] || world.legacyMainQuests?.[quest.id]?.completed) }))
  };
}

module.exports = { own, newCampaign, makeHero, makeMember, heroStats, reward, xpForNext, canOffer,
  questJournal, publicCampaign, mainQuest, quests: QUESTS_BY_ID, clues: CLUES, dialogues: DIALOGUES, lore: LORE };

'use strict';

// Conteúdo central do RPG: classes, habilidades, equipamentos, regiões e campanha.
const HERO_CLASSES = {
  warrior:{name:'Guerreiro',role:'Tanque / dano físico',hp:145,attack:15,defense:9,mana:35,weapon:'Espada de ferro',skill:{id:'golpe_poderoso',name:'Golpe poderoso',description:'Causa 2x o ataque físico.',cost:10,power:2},passive:'Recebe 15% menos dano físico.'},
  mage:{name:'Mago',role:'Dano mágico',hp:90,attack:21,defense:3,mana:110,weapon:'Cajado arcano',skill:{id:'bola_fogo',name:'Bola de fogo',description:'Explosão arcana com dano mágico elevado.',cost:25,power:2.2},passive:'Poder mágico aumentado.'},
  sorceress:{name:'Feiticeira',role:'Controle / dano mágico',hp:100,attack:18,defense:4,mana:100,weapon:'Orbe das brumas',skill:{id:'raio_arcano',name:'Raio arcano',description:'Dano mágico que enfraquece o próximo ataque inimigo.',cost:22,power:1.9},passive:'Habilidades custam menos mana.'},
  cleric:{name:'Clérigo',role:'Cura / suporte',hp:120,attack:12,defense:7,mana:100,weapon:'Maça sagrada',skill:{id:'cura_sagrada',name:'Cura sagrada',description:'Recupera vida de todo o grupo.',cost:28,power:34},passive:'Poções e curas restauram mais vida.'},
  rogue:{name:'Ladino',role:'Crítico / velocidade',hp:105,attack:18,defense:4,mana:55,weapon:'Adagas duplas',skill:{id:'golpe_sombrio',name:'Golpe sombrio',description:'Ataque forte com chance de crítico.',cost:16,power:2.1},passive:'Chance adicional de acerto crítico.'},
  bard:{name:'Bardo',role:'Suporte / inspiração',hp:110,attack:13,defense:5,mana:95,weapon:'Alaúde antigo',skill:{id:'cancao_guerreira',name:'Canção guerreira',description:'Fortalece ataque e defesa do grupo nesta rodada.',cost:24,power:1.25},passive:'A equipe recebe mais ouro quando vence.'},
  paladin:{name:'Paladino',role:'Defesa / cura',hp:150,attack:14,defense:10,mana:75,weapon:'Martelo da aurora',skill:{id:'escudo_luz',name:'Escudo de luz',description:'Reduz o próximo dano recebido por todos.',cost:22,power:0.5},passive:'Resistência elevada contra chefes.'},
  ranger:{name:'Ranger',role:'Dano à distância',hp:115,attack:18,defense:5,mana:65,weapon:'Arco élfico',skill:{id:'chuva_flechas',name:'Chuva de flechas',description:'Dispara uma sequência de flechas.',cost:18,power:1.8},passive:'Dano aumentado contra criaturas.'},
  monk:{name:'Monge',role:'Combate / equilíbrio',hp:125,attack:16,defense:7,mana:70,weapon:'Manoplas de jade',skill:{id:'punhos_ki',name:'Punhos de Ki',description:'Golpe concentrado que ignora parte da defesa.',cost:18,power:1.9},passive:'Recupera pequena quantidade de vida ao atacar.'}
};

const EQUIPMENT = {
  ironSword:{name:'Espada de ferro',slot:'weapon',attack:3,defense:0,price:35,look:'iron'},
  steelSword:{name:'Espada de aço',slot:'weapon',attack:7,defense:0,price:90,look:'steel'},
  oakStaff:{name:'Cajado de carvalho',slot:'weapon',attack:5,defense:1,price:70,look:'staff'},
  leatherArmor:{name:'Armadura de couro',slot:'armor',attack:0,defense:3,price:45,look:'leather'},
  chainArmor:{name:'Cota de malha',slot:'armor',attack:0,defense:6,price:110,look:'chain'},
  shadowCloak:{name:'Manto sombrio',slot:'armor',attack:2,defense:8,price:220,look:'shadow'},
  amberCharm:{name:'Amuleto do pomar',slot:'charm',attack:2,defense:2,price:0,look:'amber'},
  echoRing:{name:'Anel dos ecos',slot:'charm',attack:4,defense:2,price:140,look:'echo'},
  rootGuard:{name:'Peitoral de raiz',slot:'armor',attack:1,defense:7,price:0,look:'root'},
  eclipseEdge:{name:'Lâmina do eclipse',slot:'weapon',attack:15,defense:2,price:0,look:'eclipse'}
};

const REGIONS = [
  {id:'forest',name:'Floresta Amaldiçoada',level:1,unlock:null,description:'Árvores antigas, lobos sombrios e ruínas élficas.',enemies:[{name:'Lobo sombrio',hp:38,atk:9,xp:25,gold:12},{name:'Goblin ladrão',hp:48,atk:11,xp:30,gold:16},{name:'Aranha gigante',hp:44,atk:12,xp:35,gold:18},{name:'Corvo carniceiro',hp:55,atk:14,xp:38,gold:21},{name:'Javali das raízes',hp:78,atk:16,xp:48,gold:28}],boss:{name:'Ent Corrompido',hp:150,atk:17,xp:140,gold:85}},
  {id:'cave',name:'Caverna dos Ecos',level:3,unlock:'forest',description:'Galerias subterrâneas tomadas por orcs e mortos-vivos.',enemies:[{name:'Orc guerreiro',hp:68,atk:15,xp:40,gold:25},{name:'Esqueleto amaldiçoado',hp:58,atk:17,xp:45,gold:28},{name:'Troll da caverna',hp:88,atk:13,xp:50,gold:35},{name:'Morcego de cristal',hp:82,atk:20,xp:55,gold:36},{name:'Xamã subterrâneo',hp:112,atk:24,xp:70,gold:48}],boss:{name:'Troll Rei das Profundezas',hp:230,atk:23,xp:190,gold:130}},
  {id:'fire',name:'Terras do Fogo',level:6,unlock:'cave',description:'Campos vulcânicos guardados por criaturas ígneas.',enemies:[{name:'Salamandra ígnea',hp:100,atk:21,xp:70,gold:45},{name:'Cultista das chamas',hp:90,atk:24,xp:75,gold:50},{name:'Golem de magma',hp:140,atk:19,xp:85,gold:60},{name:'Escorpião de lava',hp:130,atk:28,xp:88,gold:58},{name:'Harpia das cinzas',hp:150,atk:31,xp:105,gold:72}],boss:{name:'Draco de Brasas',hp:350,atk:32,xp:300,gold:220}},
  {id:'castle',name:'Castelo dos Condenados',level:9,unlock:'fire',description:'Fortaleza em ruínas, lar dos generais de Malakar.',enemies:[{name:'Cavaleiro condenado',hp:145,atk:27,xp:100,gold:70},{name:'Necromante real',hp:120,atk:31,xp:110,gold:75},{name:'Abominação',hp:180,atk:25,xp:120,gold:85},{name:'Cão espectral',hp:180,atk:34,xp:125,gold:86},{name:'Carrasco de Vharok',hp:225,atk:38,xp:145,gold:105}],boss:{name:'General Vharok',hp:470,atk:40,xp:440,gold:310}},
  {id:'shadow',name:'Reino Sombrio',level:12,unlock:'castle',description:'O domínio de Malakar, onde a realidade se curva à escuridão.',enemies:[{name:'Guardião do vazio',hp:190,atk:34,xp:140,gold:100},{name:'Espectro ancestral',hp:160,atk:38,xp:150,gold:110},{name:'Arauto de Malakar',hp:220,atk:32,xp:165,gold:120},{name:'Devorador de almas',hp:240,atk:42,xp:175,gold:125},{name:'Cavaleiro do eclipse',hp:290,atk:46,xp:195,gold:145}],boss:{name:'Malakar, Senhor das Trevas',hp:780,atk:50,xp:800,gold:600}}
];

const QUESTS = [
  {id:'q_intro',title:'O chamado de Eldoria',description:'Reúna os aventureiros e explore a Floresta Amaldiçoada.',region:'forest',goal:1,reward:{xp:60,gold:35}},
  {id:'q_cave',title:'Ecos sob a montanha',description:'Derrote o guardião da Caverna dos Ecos.',region:'cave',goal:1,reward:{xp:100,gold:60}},
  {id:'q_fire',title:'Coração em brasa',description:'Atravesse as Terras do Fogo e derrote o Draco de Brasas.',region:'fire',goal:1,reward:{xp:180,gold:100}},
  {id:'q_castle',title:'A queda do general',description:'Conquiste o Castelo dos Condenados.',region:'castle',goal:1,reward:{xp:260,gold:160}},
  {id:'q_final',title:'O fim da escuridão',description:'Entre no Reino Sombrio e derrote Malakar.',region:'shadow',goal:1,reward:{xp:500,gold:350}}
];

// Curva de dificuldade de campanha: mais criaturas, inimigos resistentes e chefes em duas etapas.
for (const region of REGIONS) {
  for (const enemy of region.enemies) { enemy.hp = Math.ceil(enemy.hp * 1.42); enemy.atk = Math.ceil(enemy.atk * 1.28); }
  region.boss.hp = Math.ceil(region.boss.hp * 1.42); region.boss.atk = Math.ceil(region.boss.atk * 1.30);
}
const TECHNIQUES = {
  warrior: { name: 'Guarda de ferro', cost: 10, description: 'Protege o alvo marcado e contra-ataca.' },
  mage: { name: 'Pulso estelar', cost: 15, description: 'Interrompe golpes anunciados e causa dano.' },
  sorceress: { name: 'Névoa do silêncio', cost: 14, description: 'Interrompe e enfraquece o inimigo.' },
  cleric: { name: 'Bênção da aurora', cost: 24, description: 'Reanima um aliado caído. Em pé, protege a equipe e causa dano.' },
  rogue: { name: 'Passo da sombra', cost: 11, description: 'Ataca, evita o próximo golpe e quebra um totem.' },
  bard: { name: 'Acorde da vigília', cost: 14, description: 'Causa dano, restaura mana e protege o próximo alvo.' },
  paladin: { name: 'Juramento da luz', cost: 17, description: 'Golpeia o inimigo, atrai sua atenção e protege aliados.' },
  ranger: { name: 'Flecha de precisão', cost: 14, description: 'Marca a criatura e destrói um totem.' },
  monk: { name: 'Ruptura de Ki', cost: 14, description: 'Interrompe a investida e recupera vida.' }
};

module.exports = {HERO_CLASSES,EQUIPMENT,REGIONS,QUESTS,TECHNIQUES};

'use strict';

// Mapas, dungeons, missões opcionais e diálogos da campanha.
const REGION_SCENES = {
  village:{title:'Vila de Eldoria',subtitle:'O último refúgio antes das terras corrompidas',theme:'village',landmarks:['Praça central','Estalagem do Javali','Forja de Eldrin','Santuário da Luz']},
  forest:{title:'Floresta Amaldiçoada',subtitle:'As raízes guardam os segredos de uma antiga tragédia',theme:'forest',landmarks:['Bosque dos Sussurros','Ruínas élficas','Lago das Almas','Covil do Ent']},
  cave:{title:'Caverna dos Ecos',subtitle:'O som dos passos desperta coisas que deveriam permanecer enterradas',theme:'cave',landmarks:['Entrada rachada','Galeria dos Cristais','Ponte subterrânea','Trono das Profundezas']},
  fire:{title:'Terras do Fogo',subtitle:'Rios de lava cortam um território onde o ar queima',theme:'fire',landmarks:['Desfiladeiro de Cinzas','Forja dos Cultistas','Ponte de Obsidiana','Ninho do Draco']},
  castle:{title:'Castelo dos Condenados',subtitle:'Os salões de Vharok escondem os últimos registros do reino',theme:'castle',landmarks:['Pátio dos Estandartes','Salão dos Espectros','Biblioteca Proibida','Trono de Vharok']},
  shadow:{title:'Reino Sombrio',subtitle:'A realidade se desfaz sob o domínio de Malakar',theme:'shadow',landmarks:['Portão do Vazio','Jardim Morto','Catedral Negra','Câmara de Malakar']}
};
const DUNGEONS = {
  forest:[{name:'Trilha das Raízes',kind:'enemy',enemy:'Lobo alfa',hp:70,atk:13,xp:45,gold:22,description:'Pegadas enormes desaparecem entre as raízes.'},{name:'Santuário Partido',kind:'puzzle',description:'Símbolos élficos brilham nas paredes. A ordem correta abre o selo.'},{name:'Ninho Corrompido',kind:'enemy',enemy:'Aranha ancestral',hp:95,atk:15,xp:65,gold:32,description:'O chão está coberto por teias e casulos.'},{name:'Coração da Floresta',kind:'boss',enemy:'Guardião das Raízes',hp:180,atk:19,xp:150,gold:90,description:'Uma criatura antiga protege o coração da floresta.'}],
  cave:[{name:'Galeria dos Mineiros',kind:'enemy',enemy:'Orc saqueador',hp:100,atk:18,xp:65,gold:35,description:'Ferramentas abandonadas e marcas de batalha.'},{name:'Ponte dos Ecos',kind:'puzzle',description:'Ecos repetem uma sequência de três notas.'},{name:'Cripta Esquecida',kind:'enemy',enemy:'Cavaleiro esquelético',hp:145,atk:21,xp:90,gold:48,description:'Armaduras antigas se erguem dos túmulos.'},{name:'Trono Subterrâneo',kind:'boss',enemy:'Sentinela Abissal',hp:260,atk:25,xp:210,gold:130,description:'A sentinela desperta no salão inundado.'}],
  fire:[{name:'Campo de Cinzas',kind:'enemy',enemy:'Salamandra colossal',hp:155,atk:24,xp:100,gold:55,description:'Criaturas rastejam sob a crosta vulcânica.'},{name:'Templo das Brasas',kind:'puzzle',description:'Três braseiros precisam ser acesos na sequência correta.'},{name:'Forja Abandonada',kind:'enemy',enemy:'Golem incandescente',hp:210,atk:28,xp:135,gold:75,description:'O metal derretido ainda se move.'},{name:'Ninho de Obsidiana',kind:'boss',enemy:'Draco Ancião',hp:360,atk:32,xp:300,gold:190,description:'O rugido do dragão ecoa pelo vulcão.'}],
  castle:[{name:'Pátio dos Condenados',kind:'enemy',enemy:'Cavaleiro de Vharok',hp:210,atk:30,xp:140,gold:80,description:'Guardas espectrais patrulham o pátio.'},{name:'Arquivo Proibido',kind:'puzzle',description:'Um diário revela a senha escondida nos retratos.'},{name:'Salão da Tortura',kind:'enemy',enemy:'Carrasco espectral',hp:260,atk:34,xp:175,gold:95,description:'Correntes se movem sem que ninguém as toque.'},{name:'Sala do General',kind:'boss',enemy:'Campeão de Vharok',hp:470,atk:39,xp:420,gold:260,description:'O campeão bloqueia o caminho até o trono.'}],
  shadow:[{name:'Fenda do Vazio',kind:'enemy',enemy:'Devorador de luz',hp:280,atk:38,xp:190,gold:110,description:'A escuridão parece observar cada movimento.'},{name:'Labirinto das Sombras',kind:'puzzle',description:'Sombras repetem seus movimentos com alguns segundos de atraso.'},{name:'Catedral Negra',kind:'enemy',enemy:'Arauto do Abismo',hp:340,atk:42,xp:230,gold:135,description:'O altar pulsa como um coração.'},{name:'Câmara do Eclipse',kind:'boss',enemy:'Avatar de Malakar',hp:720,atk:48,xp:700,gold:450,description:'A última defesa do Senhor das Trevas.'}]
};
const SIDE_QUESTS = [
  {id:'lost_relic',region:'forest',title:'A Relíquia dos Primeiros Reis',description:'Explore a floresta e recupere a relíquia élfica perdida.',goal:2,reward:{xp:90,gold:55},dialogue:'Minha família protegeu este relicário por gerações. Encontre-o antes que a corrupção o alcance.'},
  {id:'herbalist',region:'forest',title:'Ervas para a Curandeira',description:'Derrote criaturas na floresta para coletar ervas raras.',goal:3,reward:{xp:75,gold:45},dialogue:'As criaturas carregam pólen curativo. Traga três amostras.'},
  {id:'deep_mines',region:'cave',title:'Mineiros Desaparecidos',description:'Derrote ameaças nas galerias e encontre sinais dos mineiros.',goal:3,reward:{xp:130,gold:85},dialogue:'O último grupo não voltou. Preciso saber o que aconteceu lá embaixo.'},
  {id:'ember_shards',region:'fire',title:'Fragmentos de Brasa',description:'Enfrente criaturas ígneas e reúna fragmentos de obsidiana.',goal:3,reward:{xp:190,gold:120},dialogue:'A forja precisa de fragmentos vivos. São perigosos, mas valiosos.'},
  {id:'royal_records',region:'castle',title:'A Verdade sobre Vharok',description:'Investigue os salões e recupere documentos do antigo general.',goal:3,reward:{xp:260,gold:170},dialogue:'Vharok nem sempre serviu às trevas. Os registros podem explicar sua queda.'},
  {id:'void_seals',region:'shadow',title:'Selos do Vazio',description:'Destrua os guardiões que protegem Malakar.',goal:4,reward:{xp:400,gold:260},dialogue:'Quebre os selos. Sem eles, Malakar poderá ser ferido.'}
];
const DIALOGUES = {
  chronicler:[{speaker:'Cronista Aderic',text:'As crônicas dizem que Eldoria já enfrentou uma noite sem estrelas. Malakar quer repetir esse destino.'},{speaker:'Cronista Aderic',text:'Cada região guarda uma parte da história. Não se apressem: os detalhes podem salvar suas vidas.'}],
  healer:[{speaker:'Mira, a Curandeira',text:'A corrupção não atinge apenas a carne. Às vezes, ela deixa marcas na própria alma.'},{speaker:'Mira, a Curandeira',text:'Posso restaurar suas forças por 15 ouros. Mas não posso curar a imprudência.'}],
  blacksmith:[{speaker:'Eldrin, o Ferreiro',text:'Uma boa lâmina é feita de paciência, fogo e propósito.'},{speaker:'Eldrin, o Ferreiro',text:'Traga materiais das dungeons. Um equipamento digno pode mudar o rumo de uma batalha.'}],
  villager:[{speaker:'Moradora de Eldoria',text:'As luzes da floresta se movem quando ninguém está olhando. Meu irmão foi atrás delas.'}]
};
// Salas de dungeon exigem um pouco mais de preparo, sem saltos bruscos de dificuldade.
for (const rooms of Object.values(DUNGEONS)) for (const room of rooms) if (room.hp && room.atk) { room.hp = Math.ceil(room.hp * 1.10); room.atk = Math.ceil(room.atk * 1.08); }
module.exports={REGION_SCENES,DUNGEONS,SIDE_QUESTS,DIALOGUES};

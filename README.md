# As Crônicas do Reino Sombrio

RPG cooperativo online para até 8 aventureiros, desenvolvido em Node.js, Express e Socket.IO.

## Executar localmente

```bash
npm install
npm start
``

Acesse `http://localhost:3000`.

## Persistência de personagens

O jogo usa PostgreSQL quando a variável de ambiente `DATABASE_URL` está configurada. Na inicialização, o servidor cria a tabela `game_characters`; os atributos, nível, experiência, ouro, poções e equipamentos são salvos automaticamente por um identificador de personagem guardado no navegador.

Para habilitar em produção, crie um banco PostgreSQL (por exemplo, no Render) e configure a variável `DATABASE_URL` no serviço web. O endpoint `/health` informa se a conexão de banco foi configurada. Sem essa variável, o jogo ainda inicia, mas os personagens não terão persistência após reiniciar o servidor.

## Conteúdo da campanha

- Cinco regiões com identidade visual e pontos de interesse próprios.
- Inimigos de cada região apresentados na tela da área.
- Dungeons de quatro salas por região, com encontros, enigmas e guardiões.
- Missões secundárias com objetivos e recompensas.
- Diálogos narrativos em etapas para NPCs.
- Tela de capítulo após a derrota de cada chefe principal.

## Validação

```bash
npm test
node --check server.js
node --check public/game.js
``

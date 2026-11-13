# As Crônicas do Reino Sombrio

RPG top-down cooperativo para até oito aventureiros por campanha. Explore Eldoria, encontre Lume no Pomar dos Sussurros e enfrente Malakar para trazer o povo de volta à Vila.

## Jogar localmente

Use Node.js 20 ou superior.

```sh
npm ci
npm start
```

Abra [http://localhost:3000](http://localhost:3000). Uma pessoa cria a aventura e envia o código de seis caracteres ao grupo. Na mesma rede, os amigos abrem o endereço do computador que executa o servidor. O jogo funciona em desktop e por toque. WASD ou setas movem o herói. E interage, e Espaço ataca durante o combate.

Para encontrar Lume, balance a macieira da Vila, colha a maçã após a queda e procure a luz no aqueduto do Pomar. A entrada do Pomar fica no lado leste da Floresta. Converse com Lia depois de libertar Lume. Aderic explica como procurar a relíquia, e a porta da masmorra fica no lado oeste da Floresta. As fogueiras restauram vida e mana e servem como ponto de retorno.

## Progresso persistente

Configure `DATABASE_URL` com um PostgreSQL local ou já disponível. Para conexão local de desenvolvimento sem TLS, use `PGSSLMODE=disable`. Para acesso remoto ao jogo, sirva a aplicação por HTTPS e mantenha o PostgreSQL acessível apenas ao servidor. A aplicação verifica certificados em conexões TLS do banco. Instale a CA do servidor quando necessário.

O jogo cria as tabelas `eldoria_heroes`, `eldoria_campaigns` e `eldoria_participations`. A primeira entrada do herói pela identidade anterior importa a campanha e os atributos de `game_characters`. A tabela antiga fica disponível para conferência. Faça um backup recuperável antes de migrar o banco de uma partida em uso. Use o mesmo navegador e endereço para a primeira entrada após a atualização. Depois, o menu **Histórico** oferece um código de recuperação de uso único para outro aparelho.

A opção **Continuar aventura** reabre a campanha original do herói. Para voltar a outra campanha, use o convite dela. **Sair da sala** libera o personagem para trocar de grupo. Na mesma sala, uma interrupção de até 45 segundos reserva o lugar do jogador e permite voltar à batalha. Depois de reiniciar o processo, a campanha reabre no último estado persistido fora do combate. Ouro, XP e vitória são gravados em uma transação.

O jogo abre em modo temporário quando `DATABASE_URL` está ausente. O servidor avisa desse modo na interface. `/live` informa se o HTTP responde, e `/health` indica o modo e a disponibilidade do banco. Em um computador disponível, Node.js e PostgreSQL podem rodar sem mensalidade ou APIs externas. O computador precisa ficar ligado durante as sessões.

## Testes

```sh
npm test
npx playwright install chromium
npm run test:browser
```

Para incluir migração e reinício reais, defina `ELDORIA_TEST_DATABASE_URL` para um banco PostgreSQL descartável de teste. A suíte cria e remove esquemas próprios. Em CI, há testes de mapas, salas, turno, migração e navegador em tamanhos de tela móveis.

## Arte e fontes

A ilustração do título é original, criada para Eldoria com o gerador de imagens do ChatGPT. O cenário jogável, os sprites e os efeitos são desenhados localmente em Canvas. As licenças das fontes Press Start 2P e VT323 acompanham os arquivos em `public/assets/fonts/`.

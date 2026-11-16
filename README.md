# As Crônicas do Reino Sombrio

RPG top-down cooperativo para até oito aventureiros por campanha. Explore Eldoria, encontre Lume no Pomar dos Sussurros e enfrente Malakar para trazer o povo de volta à Vila.

A expansão **Raízes do Recomeço** acrescenta a Druida (dez classes), uma horta pessoal, combate comum no próprio mapa, chefes em arenas por turnos e uma expedição de barco até a Ilha das Raízes. Veja [o roteiro da expansão](EXPANSAO.md).

## Jogar localmente

Use Node.js 20 ou superior.

```sh
npm ci
npm start
```

Abra [http://localhost:3000](http://localhost:3000). Uma pessoa cria a aventura e envia o código de seis caracteres ao grupo. Na mesma rede, os amigos abrem o endereço do computador que executa o servidor. O jogo funciona em desktop e por toque. WASD ou setas movem o herói. E interage, e Espaço ataca durante o combate.

A entrada mostra a classe do personagem salvo. Para jogar com outra classe, selecione-a e use **Criar aventura** ou **Entrar na sala**: o jogo cria outro personagem e preserva o anterior. O seletor **Personagens deste navegador** permite voltar aos heróis já usados. **Continuar aventura** retoma o personagem salvo, com sua classe e seus pertences. Os acessos ficam guardados no navegador; em modo temporário, o progresso do servidor ainda se perde ao reiniciar.

Novas aventuras usam **Exploração em tempo real · Chefes por turnos**, sem escolha de modo na entrada. Campanhas já salvas conservam sua opção para os inimigos comuns. Todos os chefes — inclusive os guardiões das dungeons e da ilha — têm uma vinheta sincronizada de apresentação e uma arena por turnos. O primeiro turno só começa depois da vinheta; atualizar a página retoma a mesma apresentação e a mesma luta. Nos combates comuns em tempo real, mova-se para sair dos círculos antes do impacto; Espaço ataca, Q usa a habilidade, R usa a técnica, F defende e T quebra o totem mais próximo. No celular, o analógico permanece ativo e AÇÃO vira ATACAR; os outros golpes têm botões próprios.

No Pomar, os quatro canteiros ao sul pertencem ao seu personagem. Sementes custam ouro; melancia, abóbora, cenoura e milho crescem pelo relógio do servidor, mesmo offline. Regar acelera uma vez. Colha e use os alimentos na mochila fora do combate. A Druida cultiva 15% mais rápido. A plantação e os alimentos acompanham o herói entre campanhas e são duráveis quando PostgreSQL está configurado.

Converse com Lia sobre a primeira colheita. Depois de derrotar Morvath, o Bruxo das Sombras, aceite **Vozes além da margem** e embarque a leste do Pomar. Proteja o convés contra dois saqueadores para alcançar a ilha. Os inimigos comuns do convés usam combate no mapa em qualquer campanha; o chefe da ilha entra em arena por turnos. Derrote o Carcereiro das Raízes para libertar Marina e Caio. Cada guardião principal devolve um fragmento da Lanterna e liberta moradores que aparecem na Vila; o diário acompanha o resgate.

Para encontrar Lume, balance a macieira da Vila, colha a maçã após a queda e procure a luz no aqueduto do Pomar. A entrada do Pomar fica no lado leste da Floresta. Converse com Lia depois de libertar Lume. Aderic explica como procurar a relíquia, e a porta da masmorra fica no lado oeste da Floresta. As fogueiras restauram vida e mana e servem como ponto de retorno. A princesa Maria Rita, guardiã das memórias de Eldoria, aguarda o resgate no domínio de Malakar.

A Vila tem quatro casas, e Lia mora no Pomar. Ao entardecer, NPCs e moradores resgatados caminham para suas casas; à noite, recolhem-se e as janelas ficam iluminadas. Interaja na porta para conversar, entregar missões, comprar equipamentos ou descansar. Pela manhã, eles voltam às atividades. O ciclo compartilhado dura 88 segundos. Pássaros cruzam as áreas ao ar livre durante o dia e o entardecer; à noite, aparecem morcegos. Mira, Eldrin e Nara são NPCs negros com aparências próprias, Maria Rita tem cabelos cacheados e os goblins têm pele verde e orelhas pontudas.

O castelinho fica ao norte da praça da Vila, com o portão fechado até o resgate da princesa Maria Rita. Depois de derrotar Malakar, volte à Vila e use AÇÃO diante do portão para conhecer o salão e o livro de memórias da princesa. O resgate libera a entrada para todos os aventureiros daquela campanha. Os caminhos laterais mantêm o atalho do Pomar acessível antes de o castelo abrir.

Quem viaja com você é o **Eco de Lia**, um clone; a Lia original permanece no Pomar. Se você cair em combate enquanto um Eco acompanha a jornada, ele morre. Lia ergue uma lápide em sua homenagem no **Memorial dos Ecos**, ao sul do Pomar. Resgate o próximo clone no broto luminoso próximo ao memorial. Fugir com vida ou perder a conexão não sacrifica o Eco. As homenagens são compartilhadas pela campanha, e o estado do companheiro acompanha o personagem. O Troll Rei das Profundezas também tem uma aparência própria: corpo rochoso assimétrico, presas e uma coroa de estalagmites, com cristais que despertam conforme suas fases.

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

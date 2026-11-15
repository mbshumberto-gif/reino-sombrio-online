# Raízes do Recomeço

Esta entrega amplia Vila, Floresta e Pomar como primeira região de referência. Preserva personagens, recuperação, campanhas por convite e o combate por turnos das aventuras existentes. Não exige apagar saves nem recriar tabelas.

## Roteiro para jogar

1. Crie uma aventura com combate **Na própria tela**. A Druida é uma nova opção de personagem; escolher outra classe na entrada não transforma um personagem já salvo.
2. Colha uma maçã na Vila, encontre Lume no Pomar e convide Lia. Converse com ela para aceitar **Uma horta para o recomeço**.
3. Use um dos quatro canteiros pessoais ao sul do Pomar, plante, regue e volte para colher. Entregue a notícia da colheita a Lia. Alimentos ficam na mochila e restauram energia fora da luta.
4. Explore a Floresta e sua dungeon. Morvath, o Bruxo das Sombras, aparece depois das cinco criaturas. Após a vinheta, enfrente as três fases do feiticeiro em uma arena por turnos: leia os golpes anunciados, quebre os totens e prepare sua defesa.
5. A vitória devolve o fragmento Raiz e liberta Tomás e Elara. A Vila passa a mostrar os moradores salvos.
6. Aceite **Vozes além da margem** com Lia, embarque a leste do Pomar, defenda o convés e alcance a ilha. O Carcereiro protege Marina e Caio. Volte a Lia após o resgate.
7. Continue a campanha pelos outros guardiões para recuperar os cinco fragmentos. Malakar mantém a princesa Maria Rita e as últimas memórias aprisionadas. Sua derrota liberta a princesa e devolve a memória ao reino.

## Escolhas de combate

O modo é escolhido ao criar a campanha e compartilhado pelo grupo. Aventuras antigas conservam o modo dos inimigos comuns. Novas aventuras oferecem os dois modos para explorar. Os inimigos comuns do barco usam combate no mapa. Todos os chefes, incluindo dungeons e ilha, têm vinheta e arena por turnos, independentemente do modo da campanha.

No mapa, jogadores próximos ao início do encontro participam; jogadores distantes não são arrastados para a luta. Movimento continua livre, mas portais e interações ficam bloqueados durante o encontro. Dano, alcance, custo de mana e tempo entre ações são validados pelo servidor. Inimigos comuns permitem recuo; chefes exigem vitória ou derrota.

Cada chefe tem três fases, golpes anunciados e proteções que exigem decisões do grupo. Morvath usa maldições, totens sombrios e um eclipse arcano. Na arena, cada jogador escolhe sua ação na sua vez; defender, interromper e apoiar o grupo ajudam a enfrentar os golpes preparados. Todas as classes podem quebrar totens. A vinheta usa o relógio do servidor, não consome o tempo do primeiro turno e não permite ataques antecipados. A opção de reduzir movimento mantém a apresentação legível sem flashes.

## Vida na Vila

Mira, Eldrin e Nara têm pele negra e penteados próprios, preservando seus serviços e histórias. Maria Rita aparece com cabelos cacheados em seus retratos, no cativeiro e após o resgate. Os goblins usam um desenho verde próprio, com orelhas pontudas e adaga.

As quatro casas da Vila e a casa de Lia no Pomar têm colisão e portas acessíveis. NPCs e moradores resgatados percorrem caminhos transitáveis ao entardecer e ficam dentro de casa durante a noite. As portas mantêm cura, loja e missões disponíveis; os moradores saem pela manhã. O relógio do servidor orienta essas rotinas, as janelas iluminadas e a troca de pássaros por morcegos nas áreas ao ar livre. A preferência por movimento reduzido diminui a animação dos animais.

## Persistência e limites desta entrega

- Canteiros, alimentos, habilidades e equipamentos pertencem ao personagem. Resgates, guardiões e rota do barco pertencem à campanha; missões secundárias pertencem à participação do herói naquela campanha.
- Com PostgreSQL, plantio e recompensas usam a transação e o controle de revisão já existentes. Sem banco, a interface continua identificando a sessão como temporária.
- Uma falha ao gravar desfaz a alteração antes de confirmar ao cliente. O relógio do cliente não decide quando a colheita fica pronta.
- A reconexão dentro da reserva de 45 segundos mantém o encontro em memória. Reiniciar o processo restaura o checkpoint persistido anterior ao combate; não restaura uma luta em andamento.
- O mundo continua baseado em campanhas para até oito participantes por processo. Esta entrega não implementa um MMO distribuído, novas contas de acesso nem uma rotina operacional de backup.

## Próximas etapas

1. Testar o combate com jogadores reais em celulares e ajustar alcance, velocidade, dificuldade e posição dos botões. Ajustar o ritmo entre a exploração no mapa, a vinheta e os turnos dos chefes a partir dessas sessões.
2. Aprofundar a região com decisões em missões, rotinas reativas dos NPCs, especializações de companheiros e equipamentos que mudem estratégias.
3. Separar encontros independentes e recompensas pessoais; definir como novos jogadores participam de uma campanha já avançada.
4. Versionar saves, testar backups restauráveis, melhorar recuperação de identidade e medir latência, filas e carga antes de expandir a população.
5. Expandir as próximas regiões usando esta entrega como referência de conteúdo, testes e custo de produção.

## Verificação

`npm test` cobre regras, cultivo, classes, mapas, sessões e integração Socket.IO. Os testes PostgreSQL usam `ELDORIA_TEST_DATABASE_URL` e um banco descartável. `npm run test:browser` cobre controles antigos e a expansão em Chromium; iOS e aparelhos físicos ainda precisam de validação.

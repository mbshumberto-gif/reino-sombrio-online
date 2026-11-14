# Raízes do Recomeço

Esta entrega amplia Vila, Floresta e Pomar como primeira região de referência. Preserva personagens, recuperação, campanhas por convite e o combate por turnos das aventuras existentes. Não exige apagar saves nem recriar tabelas.

## Roteiro para jogar

1. Crie uma aventura com combate **Na própria tela**. A Druida é uma nova opção de personagem; escolher outra classe na entrada não transforma um personagem já salvo.
2. Colha uma maçã na Vila, encontre Lume no Pomar e convide Lia. Converse com ela para aceitar **Uma horta para o recomeço**.
3. Use um dos quatro canteiros pessoais ao sul do Pomar, plante, regue e volte para colher. Entregue a notícia da colheita a Lia. Alimentos ficam na mochila e restauram energia fora da luta.
4. Explore a Floresta e sua dungeon. O Ent aparece depois das cinco criaturas. Saia dos círculos anunciados, quebre os totens de seiva e enfrente sua tempestade final.
5. A vitória devolve o fragmento Raiz e liberta Tomás e Elara. A Vila passa a mostrar os moradores salvos.
6. Aceite **Vozes além da margem** com Lia, embarque a leste do Pomar, defenda o convés e alcance a ilha. O Carcereiro protege Marina e Caio. Volte a Lia após o resgate.
7. Continue a campanha pelos outros guardiões para recuperar os cinco fragmentos. Malakar mantém as últimas memórias aprisionadas e anuncia raios que drenam mana quando acertam.

## Escolhas de combate

O modo é escolhido ao criar a campanha e compartilhado pelo grupo. Aventuras antigas continuam por turnos. Novas aventuras oferecem os dois modos para comparar a experiência. A expedição de barco e ilha sempre usa combate no mapa.

No mapa, jogadores próximos ao início do encontro participam; jogadores distantes não são arrastados para a luta. Movimento continua livre, mas portais e interações ficam bloqueados durante o encontro. Dano, alcance, custo de mana e tempo entre ações são validados pelo servidor. Inimigos comuns permitem recuo; chefes exigem vitória ou derrota.

Cada chefe tem três fases e uma identidade mecânica: seiva regeneradora na Floresta, fissuras na Caverna, brasas com novo impacto no Fogo, golpe em linha de Vharok e raios de Malakar. Os círculos mostram onde o golpe atingirá; defender reduz dano e não impede movimento. Todas as classes podem quebrar totens de perto.

## Persistência e limites desta entrega

- Canteiros, alimentos, habilidades e equipamentos pertencem ao personagem. Resgates, guardiões e rota do barco pertencem à campanha; missões secundárias pertencem à participação do herói naquela campanha.
- Com PostgreSQL, plantio e recompensas usam a transação e o controle de revisão já existentes. Sem banco, a interface continua identificando a sessão como temporária.
- Uma falha ao gravar desfaz a alteração antes de confirmar ao cliente. O relógio do cliente não decide quando a colheita fica pronta.
- A reconexão dentro da reserva de 45 segundos mantém o encontro em memória. Reiniciar o processo restaura o checkpoint persistido anterior ao combate; não restaura uma luta em andamento.
- O mundo continua baseado em campanhas para até oito participantes por processo. Esta entrega não implementa um MMO distribuído, novas contas de acesso nem uma rotina operacional de backup.

## Próximas etapas

1. Testar o combate com jogadores reais em celulares e ajustar alcance, velocidade, dificuldade e posição dos botões. Definir qual modo será o principal a partir dessas sessões.
2. Aprofundar a região com decisões em missões, rotinas reativas dos NPCs, especializações de companheiros e equipamentos que mudem estratégias.
3. Separar encontros independentes e recompensas pessoais; definir como novos jogadores participam de uma campanha já avançada.
4. Versionar saves, testar backups restauráveis, melhorar recuperação de identidade e medir latência, filas e carga antes de expandir a população.
5. Expandir as próximas regiões usando esta entrega como referência de conteúdo, testes e custo de produção.

## Verificação

`npm test` cobre regras, cultivo, classes, mapas, sessões e integração Socket.IO. Os testes PostgreSQL usam `ELDORIA_TEST_DATABASE_URL` e um banco descartável. `npm run test:browser` cobre controles antigos e a expansão em Chromium; iOS e aparelhos físicos ainda precisam de validação.

# Brisoft Shop — piloto local

Projeto independente derivado do Brisoft Desk. O visual do menu, barra superior, fila de conversas, cards, balões de mensagem e janela de transferência foi reaproveitado. Os módulos comerciais usam as mesmas cores, fontes e controles.

## Acesso atual

- Endereço: http://localhost:5180/dashboard
- Login local: `admin@brisoft.local`
- Senha de demonstração: `<senha configurada em BOOTSTRAP_ADMIN_PASSWORD>`
- API: http://localhost:3010/api/health

As credenciais acima são exclusivas desta demonstração. O arquivo `server/.env` é local, não versionado, e contém uma chave de assinatura gerada para este projeto. Nenhuma credencial, sessão de WhatsApp ou dado do Desk original foi copiado.

## Recursos disponíveis

- Dashboard de comércio: quantidade de produtos, disponibilidade, notas importadas e alterações recentes. Sem desempenho de atendentes, SLA ou avaliações.
- Produtos: cadastro e edição de nome, código, código de barras, categoria, unidade, preço e disponibilidade manual. A edição concorrente é bloqueada por versão.
- NF-e: leitura de XML ou PDF cadastra os novos produtos automaticamente com preço de venda pendente. Produtos existentes são preservados por código ou código de barras. Complete preços e disponibilidade em Produtos.
- Histórico: últimas 100 alterações da loja, com autor, data e valores anteriores e novos.
- Simulador: Gemini interpreta perguntas quando configurado; o servidor responde com preços e disponibilidade do cadastro. Sem configuração ou no limite diário, usa consulta direta ao catálogo. Veja INTEGRACOES_TESTE.md.
- Departamentos: cadastro, edição e desativação de setores, como Balcão, Açougue e Caixa.
- Conversas: mantém os componentes visuais do Desk, com mensagens, transferência por departamento, observação, resposta da equipe e encerramento. Conversas podem vir do simulador ou do WhatsApp Cloud API de teste, após concluir credenciais, destinatários e webhook na Meta. O status real aparece em Configurações.
- Configurações: nome da loja, descrição, endereço, telefone e texto de horários. Endereço e horários são consultados pelo atendimento com Gemini configurado.

## Testar o fluxo

1. Confira o produto de demonstração em **Produtos**. Altere seu preço e disponibilidade, se desejar.
2. Em **Importar NF-e**, selecione seu XML ou PDF. Também está disponível um **XML de exemplo** sintético, sem validade fiscal.
3. Envie o arquivo. Os itens novos aparecem automaticamente em Produtos com preço pendente. Confira e edite os preços de venda e a disponibilidade nessa tela.
4. Consulte o catálogo no **Simulador de IA**. Pergunte pelo nome ou código de um produto.
5. Em **Conversas**, abra a conversa criada pelo simulador.
6. Use **Transferir atendimento** para encaminhar ao Balcão, Açougue ou Caixa. As mensagens permanecem na conversa.
7. Responda como equipe. Em **Ver como cliente de teste**, acompanhe a mesma conversa no simulador. O bot fica pausado após a transferência.
8. O menu de opções permite encerrar a conversa preservando o histórico.

A quantidade do XML é apenas referência. A importação não controla estoque e não restaura disponibilidade automaticamente. O custo de compra da nota nunca vira preço de venda sem conferência. Produtos existentes não são sobrescritos pela importação; os itens reconhecidos por código ou código de barras começam desmarcados e podem ser editados em Produtos.

Limites: 2 MB por arquivo, 500 itens, chave de 44 dígitos. PDF: até 20 páginas, texto selecionável e tabela DANFE reconhecível; imagens digitalizadas precisam de OCR (ainda não incluído). PDFs protegidos, ilegíveis ou com linhas inconsistentes são recusados. A importação identifica o formato; confira os dados em Produtos; custo unitário não inclui rateio de frete e descontos. A mesma chave não pode ser confirmada novamente, mesmo mudando de PDF para XML. Os arquivos PDF originais não são armazenados nem enviados a serviços externos.

No XML, DTD e declarações de entidades são rejeitados. Não há validação de assinatura digital, destinatário ou autorização na SEFAZ.

## Dados locais

O piloto salva empresas, produtos, notas, departamentos, conversas e histórico em `server/data/shop-local.json`. Esse arquivo é ignorado pelo Git. Os dados sobrevivem às reinicializações do servidor. Não o apague se quiser preservar seus testes.

Esta persistência é para uma única instância local. Não substitui o PostgreSQL nem o Supabase para operação com clientes reais. O arquivo contém as mensagens de teste, sem senhas em texto ou chaves de integração. Os hashes de senha e os registros de sessão da equipe também são privados do servidor.

Cada operação usa o estabelecimento vinculado ao usuário autenticado. Um identificador de empresa enviado pelo navegador não troca esse vínculo. O administrador pode cadastrar usuários definitivos para sua loja e autorizar atendentes por departamento. Veja ACESSOS_LOCAIS.md para testar com acessos separados.

## Executar novamente

Node.js 24. Na primeira execução, instale as dependências:

```powershell
npm ci --prefix client
npm ci --prefix server
```

Se `server/.env` ainda não existir, copie `server/.env.example` e defina uma chave `JWT_SECRET` própria e as credenciais locais de bootstrap. Mantenha as variáveis Supabase vazias, `SHOP_DEMO_MODE=true` e `WHATSAPP_AUTO_RECONNECT=false` enquanto o foco for local.

Terminal 1:

```powershell
npm run dev --prefix server
```

Terminal 2:

```powershell
npm run dev --prefix client -- --host 127.0.0.1
```

Abra http://localhost:5180. A interface reflete as alterações de código automaticamente. O servidor observa os arquivos e reinicia quando necessário. Use Ctrl+C nos terminais para encerrar.

## Validação desta etapa

```powershell
npm test --prefix server
npm test --prefix client
npm run build --prefix client
```

132 testes do servidor e 19 da interface passaram, incluindo testes herdados e novos. Os novos verificam isolamento do catálogo, preços, conflitos de edição, XML inseguro, confirmação atômica, importação duplicada, transferência entre setores, pausa do bot e persistência após reinicialização.

Também foram conferidos no servidor local: autenticação obrigatória, indisponibilidade das rotas antigas de indicadores e QR Code, consulta ao catálogo, departamentos e conversas de teste.

## O que foi retirado da aplicação ativa

Dashboard de atendimento, Desempenho, avaliações, Painel TV, chat interno de equipe, alertas de fila sem atendente e tarefas automáticas da antiga integração por QR Code. As rotas de API do Desk não estão expostas no servidor do Shop. Parte do código legado permanece nos arquivos para referência e reaproveitamento, mas não está montada na aplicação.

O módulo de conversas mantém a fila, os cards, os balões e o modal de transferência do Desk. A adaptação local altera a origem dos dados, sem reativar a integração antiga. Anexos e áudio ainda não estão implementados no novo piloto; os controles correspondentes não enviam arquivos.

## Etapas posteriores

- Configurar projetos próprios no Render e Supabase, conforme decisão do responsável. O código utiliza o repositório próprio https://github.com/Jeferson-Brito/Brisoft_Shop. Render e Supabase ainda aguardam configuração.
- Concluir o armazenamento de todos os módulos no novo PostgreSQL, migrar e validar os usuários e as permissões por departamento no banco definitivo.
- Validar a cota gratuita e o uso do Gemini com perguntas de teste. Não há ativação de faturamento nesta etapa.
- Concluir a ativação do número de teste, destinatários e webhook HTTPS na Meta. O código de assinatura, deduplicação, fila e associação à empresa está implementado; sem as credenciais, o canal fica desativado.
- Validar publicação, dependências, backups, restauração e segurança antes da operação real.

Este piloto ainda não está pronto para produção. Os scripts SQL do catálogo foram preparados em etapa anterior; a configuração e validação do novo serviço de banco permanecem para depois.

## Equipe e permissões — incremento atual

Disponível em http://127.0.0.1:5180/usuarios. Administradores cadastram acessos e autorizam os departamentos de cada atendente. Alterações de acesso revogam as sessões; transferências para outro setor retiram a conversa da fila do atendente anterior. Veja [ACESSOS_LOCAIS.md](ACESSOS_LOCAIS.md) para o roteiro completo de teste.

A leitura atual cadastra os itens novos sem preço (valor nulo, distinto de zero) e com disponibilidade inicial Sem estoque. É possível filtrar Sem preço de venda e preencher depois. O atendimento nunca anuncia preço zero para itens pendentes. As rotas antigas de prévia/conferência permanecem apenas por compatibilidade; a interface usa leitura e cadastro automático.

## IA e WhatsApp de teste

Consulte [INTEGRACOES_TESTE.md](INTEGRACOES_TESTE.md) para configuração, cotas gratuitas, restrições e estado do piloto. As credenciais reais ficam apenas no ambiente local e nunca são publicadas neste repositório.

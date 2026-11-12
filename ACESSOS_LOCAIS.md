# Usuários — Brisoft Shop

O módulo funciona no piloto local, com o visual do Desk preservado. Nenhum serviço externo é necessário.

## Cadastrar a equipe

1. Acesse http://127.0.0.1:5180/usuarios como administrador.
2. Para o acesso inicial, use `admin@brisoft.local` e a senha `<senha configurada em BOOTSTRAP_ADMIN_PASSWORD>`. O campo Empresa pode ficar em branco para esse acesso de demonstração.
3. Clique em **Novo usuário** e informe nome, e-mail e uma senha de 12 a 128 caracteres.
4. Escolha o perfil:
   - **Administrador:** gerencia a loja e todos os departamentos.
   - **Atendente:** acompanha, responde, transfere e encerra apenas as conversas dos setores autorizados.
5. Para atendentes, selecione um ou mais departamentos ativos e salve.
6. Informe ao funcionário o identificador exibido na tela de equipe, seu e-mail e a senha que você definiu. A senha não pode ser consultada novamente pela plataforma.

É possível cadastrar um administrador definitivo para a mesma empresa usando outro e-mail, sem copiar ou perder o catálogo. O administrador de demonstração não aparece na lista de usuários e continua habilitado enquanto `BOOTSTRAP_ADMIN_PASSWORD` estiver configurada no ambiente local.

## Testar Balcão e Açougue

1. Crie um atendente autorizado apenas no **Balcão** e outro apenas no **Açougue**.
2. Mantenha o administrador na janela normal e abra uma janela anônima ou outro perfil de navegador para o atendente. Abas do mesmo perfil compartilham os dados de login e não são indicadas para simular pessoas diferentes.
3. O atendente entra informando **Empresa**, **E-mail** e **Senha**. O identificador da empresa atual aparece em Usuários.
4. Como administrador, crie uma conversa pelo simulador e transfira para o Balcão.
5. O atendente do Balcão verá a conversa; o do Açougue ainda não terá acesso.
6. Quando o Balcão transferir para o Açougue, a conversa sairá de sua fila e o link direto deixará de permitir acesso. O Açougue receberá o histórico preservado.

Atendentes não veem produtos, notas, configurações, gestão de usuários ou histórico administrativo. Podem escolher outros departamentos ativos da mesma loja como destino de uma transferência, sem ter acesso à fila desses setores.

## Alterar ou desativar acessos

- Use **Editar** na tela da equipe para alterar perfil, setores, nome, e-mail ou situação.
- Deixe a nova senha vazia para manter a atual. Para trocar a senha, informe uma nova e confirme.
- Toda alteração encerra as sessões desse usuário, que precisará entrar novamente. Isso também vale quando um administrador edita o próprio usuário.
- Desative o usuário para impedir novos acessos, preservando os registros de suas ações.
- Não é possível desativar ou retirar o próprio perfil administrativo pelo formulário.
- Departamentos com funcionários ativos vinculados precisam ser removidos desses acessos antes de serem desativados. Conversas em andamento também devem ser transferidas antes da desativação do setor.

As alterações ficam no histórico, incluindo a indicação de troca de senha, sem registrar a senha ou o hash no histórico.

## Persistência e limites desta etapa

Os usuários, hashes de senha e registros das sessões ficam em `server/data/shop-local.json`, junto dos demais dados do piloto. Senhas em texto não são salvas. O arquivo é privado do servidor e ignorado pelo Git. Sessões duram até 8 horas e são verificadas novamente a cada solicitação, incluindo atividade e versão do acesso.

O login por empresa diferencia e-mails iguais cadastrados em estabelecimentos distintos. A empresa é obtida do vínculo do usuário, nunca escolhida por um campo de empresa em operações administrativas.

Este módulo está implementado para a persistência local de uma única instância. A integração com o banco definitivo, recuperação de senha por e-mail e criação de novas empresas continuam como etapas posteriores. Render e Supabase continuam sem configuração nesta etapa.

O cadastro usa a tela e o formulário originais do Desk, com cargo, foto, telefone e os perfis Administrador, Supervisor e Analista/Atendente. No piloto Shop, somente administradores gerenciam cadastros e acessos. Supervisores e atendentes acessam as conversas dos departamentos autorizados. Contas anteriores com perfil Atendente continuam válidas; editar pelo formulário usa Analista sem mudar a senha. A API única de usuários é `/api/users`; o endereço antigo `/equipe` redireciona para `/usuarios`.

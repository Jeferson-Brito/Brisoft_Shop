# Integrações de teste — Brisoft Shop

## Estado e custos

O simulador usa Gemini quando configurado para a empresa. O projeto de teste deve permanecer no nível gratuito do Google AI Studio, sem ativar faturamento. O servidor limita as chamadas a 20 por dia (UTC) por padrão, inclusive após reiniciar. A cota do Google pode ser menor. Falhas ou limite atingido usam consulta direta ao catálogo, com aviso na interface. Não existe troca automática para outro modelo/provedor pago.

O Google informa que conteúdo do nível gratuito pode ser usado para melhorar os modelos. Use perguntas fictícias nos testes. O sistema envia nomes/códigos de produtos e as últimas perguntas, sem encaminhar notas fiscais, custos, hashes, tokens ou o número do WhatsApp ao Gemini. O modelo interpreta a intenção e escolhe produtos; o servidor monta a resposta com preços e disponibilidade atuais. Não há texto livre do modelo anunciando preços.

## Configuração privada

As chaves ficam exclusivamente em `server/.env`, ignorado pelo Git. Nunca inserir no frontend, README, prints ou comentários de PR. O exemplo de variáveis está em `server/.env.example`.

- `GEMINI_ENABLED=true`, `GEMINI_API_KEY`, `GEMINI_COMPANY_ID`, `GEMINI_MODEL`, `GEMINI_DAILY_LIMIT`.
- `WHATSAPP_CLOUD_ENABLED=true`, `WHATSAPP_CLOUD_MODE=test`, `WHATSAPP_COMPANY_ID`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_TEST_RECIPIENTS` (números internacionais apenas com dígitos, separados por vírgula), `WHATSAPP_GRAPH_VERSION` e `WHATSAPP_DAILY_LIMIT`.

A vinculação é por identificador da empresa no servidor. O piloto suporta um projeto Gemini e um número Cloud API, atribuídos explicitamente a uma empresa. Não é ainda o cadastro autônomo de números de vários contratantes. A página Configurações mostra o estado e a cota local sem revelar segredos. Reinicie o backend após mudar o `.env`.

## Meta / número gratuito de teste

1. Concluir login e registro de desenvolvedor na Meta, inclusive confirmação do celular e termos apresentados.
2. Criar o aplicativo Brisoft Shop com caso de uso WhatsApp. Selecionar o número que a própria Meta identifica como número de teste. Não cadastrar número de produção, cartão ou campanha paga.
3. Obter token temporário, Phone Number ID e segredo do aplicativo. O token temporário expira conforme indicado pela Meta.
4. Adicionar e verificar seu destinatário de teste; usar somente esse número na lista local de destinatários permitidos.
5. Configurar callback HTTPS `/api/whatsapp/webhook`, token de verificação próprio e assinatura do campo `messages`.
6. Enviar uma mensagem de texto do seu WhatsApp para o número de teste. A conversa deve surgir no Shop, receber resposta da IA e permitir transferência para equipe. Não iniciaremos mensagens para contatos sem autorização específica.

O canal só envia texto para destinatários previamente autorizados e dentro de 24 horas da última mensagem recebida. Não há envio de templates ou campanhas. Limite local padrão: 50 tentativas de envio por dia (UTC), no máximo 100. Essas restrições complementam o uso obrigatório do número gratuito de teste; não substituem as condições e cotas da Meta.

## Receber webhooks com o projeto local

O callback precisa estar acessível na internet. Para teste pode-se usar um Quick Tunnel gratuito da Cloudflare sem publicar o painel inteiro:

1. Iniciar o backend normalmente na porta 3010.
2. Rodar `npm run whatsapp:webhook --prefix server`: relay local na porta 3011.
3. Com o cloudflared oficial instalado, rodar `cloudflared tunnel --url http://127.0.0.1:3011`.
4. Usar `https://ENDERECO-GERADO.trycloudflare.com/api/whatsapp/webhook` como callback na Meta.

O relay recusa todas as outras rotas, inclusive login, produtos e arquivos. O callback POST exige HMAC-SHA256 válido do corpo original, além da associação ao Phone Number ID configurado. Ao parar o túnel, a URL deixa de funcionar; ao criar outro, é necessário atualizar a Meta. Um túnel não é hospedagem de produção. A verificação GET usa o token privado configurado.

## Persistência e falhas

Mensagens recebidas, IDs de deduplicação e fila de envio ficam no mesmo arquivo local do piloto. O webhook confirma somente depois de salvar a mensagem; a IA e o envio são processados fora da requisição. Após transferência humana o bot pausa. Respostas da equipe entram na mesma fila.

A interface distingue envio pendente, em processamento, aceito pela API, com falha ou incerto. “Aceito” não significa entregue/lido. Timeout ou reinício durante envio não dispara reenvio automático: confirme no celular antes de reenviar, para evitar duplicações. Esta etapa não implementa mídia, templates, reprocessamento automático de falhas, status de leitura, banco definitivo ou múltiplas instâncias.

## Fontes oficiais

- Google: https://aistudio.google.com/docs/pricing
- Google: https://aistudio.google.com/api-reference/generate-content
- Meta: https://whatsappbusiness.com/developers/developer-hub/
- Meta: https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started
- Cloudflare: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/

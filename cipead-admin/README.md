# CIPEAD — Painel Administrativo do Canal de Denúncias

Fase atual: **aprovação de design e modelo de dados**. Nenhuma integração
backend foi iniciada (conforme combinado).

## Conteúdo

| Arquivo | O que é |
|---|---|
| `mockup/index.html` | Protótipo estático navegável do painel (abrir direto no navegador). Sidebar preta colapsável, dashboard, listagem com filtros/estado vazio, detalhe com evidências, tela restrita de contatos e auditoria. Dados 100% fictícios. |
| `docs/schema.sql` | Proposta de schema SQL Server: relato, arquivos, contato (sem FK, ligação por HMAC), auditoria append-only, contas de serviço com privilégio mínimo e Row-Level Security. |
| `docs/seguranca.md` | Estratégia de hash do protocolo (HMAC-SHA256 + pepper) e criptografia dos campos de identidade (AES-256-GCM com versionamento de chave), tokens temporários de download, autenticação. |

## Dúvidas em aberto (decisão jurídica/organizacional)

1. **Retenção de dados (LGPD):** por quanto tempo relato, contato, arquivos e
   logs de auditoria devem ser mantidos? Prazos diferentes por tabela?
   Expurgo automático ou mediante decisão da comissão? A identidade pode ser
   expurgada antes do relato (anonimização definitiva)?
2. **Membros com acesso nomeado:** quem são os membros da CIPEAD que terão
   conta no painel? O acesso é individual e nominal (necessário para a
   auditoria fazer sentido — nada de conta compartilhada). Quem
   administra entrada/saída de membros, e o que acontece com os logs de um
   membro que sai da comissão?
3. **LDAP:** o servidor de hospedagem do painel tem acesso de rede ao LDAP
   institucional? Se não, aceita-se o fallback com senha local (bcrypt)?
4. **Guarda dos segredos criptográficos:** quem custodia o pepper e as chaves
   AES (TI institucional? presidência da comissão?) e qual o procedimento de
   recuperação/rotação? Se a chave for perdida, os contatos são
   irrecuperáveis — isso precisa estar formalizado.
5. **Denúncia anônima:** o formulário permite envio sem contato? (O modelo já
   suporta: simplesmente não há linha na tabela de contato.)
6. **E-mail de notificação:** qual endereço institucional da CIPEAD recebe o
   aviso de nova denúncia, e o servidor tem SMTP autorizado para enviá-lo?
7. **Backups:** os backups do banco herdam a criptografia de coluna (sim, os
   blobs permanecem cifrados), mas os arquivos de evidência em disco entram na
   rotina de backup de quem? Mesmo regime de retenção?

## Próximos passos (após aprovação)

1. Visual aprovado → montar o frontend React + Tailwind + shadcn/ui sobre o
   layout do mockup (gráficos com recharts).
2. Schema aprovado → criar o banco, o endpoint POST do formulário
   (persistência + protocolo + hash + criptografia), upload seguro e
   notificação por e-mail.
3. Painel autenticado, tela de contatos com log de acesso e auditoria.

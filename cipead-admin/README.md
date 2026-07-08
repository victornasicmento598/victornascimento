# CIPEAD — Painel Administrativo do Canal de Denúncias

Fase atual: **aprovação de design e modelo de dados**. Nenhuma integração
backend foi iniciada (conforme combinado).

## Conteúdo

| Arquivo | O que é |
|---|---|
| `mockup/index.html` | Protótipo estático navegável do painel (abrir direto no navegador). Sidebar preta colapsável, dashboard, listagem com filtros/estado vazio, detalhe com evidências, tela restrita de contatos e auditoria. Dados 100% fictícios. |
| `docs/schema.sql` | Proposta de schema SQL Server: relato, arquivos, contato (sem FK, ligação por HMAC), auditoria append-only, contas de serviço com privilégio mínimo e Row-Level Security. |
| `docs/seguranca.md` | Estratégia de hash do protocolo (HMAC-SHA256 + pepper) e criptografia dos campos de identidade (AES-256-GCM com versionamento de chave), tokens temporários de download, autenticação. |

## Atualização em tempo real e ordenação (listagem)

- **Aviso de nova denúncia:** sino no topo com contador, um toast ao chegar e
  uma barra "N nova(s) ocorrência(s) recebida(s) · Atualizar lista" acima da
  tabela. As novas ficam num buffer e só entram na lista quando o operador
  clica em Atualizar (evita a tabela "pular" enquanto se lê). Ao atualizar, os
  cards de métrica do dashboard também sobem. No protótipo isso é simulado; no
  painel real, a mesma rotina que dispara o e-mail à CIPEAD (item 3 do escopo)
  alimenta um **polling leve (~30s)** ou **Server-Sent Events/WebSocket**.
- **Ordenação no topo da coluna:** os cabeçalhos da tabela de ocorrências são
  clicáveis (Protocolo, Setor, Gravidade, Status, Evidências, Recebida), com
  indicador de direção (▲/▼) e `aria-sort`. Gravidade e Status ordenam pela
  ordem lógica (não alfabética) e Recebida por data/hora. No mobile, onde o
  cabeçalho vira card, há um seletor "Ordenar por" que reflete o mesmo estado.

## Campos recebidos do formulário público (OAB/RS)

O painel foi modelado para receber **exatamente** os campos do canal de
denúncias já aprovado. Mapeamento formulário → painel:

| Campo do formulário | Onde vive | Onde aparece no painel |
|---|---|---|
| Relato dos fatos *(obrigatório)* | `relato.relato` | Detalhe |
| Setor envolvido | `relato.setor` | Listagem, filtro, detalhe, gráfico |
| Quando ocorreu | `relato.quando_ocorreu` | Detalhe |
| Frequência | `relato.frequencia` | Detalhe |
| Gravidade *(obrigatório)* | `relato.gravidade` | Listagem, filtro, dashboard, detalhe |
| Tentou resolver antes | `relato.tentou_resolver` | Detalhe |
| Testemunhas | `relato.testemunhas` | Detalhe (com aviso de terceiros) |
| Documentos / Imagens / Áudio-vídeo | `arquivo` (categoria 1–4) | Detalhe (download por token) |
| Nome ou apelido | `contato.nome_enc` 🔒 | Tela Contatos |
| E-mail pessoal | `contato.email_enc` 🔒 | Tela Contatos |
| Telefone pessoal | `contato.telefone_enc` 🔒 | Tela Contatos |
| Vínculo com a OAB/RS | `contato.vinculo` | Tela Contatos |
| Declaração de boa-fé *(obrigatório)* | `relato.declaracao_boafe` | Detalhe (confirmação) |

Campos de contato são opcionais — denúncias anônimas simplesmente não geram
linha em `db_denuncia_contato`, e o painel mostra "sem dados de contato".

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
5a. **Campo "testemunhas":** por conter possíveis nomes de terceiros, deve ser
   cifrado em repouso como os dados de contato, ou basta a proteção de acesso
   do relato? (Hoje modelado em texto no relato, exibido só sob autenticação.)
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

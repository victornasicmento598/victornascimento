# CIPEAD — Estratégia de hash do protocolo e criptografia dos campos sensíveis

Documento de proposta para aprovação. Nada aqui está implementado ainda.

## 1. Hash do protocolo (ligação relato ↔ contato)

**Problema:** o espaço de protocolos é minúsculo e previsível (`DN-2026-000001`
até `DN-2026-999999` ≈ 10⁶ valores por ano). Um hash simples (SHA-256 puro)
seria quebrado por força bruta em segundos por qualquer pessoa com acesso a um
dump do banco — um DBA, um backup vazado — recriando a ligação entre relato e
identidade.

**Solução: HMAC-SHA256 com *pepper* secreto, fora do banco.**

```
hash_protocolo = HMAC-SHA256(chave = PEPPER_PROTOCOLO, mensagem = "DN-2026-000126")
                 → 64 caracteres hex, gravado em db_denuncia_contato.hash_protocolo
```

- `PEPPER_PROTOCOLO`: 32 bytes aleatórios (`random_bytes(32)`), armazenado
  **apenas** no ambiente da aplicação (variável de ambiente / secret manager /
  arquivo `0600` fora do webroot). Nunca no banco, nunca no repositório.
- Sem o pepper, o hash é incomputável: quem tem só o banco não consegue ligar
  contato a relato, nem por força bruta.
- Em PHP: `hash_hmac('sha256', $protocolo, $pepper)`.

**Fluxo de escrita (formulário):** gera protocolo → grava relato → calcula
HMAC → grava contato com o HMAC. Duas escritas, nenhuma FK.

**Fluxo de leitura (tela Contatos):** membro CIPEAD informa o protocolo →
middleware valida papel + registra auditoria → aplicação calcula o HMAC →
`SELECT ... WHERE hash_protocolo = ?`. A junção acontece **na aplicação**,
nunca em SQL.

## 2. Criptografia dos campos de identidade (repouso)

**Algoritmo:** AES-256-GCM (autenticado — detecta adulteração), um nonce
aleatório por campo, por escrita.

**Formato gravado no `VARBINARY`:**

```
[ key_version (1 byte) ][ nonce (12 bytes) ][ tag GCM (16 bytes) ][ ciphertext ]
```

- **Chave** `KEY_CONTATO_V1`: 32 bytes aleatórios, mesmo regime do pepper
  (ambiente da aplicação, nunca no banco/repositório). Pepper e chave são
  segredos **distintos**.
- **AAD (additional authenticated data):** usar o `hash_protocolo` como AAD ao
  cifrar. Isso amarra o ciphertext à linha: copiar `nome_enc` de um registro
  para outro invalida a decifração.
- **Rotação:** a coluna `key_version` permite introduzir `KEY_CONTATO_V2` e
  recifrar em lote sem downtime; o byte de versão no blob confirma a chave a
  usar na leitura.
- **Decifração sob demanda:** somente no endpoint da tela Contatos, depois do
  middleware de papel `CIPEAD` e **depois** do INSERT na auditoria. Nenhuma
  outra rota do sistema decifra esses campos; listagem, detalhe e dashboard
  nem sequer consultam a tabela.
- Em PHP: `sodium_crypto_aead_aes256gcm_*` (libsodium) ou
  `openssl_encrypt(..., 'aes-256-gcm', ...)`.

## 3. Defesas em camadas no banco

1. **Contas separadas:** o endpoint público usa `app_ingest` (só INSERT,
   `DENY SELECT` em contato); o painel usa `app_painel` (sem UPDATE/DELETE em
   contato e auditoria). Ver grants no `schema.sql`.
2. **Row-Level Security:** política que retorna zero linhas de
   `db_denuncia_contato` a menos que a sessão tenha
   `SESSION_CONTEXT('app_role') = 'CIPEAD'`, setado pelo middleware após
   autenticação. Mesmo um SQL injection no painel não lê contatos sem o
   contexto.
3. **Auditoria append-only:** aplicação sem permissão de UPDATE/DELETE;
   opcionalmente tabela LEDGER (SQL Server 2022+) para imutabilidade
   verificável.
4. **Sem FK entre contato e relato:** o isolamento é estrutural, não só de
   permissão.

## 3b. Campo "testemunhas" — cuidado de privacidade

O formulário coleta um campo livre de **testemunhas** (cargo/nome de quem
presenciou) dentro do passo de Relato. Ele **não é dado de contato do
denunciante** e por isso vive em `db_denuncia_relato`, não na tabela cifrada de
contato. Mas pode conter nomes de terceiros. Tratamento adotado:

- Exibido **apenas** na tela de detalhe do relato, sob autenticação e papel
  `CIPEAD` (mesma proteção do restante do relato).
- Sinalizado na interface com aviso de que pode conter identidade de terceiros.
- Não entra em listagem, dashboard nem em exportações.
- Decisão em aberto (ver README): avaliar se, juridicamente, esse campo deve
  também ser cifrado em repouso como os dados de contato.

## 4. Arquivos de evidência

- Gravados fora do webroot (ex.: `/var/uploads/AAAA/MM/<uuid>.bin`), nome
  aleatório, sem extensão original, permissão `0640` para o usuário do PHP.
- Validação **no backend**, por categoria (o form separa documento, imagem,
  áudio e vídeo): allowlist de MIME verificada por `finfo` (não pela extensão)
  e **limite de tamanho por categoria** — documento/imagem 20 MB, áudio 50 MB,
  vídeo 200 MB — além de contagem máxima por denúncia. Nunca confiar no
  `accept`/tamanho informado pelo frontend.
  - Documentos: PDF, DOC, DOCX, XLS, XLSX, TXT, CSV
  - Imagens: JPG, PNG, WebP, GIF
  - Áudio: MP3, WAV, M4A · Vídeo: MP4, MOV
- Download somente por token temporário: o painel pede um link → backend
  registra auditoria e emite token aleatório (32 bytes) com validade curta
  (ex.: 15 min), single-use, associado ao arquivo e ao usuário → endpoint de
  download valida o token e serve o arquivo com `Content-Disposition`.
  Nenhuma URL estável existe.

## 5. Autenticação e sessão do painel

- Login usuário/senha contra LDAP institucional quando disponível
  (`ldap_bind`); fallback local com `password_hash()` (bcrypt/argon2id) se o
  LDAP não estiver acessível no ambiente de hospedagem.
- Autorização por papel: só usuários na lista/grupo `CIPEAD` passam do
  middleware; a verificação roda **antes** de qualquer SELECT sensível.
- Sessão com cookie `HttpOnly; Secure; SameSite=Strict`, expiração por
  inatividade, CSRF token nas mutações, rate-limit no login.

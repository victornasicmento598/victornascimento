-- ============================================================================
-- CIPEAD — Canal de Denúncias
-- Schema SQL Server (proposta para aprovação — não executar em produção ainda)
--
-- Regra de ouro implementada no modelo:
--   * db_denuncia_relato NUNCA contém dados de identidade.
--   * db_denuncia_contato NÃO tem FK para o relato — a única ligação é o
--     HMAC-SHA256 do protocolo, calculado na aplicação com pepper secreto.
--   * Um JOIN simples entre as duas tabelas é impossível dentro do banco.
-- ============================================================================

------------------------------------------------------------------------------
-- 0. Sequence para o protocolo DN-YYYY-XXXXXX (gerado server-side no backend)
------------------------------------------------------------------------------
CREATE SEQUENCE dbo.seq_denuncia_protocolo
    AS INT START WITH 1 INCREMENT BY 1;
-- Backend monta: 'DN-' + YEAR(GETDATE()) + '-' + RIGHT('000000' + valor, 6)
-- A sequence é reiniciada a cada virada de ano por job administrativo
-- (ou usa-se uma sequence por ano). UNIQUE em protocolo garante a unicidade.

------------------------------------------------------------------------------
-- 1. RELATO — conteúdo da denúncia, SEM identidade
------------------------------------------------------------------------------
CREATE TABLE dbo.db_denuncia_relato (
    id            BIGINT IDENTITY(1,1) NOT NULL,
    protocolo     CHAR(14)      NOT NULL,          -- DN-YYYY-XXXXXX
    relato        NVARCHAR(MAX) NOT NULL,
    setor         NVARCHAR(120) NOT NULL,
    gravidade     TINYINT       NOT NULL,          -- 1 baixa · 2 média · 3 alta · 4 crítica
    status        TINYINT       NOT NULL
        CONSTRAINT DF_relato_status DEFAULT (1),   -- 1 pendente · 2 em análise · 3 resolvido
    criado_em     DATETIME2(0)  NOT NULL
        CONSTRAINT DF_relato_criado DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT PK_relato            PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_relato_protocolo  UNIQUE (protocolo),
    CONSTRAINT CK_relato_gravidade  CHECK (gravidade BETWEEN 1 AND 4),
    CONSTRAINT CK_relato_status     CHECK (status BETWEEN 1 AND 3),
    CONSTRAINT CK_relato_protocolo  CHECK (protocolo LIKE
        'DN-[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9]')
);

CREATE INDEX IX_relato_gravidade_data ON dbo.db_denuncia_relato (gravidade, criado_em DESC);
CREATE INDEX IX_relato_data           ON dbo.db_denuncia_relato (criado_em DESC);

------------------------------------------------------------------------------
-- 1b. ARQUIVOS de evidência (1:N com o relato; binário fica FORA do banco
--     e fora do webroot — aqui só metadados e o caminho interno)
------------------------------------------------------------------------------
CREATE TABLE dbo.db_denuncia_arquivo (
    id              BIGINT IDENTITY(1,1) NOT NULL,
    relato_id       BIGINT        NOT NULL,
    nome_original   NVARCHAR(255) NOT NULL,
    mime_type       VARCHAR(100)  NOT NULL,        -- validado no backend (allowlist)
    tamanho_bytes   BIGINT        NOT NULL,
    caminho_storage VARCHAR(400)  NOT NULL,        -- ex.: /var/uploads/2026/07/<uuid>.bin
    sha256_conteudo CHAR(64)      NOT NULL,        -- integridade do arquivo
    criado_em       DATETIME2(0)  NOT NULL
        CONSTRAINT DF_arquivo_criado DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT PK_arquivo PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_arquivo_relato FOREIGN KEY (relato_id)
        REFERENCES dbo.db_denuncia_relato (id)
);

CREATE INDEX IX_arquivo_relato ON dbo.db_denuncia_arquivo (relato_id);

------------------------------------------------------------------------------
-- 2. CONTATO — identidade do denunciante
--    * SEM foreign key para o relato (isolamento proposital).
--    * Chave de ligação = HMAC-SHA256(protocolo, pepper) em hex (64 chars).
--    * Campos pessoais cifrados na aplicação (AES-256-GCM) antes do INSERT:
--      VARBINARY = versão_chave(1) || nonce(12) || tag(16) || ciphertext.
------------------------------------------------------------------------------
CREATE TABLE dbo.db_denuncia_contato (
    id             BIGINT IDENTITY(1,1) NOT NULL,
    hash_protocolo CHAR(64)       NOT NULL,        -- HMAC-SHA256 hex, nunca o protocolo
    nome_enc       VARBINARY(560) NULL,
    email_enc      VARBINARY(560) NULL,
    telefone_enc   VARBINARY(280) NULL,
    vinculo        TINYINT        NULL,            -- 1 estudante · 2 servidor · 3 terceirizado · 4 externo
    key_version    SMALLINT       NOT NULL
        CONSTRAINT DF_contato_keyver DEFAULT (1),  -- suporta rotação de chave
    criado_em      DATETIME2(0)   NOT NULL
        CONSTRAINT DF_contato_criado DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT PK_contato         PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_contato_hash    UNIQUE (hash_protocolo),
    CONSTRAINT CK_contato_vinculo CHECK (vinculo BETWEEN 1 AND 4)
);
-- Denúncia anônima: simplesmente não há linha em db_denuncia_contato.

------------------------------------------------------------------------------
-- 3. AUDITORIA — trilha append-only de todo acesso do painel
------------------------------------------------------------------------------
CREATE TABLE dbo.db_auditoria (
    id          BIGINT IDENTITY(1,1) NOT NULL,
    usuario     NVARCHAR(120) NOT NULL,            -- login (LDAP) autenticado
    acao        VARCHAR(40)   NOT NULL,            -- LOGIN, LOGIN_FALHA, LIST_RELATOS,
                                                   -- VIEW_RELATO, DOWNLOAD_ARQUIVO,
                                                   -- VIEW_CONTATO, TOKEN_ARQUIVO_GERADO...
    protocolo   CHAR(14)      NULL,                -- quando a ação se refere a uma ocorrência
    detalhe     NVARCHAR(400) NULL,                -- ex.: id do arquivo baixado, filtros usados
    ip_origem   VARCHAR(45)   NULL,                -- IPv4/IPv6
    user_agent  NVARCHAR(300) NULL,
    ocorrido_em DATETIME2(0)  NOT NULL
        CONSTRAINT DF_auditoria_quando DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT PK_auditoria PRIMARY KEY CLUSTERED (id)
);

CREATE INDEX IX_auditoria_quando    ON dbo.db_auditoria (ocorrido_em DESC);
CREATE INDEX IX_auditoria_usuario   ON dbo.db_auditoria (usuario, ocorrido_em DESC);
CREATE INDEX IX_auditoria_protocolo ON dbo.db_auditoria (protocolo) WHERE protocolo IS NOT NULL;

-- Append-only: a conta da aplicação só pode inserir e ler.
-- (Em SQL Server 2022+, considerar CREATE TABLE ... WITH (LEDGER = ON)
--  para imutabilidade verificável criptograficamente.)

------------------------------------------------------------------------------
-- 4. CONTAS DE SERVIÇO com privilégio mínimo
--    Duas conexões distintas na aplicação:
--      app_ingest : usada SÓ pelo endpoint público do formulário
--      app_painel : usada SÓ pelo painel autenticado
------------------------------------------------------------------------------
-- conta do formulário público: só escreve, nunca lê
GRANT INSERT ON dbo.db_denuncia_relato   TO app_ingest;
GRANT INSERT ON dbo.db_denuncia_arquivo  TO app_ingest;
GRANT INSERT ON dbo.db_denuncia_contato  TO app_ingest;
DENY  SELECT, UPDATE, DELETE ON dbo.db_denuncia_contato TO app_ingest;

-- conta do painel: lê relatos, lê contato (sob RLS), escreve auditoria
GRANT SELECT ON dbo.db_denuncia_relato  TO app_painel;
GRANT SELECT ON dbo.db_denuncia_arquivo TO app_painel;
GRANT SELECT ON dbo.db_denuncia_contato TO app_painel;
GRANT UPDATE (status) ON dbo.db_denuncia_relato TO app_painel;
GRANT INSERT, SELECT ON dbo.db_auditoria TO app_painel;
DENY  UPDATE, DELETE ON dbo.db_auditoria TO app_painel;
DENY  UPDATE, DELETE ON dbo.db_denuncia_contato TO app_painel;

------------------------------------------------------------------------------
-- 5. ROW-LEVEL SECURITY na tabela de contato
--    O middleware PHP, após validar o papel do usuário logado, executa:
--      EXEC sp_set_session_context @key = N'app_role', @value = N'CIPEAD';
--    Sem esse contexto de sessão, qualquer SELECT em db_denuncia_contato
--    retorna zero linhas — mesmo que a query chegue ao banco.
------------------------------------------------------------------------------
CREATE SCHEMA seguranca;
GO
CREATE FUNCTION seguranca.fn_rls_somente_cipead (@stub BIT)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN
    SELECT 1 AS autorizado
    WHERE CAST(SESSION_CONTEXT(N'app_role') AS NVARCHAR(32)) = N'CIPEAD';
GO
CREATE SECURITY POLICY seguranca.pol_contato_cipead
    ADD FILTER PREDICATE seguranca.fn_rls_somente_cipead(1)
        ON dbo.db_denuncia_contato,
    ADD BLOCK  PREDICATE seguranca.fn_rls_somente_cipead(1)
        ON dbo.db_denuncia_contato AFTER INSERT
WITH (STATE = ON);

CREATE ROLE credential_api
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  INHERIT
  LOGIN;

ALTER USER credential_api with password 'credential_api';

CREATE SEQUENCE credential_id_sequence
  INCREMENT 1
  MINVALUE 1
  MAXVALUE 9223372036854775807
  START 6
  CACHE 1;

ALTER TABLE credential_id_sequence OWNER TO credential_api;

  -- Table: credentials_table

-- DROP TABLE credentials_table;

CREATE TABLE credentials_table
(
  username character varying(24),
  password character varying(48),
  server character varying(80),
  id bigint NOT NULL DEFAULT nextval('credential_id_sequence'::regclass),
  name character varying(80),
  tenant character varying(80),
  device character varying(42),
  CONSTRAINT credential_id PRIMARY KEY (id),
  CONSTRAINT username_and_password UNIQUE (username, password)
)
WITH (
  OIDS=FALSE
);
  
COMMENT ON TABLE credentials_table IS 'Credentials table';

-- Index: tenant_idx

-- DROP INDEX tenant_idx;

CREATE INDEX tenant_idx
  ON credentials_table
  USING btree
  (tenant COLLATE pg_catalog."default");

-- Index: username_and_password_idx

-- DROP INDEX username_and_password_idx;

CREATE INDEX username_and_password_idx
  ON credentials_table
  USING btree
  (username COLLATE pg_catalog."default", password COLLATE pg_catalog."default");

ALTER TABLE credentials_table OWNER TO credential_api;

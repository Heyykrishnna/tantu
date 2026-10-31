#!/bin/sh
set -e

MIGRATOR_PW="${MIGRATOR_PASSWORD:-migrator_dev_password}"
RUNTIME_PW="${RUNTIME_PASSWORD:-runtime_dev_password}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'tantu_migrator') THEN
      CREATE ROLE tantu_migrator WITH LOGIN PASSWORD '$MIGRATOR_PW' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'tantu_runtime') THEN
      CREATE ROLE tantu_runtime WITH LOGIN PASSWORD '$RUNTIME_PW' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
  END
  \$\$;
  SELECT 'CREATE DATABASE tantu OWNER tantu_migrator'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tantu')\gexec
EOSQL

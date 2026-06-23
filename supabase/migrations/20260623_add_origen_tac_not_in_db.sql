ALTER TABLE tacs_cargados DROP CONSTRAINT IF EXISTS tacs_cargados_origen_check;
ALTER TABLE tacs_cargados ADD CONSTRAINT tacs_cargados_origen_check CHECK (origen IN ('inventario', 'terceros', 'TAC is not in the database'));

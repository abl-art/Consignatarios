-- Seguros por Robo (oct 2026): certificados emitidos por venta, parámetros de
-- prima/ingreso vigentes, siniestros reportados por el cliente vía denuncia.
-- Sin RLS: patrón del repo es que sólo el service role escribe (vía API routes
-- que chequean sesión/rol admin en código, no en policies de Postgres).
--
-- Re-ejecutable: todo CREATE usa IF NOT EXISTS y los seeds usan ON CONFLICT DO NOTHING.

-- seguros_config: fila única de control (activo/inactivo del cobro de seguro).
CREATE TABLE IF NOT EXISTS seguros_config (
  id int PRIMARY KEY,
  activo boolean NOT NULL DEFAULT false,
  activado_at timestamptz
);

INSERT INTO seguros_config (id, activo) VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

-- seguros_parametros: porcentajes de prima (lo que se le cobra al cliente) y de
-- ingreso (lo que efectivamente queda como ingreso) vigentes desde una fecha.
CREATE TABLE IF NOT EXISTS seguros_parametros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('prima', 'ingreso')),
  porcentaje numeric NOT NULL,
  vigente_desde date NOT NULL,
  UNIQUE (tipo, vigente_desde)
);

INSERT INTO seguros_parametros (tipo, porcentaje, vigente_desde) VALUES
  ('prima', 2, '2026-01-01'),
  ('ingreso', 3, '2026-01-01')
ON CONFLICT (tipo, vigente_desde) DO NOTHING;

-- seguros_certificados: un certificado por venta asegurada. `numero` es el
-- correlativo visible en el certificado y queda null mientras está pendiente
-- de emisión (costo/suma todavía no determinados, p.ej. falta precio de lista).
CREATE TABLE IF NOT EXISTS seguros_certificados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero int UNIQUE,
  gocuotas_order_id text NOT NULL UNIQUE,
  store_order_id uuid,
  pedido_numero text,
  dni text,
  cliente text,
  domicilio text,
  cp text,
  localidad text,
  articulo text NOT NULL,
  imei text NOT NULL,
  costo_sin_iva numeric,
  suma_asegurada numeric,
  costo_fuente text CHECK (costo_fuente IN ('lista', 'inventario')),
  inicio_vig date NOT NULL,
  fin_vig date NOT NULL,
  fecha_anula date,
  motivo_anula text CHECK (motivo_anula IN ('descartada', 'contracargo')),
  fecha_siniestro date,
  estado text NOT NULL DEFAULT 'emitido' CHECK (estado IN ('emitido', 'pendiente')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- seguros_siniestros: denuncias de robo cargadas por el cliente, referidas al
-- certificado de la venta.
CREATE TABLE IF NOT EXISTS seguros_siniestros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificado_id uuid NOT NULL REFERENCES seguros_certificados(id),
  dni_ingresado text NOT NULL,
  archivo_path text NOT NULL,
  estado text NOT NULL DEFAULT 'nuevo' CHECK (estado IN ('nuevo', 'en_gestion', 'reclamado', 'resuelto_positivo', 'resuelto_negativo')),
  fecha_robo date,
  monto_reconocido numeric,
  nota text,
  created_at timestamptz DEFAULT now(),
  resuelto_at timestamptz
);

-- seguros_emitir: inserción en lote de certificados. Numera secuencialmente
-- (MAX(numero)+1) sólo las filas que ya tienen suma_asegurada; las que no la
-- tienen quedan con numero null y estado 'pendiente' para numerar después vía
-- seguros_emitir_pendiente. El advisory lock serializa la numeración entre
-- llamadas concurrentes. Dedupe por gocuotas_order_id (ON CONFLICT DO NOTHING).
-- Devuelve la cantidad de filas efectivamente insertadas.
CREATE OR REPLACE FUNCTION seguros_emitir(certs jsonb)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  cert jsonb;
  next_numero int;
  insertados int := 0;
  v_inserted_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(815001);

  SELECT COALESCE(MAX(numero), 0) INTO next_numero FROM seguros_certificados;

  FOR cert IN SELECT * FROM jsonb_array_elements(certs)
  LOOP
    IF (cert ->> 'suma_asegurada') IS NOT NULL THEN
      next_numero := next_numero + 1;
    END IF;

    INSERT INTO seguros_certificados (
      numero,
      gocuotas_order_id,
      store_order_id,
      pedido_numero,
      dni,
      cliente,
      domicilio,
      cp,
      localidad,
      articulo,
      imei,
      costo_sin_iva,
      suma_asegurada,
      costo_fuente,
      inicio_vig,
      fin_vig,
      estado
    )
    VALUES (
      CASE WHEN (cert ->> 'suma_asegurada') IS NOT NULL THEN next_numero ELSE NULL END,
      cert ->> 'gocuotas_order_id',
      (cert ->> 'store_order_id')::uuid,
      cert ->> 'pedido_numero',
      cert ->> 'dni',
      cert ->> 'cliente',
      cert ->> 'domicilio',
      cert ->> 'cp',
      cert ->> 'localidad',
      cert ->> 'articulo',
      cert ->> 'imei',
      (cert ->> 'costo_sin_iva')::numeric,
      (cert ->> 'suma_asegurada')::numeric,
      cert ->> 'costo_fuente',
      (cert ->> 'inicio_vig')::date,
      (cert ->> 'fin_vig')::date,
      CASE WHEN (cert ->> 'suma_asegurada') IS NOT NULL THEN 'emitido' ELSE 'pendiente' END
    )
    ON CONFLICT (gocuotas_order_id) DO NOTHING
    RETURNING id INTO v_inserted_id;

    IF v_inserted_id IS NOT NULL THEN
      insertados := insertados + 1;
    ELSIF (cert ->> 'suma_asegurada') IS NOT NULL THEN
      -- La fila ya existía (dedupe): no consumimos el número reservado.
      next_numero := next_numero - 1;
    END IF;

    v_inserted_id := NULL;
  END LOOP;

  RETURN insertados;
END;
$$;

-- seguros_emitir_pendiente: completa un certificado que había quedado
-- pendiente (sin costo/suma determinados al momento de la venta). Asigna el
-- siguiente número bajo el mismo advisory lock que seguros_emitir y pasa el
-- estado a 'emitido'. Guardado por estado = 'pendiente': si el cert_id no
-- existe o ya fue emitido, el UPDATE no afecta filas y la función devuelve
-- false sin tocar numero/costo/suma (evita doble emisión / número huérfano
-- en llamadas repetidas o con id inválido).
DROP FUNCTION IF EXISTS seguros_emitir_pendiente(uuid, numeric, numeric, text);

CREATE OR REPLACE FUNCTION seguros_emitir_pendiente(cert_id uuid, costo numeric, suma numeric, fuente text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  next_numero int;
  filas_afectadas int;
BEGIN
  PERFORM pg_advisory_xact_lock(815001);

  SELECT COALESCE(MAX(numero), 0) + 1 INTO next_numero FROM seguros_certificados;

  UPDATE seguros_certificados
  SET numero = next_numero,
      costo_sin_iva = costo,
      suma_asegurada = suma,
      costo_fuente = fuente,
      estado = 'emitido',
      updated_at = now()
  WHERE id = cert_id AND estado = 'pendiente';

  GET DIAGNOSTICS filas_afectadas = ROW_COUNT;
  RETURN filas_afectadas > 0;
END;
$$;

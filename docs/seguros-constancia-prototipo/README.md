# Prototipos etapa 2b — Constancia de cobertura + mail al cliente

Enviados como prueba a Emiliano el 29/10/2026 (certificado de prueba N°1).

- `constancia-prueba.mjs`: genera el PDF de la constancia replicando el modelo
  Sancor ("Robo — Constancia de Cobertura") + IMEI (que el modelo no trae).
  Modelo original: Downloads/jk13zbfw.lan.pdf (asegurado BRITO, póliza 2980394).
- `mail-cliente-prueba.mjs`: mail HTML al cliente (constancia adjunta + pasos
  ante robo: denuncia policial CON IMEI + link al formulario).

BLOQUEADO hasta respuesta del broker: n° de póliza colectiva, significado del
campo Ref (¿nuestro correlativo?), formato Sancor vs marca GOcelular, y si
"ubicación del riesgo" = domicilio de envío. Al integrarlo al sync real:
mover la generación a lib/ con tests, mandar a store_orders.customer_email,
reintento si falla el mail (spec §Etapa 2b).

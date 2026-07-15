-- Agregar estado 'mayorista' al enum estado_dispositivo
ALTER TYPE estado_dispositivo ADD VALUE IF NOT EXISTS 'mayorista';

-- Las plantillas (Granja, Herbolario) y sus imagenes de muestra se retiran del producto.
-- Las fichas u objetos que las usaban se quedan sin imagen (muestran el color o el icono).
DELETE FROM images WHERE origin = 'muestra';

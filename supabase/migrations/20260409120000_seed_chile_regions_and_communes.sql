-- ============================================================================
-- Chile: todas las regiones + comunas del listado operativo.
-- - Ciudad cabecera (referencia principal por región): is_active = true
-- - Demás comunas del listado: is_active = false (activar desde admin)
-- - Región VI: ya existe; solo se insertan comunas nuevas (Rancagua intacta).
-- Idempotente: (country_id, code) en regiones; (region_id, slug) en ciudades.
-- ============================================================================

-- Regiones (omitir VI si ya está)
INSERT INTO public.geo_regions (country_id, code, name, is_active)
SELECT c.id, v.code, v.name, true
FROM public.geo_countries c
CROSS JOIN (
  VALUES
    ('XV', 'Región de Arica y Parinacota'),
    ('I', 'Región de Tarapacá'),
    ('II', 'Región de Antofagasta'),
    ('III', 'Región de Atacama'),
    ('IV', 'Región de Coquimbo'),
    ('V', 'Región de Valparaíso'),
    ('XIII', 'Región Metropolitana de Santiago'),
    ('VII', 'Región del Maule'),
    ('XVI', 'Región de Ñuble'),
    ('VIII', 'Región del Biobío'),
    ('IX', 'Región de La Araucanía'),
    ('XIV', 'Región de Los Ríos'),
    ('X', 'Región de Los Lagos'),
    ('XI', 'Región de Aysén'),
    ('XII', 'Región de Magallanes')
) AS v(code, name)
WHERE c.iso_code = 'cl'
  AND NOT EXISTS (
    SELECT 1
    FROM public.geo_regions r
    WHERE r.country_id = c.id
      AND r.code = v.code
  );

-- Comunas por región (slug único por región)
INSERT INTO public.geo_cities (region_id, name, slug, is_active)
SELECT r.id, x.name, x.slug, x.is_active
FROM public.geo_regions r
JOIN public.geo_countries co ON co.id = r.country_id AND co.iso_code = 'cl'
JOIN (
  VALUES
    -- XV
    ('XV', 'Arica', 'arica', true),
    ('XV', 'Camarones', 'camarones', false),
    ('XV', 'Putre', 'putre', false),
    ('XV', 'General Lagos', 'general-lagos', false),
    -- I
    ('I', 'Iquique', 'iquique', true),
    ('I', 'Alto Hospicio', 'alto-hospicio', false),
    ('I', 'Pozo Almonte', 'pozo-almonte', false),
    ('I', 'Pica', 'pica', false),
    ('I', 'Huara', 'huara', false),
    ('I', 'Camiña', 'camina', false),
    ('I', 'Colchane', 'colchane', false),
    -- II
    ('II', 'Antofagasta', 'antofagasta', true),
    ('II', 'Mejillones', 'mejillones', false),
    ('II', 'Sierra Gorda', 'sierra-gorda', false),
    ('II', 'Taltal', 'taltal', false),
    ('II', 'Calama', 'calama', false),
    ('II', 'Ollagüe', 'ollague', false),
    ('II', 'San Pedro de Atacama', 'san-pedro-de-atacama', false),
    ('II', 'Tocopilla', 'tocopilla', false),
    ('II', 'María Elena', 'maria-elena', false),
    -- III
    ('III', 'Copiapó', 'copiapo', true),
    ('III', 'Caldera', 'caldera', false),
    ('III', 'Tierra Amarilla', 'tierra-amarilla', false),
    ('III', 'Chañaral', 'chanaral', false),
    ('III', 'Diego de Almagro', 'diego-de-almagro', false),
    ('III', 'Vallenar', 'vallenar', false),
    ('III', 'Freirina', 'freirina', false),
    ('III', 'Huasco', 'huasco', false),
    ('III', 'Alto del Carmen', 'alto-del-carmen', false),
    -- IV
    ('IV', 'La Serena', 'la-serena', true),
    ('IV', 'Coquimbo', 'coquimbo', false),
    ('IV', 'Ovalle', 'ovalle', false),
    ('IV', 'Illapel', 'illapel', false),
    ('IV', 'Salamanca', 'salamanca', false),
    ('IV', 'Vicuña', 'vicuna', false),
    ('IV', 'Los Vilos', 'los-vilos', false),
    ('IV', 'Andacollo', 'andacollo', false),
    ('IV', 'Monte Patria', 'monte-patria', false),
    ('IV', 'Punitaqui', 'punitaqui', false),
    -- V
    ('V', 'Valparaíso', 'valparaiso', true),
    ('V', 'Viña del Mar', 'vina-del-mar', false),
    ('V', 'Quilpué', 'quilpue', false),
    ('V', 'Villa Alemana', 'villa-alemana', false),
    ('V', 'San Antonio', 'san-antonio', false),
    ('V', 'Quillota', 'quillota', false),
    ('V', 'Los Andes', 'los-andes', false),
    ('V', 'La Calera', 'la-calera', false),
    ('V', 'Limache', 'limache', false),
    ('V', 'Casablanca', 'casablanca', false),
    -- XIII RM
    ('XIII', 'Santiago', 'santiago', true),
    ('XIII', 'Las Condes', 'las-condes', false),
    ('XIII', 'Providencia', 'providencia', false),
    ('XIII', 'Maipú', 'maipu', false),
    ('XIII', 'Puente Alto', 'puente-alto', false),
    ('XIII', 'Ñuñoa', 'nunoa', false),
    ('XIII', 'La Florida', 'la-florida', false),
    ('XIII', 'San Bernardo', 'san-bernardo', false),
    ('XIII', 'Pudahuel', 'pudahuel', false),
    ('XIII', 'Peñalolén', 'penalolen', false),
    -- VI (cabeceras extra activas; resto comunas inactivas; Rancagua ya en seed)
    ('VI', 'Machalí', 'machali', true),
    ('VI', 'Graneros', 'graneros', true),
    ('VI', 'San Fernando', 'san-fernando', false),
    ('VI', 'Santa Cruz', 'santa-cruz', false),
    ('VI', 'Pichilemu', 'pichilemu', false),
    ('VI', 'Rengo', 'rengo', false),
    ('VI', 'Chimbarongo', 'chimbarongo', false),
    ('VI', 'San Vicente', 'san-vicente', false),
    ('VI', 'Litueche', 'litueche', false),
    -- VII
    ('VII', 'Talca', 'talca', true),
    ('VII', 'Curicó', 'curico', false),
    ('VII', 'Linares', 'linares', false),
    ('VII', 'Cauquenes', 'cauquenes', false),
    ('VII', 'Constitución', 'constitucion', false),
    ('VII', 'Molina', 'molina', false),
    ('VII', 'Parral', 'parral', false),
    ('VII', 'San Javier', 'san-javier', false),
    ('VII', 'Teno', 'teno', false),
    ('VII', 'Colbún', 'colbun', false),
    -- XVI
    ('XVI', 'Chillán', 'chillan', true),
    ('XVI', 'Chillán Viejo', 'chillan-viejo', false),
    ('XVI', 'San Carlos', 'san-carlos', false),
    ('XVI', 'Bulnes', 'bulnes', false),
    ('XVI', 'Quirihue', 'quirihue', false),
    ('XVI', 'Yungay', 'yungay', false),
    ('XVI', 'Coelemu', 'coelemu', false),
    ('XVI', 'Pinto', 'pinto', false),
    ('XVI', 'San Ignacio', 'san-ignacio', false),
    ('XVI', 'El Carmen', 'el-carmen', false),
    -- VIII
    ('VIII', 'Concepción', 'concepcion', true),
    ('VIII', 'Talcahuano', 'talcahuano', false),
    ('VIII', 'Los Ángeles', 'los-angeles', false),
    ('VIII', 'Coronel', 'coronel', false),
    ('VIII', 'San Pedro de la Paz', 'san-pedro-de-la-paz', false),
    ('VIII', 'Hualpén', 'hualpen', false),
    ('VIII', 'Lota', 'lota', false),
    ('VIII', 'Chiguayante', 'chiguayante', false),
    ('VIII', 'Tomé', 'tome', false),
    ('VIII', 'Arauco', 'arauco', false),
    -- IX
    ('IX', 'Temuco', 'temuco', true),
    ('IX', 'Padre Las Casas', 'padre-las-casas', false),
    ('IX', 'Angol', 'angol', false),
    ('IX', 'Villarrica', 'villarrica', false),
    ('IX', 'Pucón', 'pucon', false),
    ('IX', 'Lautaro', 'lautaro', false),
    ('IX', 'Victoria', 'victoria', false),
    ('IX', 'Nueva Imperial', 'nueva-imperial', false),
    ('IX', 'Carahue', 'carahue', false),
    ('IX', 'Loncoche', 'loncoche', false),
    -- XIV
    ('XIV', 'Valdivia', 'valdivia', true),
    ('XIV', 'La Unión', 'la-union', false),
    ('XIV', 'Río Bueno', 'rio-bueno', false),
    ('XIV', 'Panguipulli', 'panguipulli', false),
    ('XIV', 'Los Lagos', 'los-lagos', false),
    ('XIV', 'Paillaco', 'paillaco', false),
    ('XIV', 'Futrono', 'futrono', false),
    ('XIV', 'Lago Ranco', 'lago-ranco', false),
    ('XIV', 'Máfil', 'mafil', false),
    ('XIV', 'Corral', 'corral', false),
    -- X
    ('X', 'Puerto Montt', 'puerto-montt', true),
    ('X', 'Osorno', 'osorno', false),
    ('X', 'Castro', 'castro', false),
    ('X', 'Ancud', 'ancud', false),
    ('X', 'Puerto Varas', 'puerto-varas', false),
    ('X', 'Quellón', 'quellon', false),
    ('X', 'Calbuco', 'calbuco', false),
    ('X', 'Frutillar', 'frutillar', false),
    ('X', 'Llanquihue', 'llanquihue', false),
    ('X', 'Chonchi', 'chonchi', false),
    -- XI
    ('XI', 'Coyhaique', 'coyhaique', true),
    ('XI', 'Aysén', 'aysen', false),
    ('XI', 'Chile Chico', 'chile-chico', false),
    ('XI', 'Cochrane', 'cochrane', false),
    ('XI', 'Cisnes', 'cisnes', false),
    ('XI', 'Río Ibáñez', 'rio-ibanez', false),
    ('XI', 'Tortel', 'tortel', false),
    -- XII
    ('XII', 'Punta Arenas', 'punta-arenas', true),
    ('XII', 'Puerto Natales', 'puerto-natales', false),
    ('XII', 'Porvenir', 'porvenir', false),
    ('XII', 'Cabo de Hornos', 'cabo-de-hornos', false),
    ('XII', 'Primavera', 'primavera', false),
    ('XII', 'Timaukel', 'timaukel', false),
    ('XII', 'Laguna Blanca', 'laguna-blanca', false),
    ('XII', 'San Gregorio', 'san-gregorio', false),
    ('XII', 'Río Verde', 'rio-verde', false),
    ('XII', 'Torres del Paine', 'torres-del-paine', false)
) AS x(region_code, name, slug, is_active)
  ON r.code = x.region_code
WHERE NOT EXISTS (
  SELECT 1
  FROM public.geo_cities g
  WHERE g.region_id = r.id
    AND g.slug = x.slug
);

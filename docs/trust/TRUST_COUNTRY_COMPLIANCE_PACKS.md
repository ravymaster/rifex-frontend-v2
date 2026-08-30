# Trust — Country Compliance Packs (investigación comparativa, sin habilitar países)

**Chile continúa siendo el único país operativo autorizado.** Este documento es investigación comparativa para diseñar `country compliance packs` como una estructura de datos/configuración separada por país — ningún país aquí queda habilitado por este documento. Mismo patrón ya existente en el código real: `src/lib/countryPolicy.js` ya modela `enabled`/`devOnly` por país para Rifas/Colectas/Mercado Pago/Eventos — Trust debe extender esa misma estructura, no inventar una paralela.

## Estructura propuesta de un `country compliance pack`

```text
{
  country_code,
  documentos_identidad_aceptados: [...],
  edad_minima_legal_general,       // edad de mayoría de edad civil del país
  edad_minima_rifex,               // política Rifex (18, igual en todos los países salvo razón legal para subirla)
  ley_privacidad: { nombre, año, autoridad_reguladora },
  comercio_electronico: { retracto, informacion_previa },
  rifas_sorteos: { marco_legal, autoridad, requiere_persona_juridica },
  colectas: { marco_legal, autoridad },
  eventos: { marco_legal_relevante },
  biometria: { permitida, condiciones },
  retencion_default,
  requiere_abogado_local: [...],   // lista explícita de puntos sin resolver
}
```

## Chile (operativo — referencia base)

Ver `TRUST_LEGAL_PRIVACY_MATRIX_CHILE.md` para el detalle completo. Resumen: Ley 19.628 (vigente) + Ley 21.719 (vigencia plena 1-dic-2026), rifas/colectas bajo Ley 10.262 (zona gris para personas naturales), edad mínima civil 18.

## Argentina (`devOnly`, per `countryPolicy.js` — ya modelado como no habilitado en el código real)

- **Ley de protección de datos**: Ley 25.326 (Ley de Protección de los Datos Personales) — Argentina cuenta con decisión de adecuación de la Unión Europea, es decir, la UE reconoce su nivel de protección como equivalente al propio, señal indirecta de que el marco es maduro. Fuente: búsqueda comparativa, agosto 2026.
- Existe un proyecto de ley más reciente en discusión en el Congreso argentino (`argentina.gob.ar`, `hcdn.gob.ar`) — **no confirmado si fue aprobado** a la fecha de este documento; requiere verificación puntual antes de cualquier decisión.
- El código ya documenta que Mercado Pago Argentina no tiene *adapter* real listo (`providerRegistry.js`, `ADAPTER_READY`) — Trust para Argentina depende de esa misma infraestructura de pagos, no solo de compliance de datos.
- `requiere_abogado_local`: marco de rifas/sorteos argentino (posiblemente regulado por lotería/juegos de azar provincial, no verificado en esta sesión), estado del proyecto de ley de datos personales.

## Perú

- **Ley de protección de datos**: Ley 29733 (Ley de Protección de Datos Personales).
- `requiere_abogado_local`: marco específico de rifas/sorteos y colectas peruano no investigado en esta sesión.

## Colombia

- **Ley de protección de datos**: Ley 1581 de 2012 (Régimen General de Protección de Datos Personales), con su decreto reglamentario asociado (no verificado en detalle en esta sesión).
- `requiere_abogado_local`: marco de rifas/sorteos colombiano (Colombia tiene un régimen de juegos de suerte y azar con una autoridad reguladora propia, Coljuegos — mencionado por conocimiento general, **no verificado con fuente oficial en esta sesión**, debe confirmarse antes de cualquier expansión).

## Uruguay

- **Ley de protección de datos**: Ley 18.331 (Protección de Datos Personales y Acción de Habeas Data) — igual que Argentina, Uruguay cuenta con decisión de adecuación de la UE.
- `requiere_abogado_local`: marco de rifas/sorteos uruguayo no investigado en esta sesión.

## Brasil

- **Ley de protección de datos**: LGPD — Lei Geral de Proteção de Dados Pessoais (Lei 13.709/2018) — ampliamente documentada internacionalmente, con autoridad reguladora propia (ANPD). Brasil también cuenta con decisión de adecuación de la UE según los resultados de esta búsqueda.
- Brasil tiene idioma (portugués) y complejidad fiscal/regulatoria significativamente distinta al resto de la lista — cualquier expansión ahí probablemente requiere el mayor esfuerzo de adaptación de la lista.
- `requiere_abogado_local`: marco de rifas/sorteos brasileño (Brasil históricamente ha tenido restricciones fuertes sobre juegos de azar, con cambios regulatorios recientes en apuestas — **no verificado en esta sesión, alta prioridad de revisión antes de considerar Brasil**).

## Conclusión de esta investigación

Ningún país de esta lista fue verificado con el mismo nivel de profundidad que Chile en `TRUST_LEGAL_PRIVACY_MATRIX_CHILE.md` — esto es intencional, dado el alcance de esta misión ("Investiga comparativamente, sin habilitar países"). Antes de habilitar cualquiera de estos países operativamente, cada uno necesita su propia investigación dedicada al mismo nivel de rigor que Chile, más revisión de abogado local — no debe asumirse que el patrón de Trust chileno se traslada sin cambios.

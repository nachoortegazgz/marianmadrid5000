# REGLAS DE WORKFLOW — MARIAN MADRID

## Ciclo de Entrega Obligatorio
Cada cambio debe seguir esta secuencia:
1. Rama aislada
2. Análisis de impacto
3. Modificación mínima
4. Pruebas estáticas
5. Regresiones
6. Simulación determinista
7. Local Editor
8. Preview
9. Revisión de diferencias

## Formato de Respuesta Requerido
Para cada tarea, Cline debe responder con:
1. **Diagnóstico:** Qué se está analizando
2. **Plan mínimo:** Pasos necesarios
3. **Cambios propuestos:** Código o configuración
4. **Pruebas:** Cómo verificar
5. **Riesgos:** Qué puede fallar
6. **Validación manual:** Qué comprobar en Wix Editor

## Reglas de Modificación
- No modificar más de lo necesario
- No refactorizar sin justificación
- No eliminar código sin confirmar dependencias
- No cambiar lógica de negocio sin aprobación
- No tocar colecciones inmutables
- No exponer secretos

## Reglas de Generación de Código
- Generar código completo, no fragmentos
- Incluir imports necesarios
- Incluir manejo de errores
- Incluir comentarios explicativos
- Seguir nomenclatura canónica
- Usar constantes de internalConfig.js
- Usar helpers de mmUtils.js

## Reglas de Depuración
- Analizar el error antes de proponer solución
- Identificar la causa raíz
- Proponer solución mínima
- No introducir nuevos bugs
- Mantener compatibilidad con código existente

## Reglas de Documentación
- Documentar funciones complejas
- Documentar decisiones de diseño
- Documentar limitaciones conocidas
- Mantener comentarios actualizados

## Prohibiciones en Workflow
- No publicar sin pruebas
- No modificar producción directamente
- No saltar el ciclo de entrega
- No ignorar errores de validación
- No aprobar código sin evidencia
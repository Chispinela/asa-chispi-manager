# Validación de ASA Chispi Manager

## Pruebas de la versión 1.0.7

- La suite de lógica e integración local cubre archivos INI, configuración de acceso, SteamCMD, RCON, historial de jugadores, copias de seguridad, plantillas, el lector de guardados y las tarjetas de Discord. La prueba de interfaz verifica que se puede poner, conservar y quitar la contraseña de entrada de un servidor ya creado.
- Las pruebas de interfaz usan perfiles, rutas y datos ficticios. Recorren los seis idiomas y los dos temas, y comprueban la edición INI, la importación, los horarios, las plantillas y el formulario de Discord.
- La galería se captura desde la aplicación con dos perfiles de demostración. La salida de SteamCMD de la galería es de ejemplo.
- Se comprobó con una instalación real de The Island la descarga de los archivos de ASA mediante SteamCMD, el arranque y la respuesta de RCON. En Discord se comprobó que el bot editaba su propio panel, mostraba el mismo recuento que RCON cuando el servidor estaba vacío y conservaba sus imágenes al actualizar. Un mensaje de Discord llegó al registro de chat del servidor de prueba.

## Alcance

Los fixtures de jugadores, clúster, importación y lector de guardados cubren el comportamiento del manager con datos controlados. Para comprobar la entrada de un jugador, los nombres visibles, el chat en pantalla o las transferencias, usa un cliente conectado y una copia recuperable de tu mundo. La lectura de personajes y tribus depende del formato y de los registros disponibles en el guardado.

## Repetir las pruebas y las capturas

~~~powershell
npm test
npm run test:ui
npm run test:players
npm run test:steam-ui
npm run test:startup
node scripts/capture-screenshots.cjs
~~~

Prepara el lector y las dependencias con las instrucciones del [README](../README.md). Los resultados locales de las pruebas se guardan en `test-results/`.
